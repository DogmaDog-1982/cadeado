-- 1. Add private per-player tokens
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS player1_token uuid,
  ADD COLUMN IF NOT EXISTS player2_token uuid;

-- 2. Drop the overly-permissive SELECT policy that exposed secrets
DROP POLICY IF EXISTS "Anyone can read games" ON public.games;
DROP POLICY IF EXISTS "no direct select" ON public.games;

CREATE POLICY "anon read non-sensitive columns"
  ON public.games
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 3. Column-level lockdown: anon/authenticated cannot SELECT the secret or token columns directly.
REVOKE SELECT ON public.games FROM anon, authenticated;
GRANT SELECT (
  id, code, player1_name, player2_name,
  player1_guesses, player2_guesses,
  current_position_for_p1, current_position_for_p2,
  current_turn, winner, status, created_at, updated_at
) ON public.games TO anon, authenticated;

-- 4. Make the realtime publication exclude the secret/token columns entirely
ALTER PUBLICATION supabase_realtime DROP TABLE public.games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.games (
  id, code, player1_name, player2_name,
  player1_guesses, player2_guesses,
  current_position_for_p1, current_position_for_p2,
  current_turn, winner, status, created_at, updated_at
);

-- 5. Recreate games_public view (security_invoker), exposing only safe columns
DROP VIEW IF EXISTS public.games_public;
CREATE VIEW public.games_public
WITH (security_invoker = true)
AS
SELECT
  id, code, player1_name, player2_name,
  player1_guesses, player2_guesses,
  current_position_for_p1, current_position_for_p2,
  current_turn, winner, status, created_at, updated_at
FROM public.games;

GRANT SELECT ON public.games_public TO anon, authenticated;

-- 6. Drop old function signatures so we can change return types
DROP FUNCTION IF EXISTS public.create_game(text, integer[]);
DROP FUNCTION IF EXISTS public.join_game(text, text, integer[]);
DROP FUNCTION IF EXISTS public.reconnect_game(text, text);
DROP FUNCTION IF EXISTS public.make_guess(uuid, integer, integer);

-- 7. create_game: validate digits, issue token
CREATE FUNCTION public.create_game(_name text, _secret integer[])
 RETURNS TABLE(id uuid, code text, token uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_id uuid;
  new_code text;
  new_token uuid := gen_random_uuid();
  attempts int := 0;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
  d int;
  placeholder integer[] := ARRAY[0,0,0,0];
BEGIN
  IF _name IS NULL OR length(_name) < 1 OR length(_name) > 30 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;
  IF array_length(_secret, 1) <> 4 THEN
    RAISE EXCEPTION 'secret must have 4 digits';
  END IF;
  FOREACH d IN ARRAY _secret LOOP
    IF d < 0 OR d > 9 THEN
      RAISE EXCEPTION 'secret digits must be between 0 and 9';
    END IF;
  END LOOP;

  LOOP
    new_code := '';
    FOR i IN 1..5 LOOP
      new_code := new_code || substr(chars, floor(random()*length(chars))::int + 1, 1);
    END LOOP;
    BEGIN
      INSERT INTO public.games (code, player1_name, player1_secret, player2_secret, player1_token)
      VALUES (new_code, _name, _secret, placeholder, new_token)
      RETURNING games.id INTO new_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      attempts := attempts + 1;
      IF attempts > 5 THEN RAISE; END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT new_id, new_code, new_token;
END;
$function$;

-- 8. join_game: validate digits, issue token
CREATE FUNCTION public.join_game(_code text, _name text, _secret integer[])
 RETURNS TABLE(game_id uuid, token uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  g public.games;
  new_token uuid := gen_random_uuid();
  d int;
BEGIN
  IF _name IS NULL OR length(_name) < 1 OR length(_name) > 30 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;
  IF array_length(_secret, 1) <> 4 THEN
    RAISE EXCEPTION 'secret must have 4 digits';
  END IF;
  FOREACH d IN ARRAY _secret LOOP
    IF d < 0 OR d > 9 THEN
      RAISE EXCEPTION 'secret digits must be between 0 and 9';
    END IF;
  END LOOP;

  SELECT * INTO g FROM public.games WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found';
  END IF;
  IF g.player2_name IS NOT NULL THEN
    RAISE EXCEPTION 'game full';
  END IF;
  UPDATE public.games
    SET player2_name = _name,
        player2_secret = _secret,
        player2_token = new_token,
        status = 'playing',
        updated_at = now()
    WHERE id = g.id;

  RETURN QUERY SELECT g.id, new_token;
END;
$function$;

-- 9. reconnect_game: returns the player's existing token and secret
CREATE FUNCTION public.reconnect_game(_code text, _name text)
 RETURNS TABLE(game_id uuid, player integer, token uuid, secret integer[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  g public.games;
BEGIN
  SELECT * INTO g FROM public.games WHERE code = upper(_code);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found';
  END IF;

  IF lower(coalesce(g.player1_name, '')) = lower(_name) THEN
    RETURN QUERY SELECT g.id, 1, g.player1_token, g.player1_secret;
  ELSIF lower(coalesce(g.player2_name, '')) = lower(_name) THEN
    RETURN QUERY SELECT g.id, 2, g.player2_token, g.player2_secret;
  ELSE
    RAISE EXCEPTION 'name does not match any player in this room';
  END IF;
END;
$function$;

-- 10. make_guess: requires the player's token
CREATE FUNCTION public.make_guess(_game_id uuid, _player integer, _guess integer, _token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  g public.games;
  target_secret integer[];
  pos integer;
  actual integer;
  hint text;
  correct boolean;
  new_guesses jsonb;
  new_pos integer;
  next_turn integer;
  new_winner integer;
  new_status text;
  expected_token uuid;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'game not found'; END IF;
  IF g.status <> 'playing' THEN RAISE EXCEPTION 'game not active'; END IF;
  IF _player NOT IN (1, 2) THEN RAISE EXCEPTION 'invalid player'; END IF;

  expected_token := CASE WHEN _player = 1 THEN g.player1_token ELSE g.player2_token END;
  IF expected_token IS NULL OR _token IS NULL OR expected_token <> _token THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF g.current_turn <> _player THEN RAISE EXCEPTION 'not your turn'; END IF;
  IF _guess < 0 OR _guess > 9 THEN RAISE EXCEPTION 'invalid guess'; END IF;

  IF _player = 1 THEN
    target_secret := g.player2_secret;
    pos := g.current_position_for_p1;
  ELSE
    target_secret := g.player1_secret;
    pos := g.current_position_for_p2;
  END IF;

  actual := target_secret[pos + 1];
  IF _guess = actual THEN
    correct := true;
    hint := 'correct';
    new_pos := pos + 1;
  ELSIF _guess < actual THEN
    correct := false;
    hint := 'higher';
    new_pos := pos;
  ELSE
    correct := false;
    hint := 'lower';
    new_pos := pos;
  END IF;

  IF _player = 1 THEN
    new_guesses := g.player1_guesses || jsonb_build_object('position', pos, 'guess', _guess, 'hint', hint);
  ELSE
    new_guesses := g.player2_guesses || jsonb_build_object('position', pos, 'guess', _guess, 'hint', hint);
  END IF;

  new_winner := g.winner;
  new_status := g.status;
  IF correct AND new_pos >= 4 THEN
    new_winner := _player;
    new_status := 'finished';
  END IF;

  IF correct THEN
    next_turn := _player;
  ELSE
    next_turn := CASE WHEN _player = 1 THEN 2 ELSE 1 END;
  END IF;

  IF _player = 1 THEN
    UPDATE public.games SET
      player1_guesses = new_guesses,
      current_position_for_p1 = new_pos,
      current_turn = next_turn,
      winner = new_winner,
      status = new_status,
      updated_at = now()
    WHERE id = _game_id;
  ELSE
    UPDATE public.games SET
      player2_guesses = new_guesses,
      current_position_for_p2 = new_pos,
      current_turn = next_turn,
      winner = new_winner,
      status = new_status,
      updated_at = now()
    WHERE id = _game_id;
  END IF;

  RETURN jsonb_build_object('correct', correct, 'hint', hint);
END;
$function$;