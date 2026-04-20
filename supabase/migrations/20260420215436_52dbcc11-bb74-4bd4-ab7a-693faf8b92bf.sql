
CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  player1_name text,
  player2_name text,
  player1_secret integer[] NOT NULL,
  player2_secret integer[] NOT NULL,
  player1_guesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  player2_guesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_position_for_p1 integer NOT NULL DEFAULT 0,
  current_position_for_p2 integer NOT NULL DEFAULT 0,
  current_turn integer NOT NULL DEFAULT 1,
  winner integer,
  status text NOT NULL DEFAULT 'waiting',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- Public view that hides secrets
CREATE VIEW public.games_public
WITH (security_invoker=on) AS
SELECT id, code, player1_name, player2_name,
       player1_guesses, player2_guesses,
       current_position_for_p1, current_position_for_p2,
       current_turn, winner, status, created_at, updated_at
FROM public.games;

-- Deny direct SELECT on base table (secrets stay hidden)
CREATE POLICY "no direct select" ON public.games FOR SELECT USING (false);

-- Anyone can create a game
CREATE POLICY "anyone can insert" ON public.games FOR INSERT WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
ALTER TABLE public.games REPLICA IDENTITY FULL;

-- RPC to join a game by code
CREATE OR REPLACE FUNCTION public.join_game(_code text, _name text, _secret integer[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.games;
BEGIN
  IF array_length(_secret, 1) <> 4 THEN
    RAISE EXCEPTION 'secret must have 4 digits';
  END IF;
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
        status = 'playing',
        updated_at = now()
    WHERE id = g.id;
  RETURN g.id;
END;
$$;

-- RPC to make a guess
CREATE OR REPLACE FUNCTION public.make_guess(_game_id uuid, _player integer, _guess integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'game not found'; END IF;
  IF g.status <> 'playing' THEN RAISE EXCEPTION 'game not active'; END IF;
  IF g.current_turn <> _player THEN RAISE EXCEPTION 'not your turn'; END IF;
  IF _guess < 0 OR _guess > 9 THEN RAISE EXCEPTION 'invalid guess'; END IF;

  IF _player = 1 THEN
    target_secret := g.player2_secret;
    pos := g.current_position_for_p1;
  ELSE
    target_secret := g.player1_secret;
    pos := g.current_position_for_p2;
  END IF;

  actual := target_secret[pos + 1]; -- pg arrays 1-indexed
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

  -- Append guess to history
  IF _player = 1 THEN
    new_guesses := g.player1_guesses || jsonb_build_object('position', pos, 'guess', _guess, 'hint', hint);
  ELSE
    new_guesses := g.player2_guesses || jsonb_build_object('position', pos, 'guess', _guess, 'hint', hint);
  END IF;

  -- Win check
  new_winner := g.winner;
  new_status := g.status;
  IF correct AND new_pos >= 4 THEN
    new_winner := _player;
    new_status := 'finished';
  END IF;

  -- Turn passes only on miss
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
$$;

GRANT EXECUTE ON FUNCTION public.join_game(text, text, integer[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.make_guess(uuid, integer, integer) TO anon, authenticated;
GRANT SELECT ON public.games_public TO anon, authenticated;
