CREATE OR REPLACE FUNCTION public.reconnect_game(_code text, _name text)
RETURNS TABLE(game_id uuid, player integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.games;
BEGIN
  SELECT * INTO g FROM public.games WHERE code = upper(_code);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found';
  END IF;

  IF lower(coalesce(g.player1_name, '')) = lower(_name) THEN
    RETURN QUERY SELECT g.id, 1;
  ELSIF lower(coalesce(g.player2_name, '')) = lower(_name) THEN
    RETURN QUERY SELECT g.id, 2;
  ELSE
    RAISE EXCEPTION 'name does not match any player in this room';
  END IF;
END;
$$;