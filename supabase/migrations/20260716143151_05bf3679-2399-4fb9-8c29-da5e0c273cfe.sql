
DROP FUNCTION IF EXISTS public.reconnect_game(text, text);

CREATE OR REPLACE FUNCTION public.reconnect_game(_code text, _name text, _token uuid)
 RETURNS TABLE(game_id uuid, player integer, token uuid, secret integer[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  g public.games;
BEGIN
  IF _token IS NULL THEN
    RAISE EXCEPTION 'missing session token';
  END IF;

  SELECT * INTO g FROM public.games WHERE code = upper(_code);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found';
  END IF;

  IF lower(coalesce(g.player1_name, '')) = lower(_name)
     AND g.player1_token IS NOT NULL
     AND g.player1_token = _token THEN
    RETURN QUERY SELECT g.id, 1, g.player1_token, g.player1_secret;
  ELSIF lower(coalesce(g.player2_name, '')) = lower(_name)
     AND g.player2_token IS NOT NULL
     AND g.player2_token = _token THEN
    RETURN QUERY SELECT g.id, 2, g.player2_token, g.player2_secret;
  ELSE
    RAISE EXCEPTION 'invalid session token for this player';
  END IF;
END;
$function$;
