-- Restrict column-level SELECT so secrets/tokens are never returned to clients
REVOKE SELECT ON public.games FROM anon, authenticated;
GRANT SELECT (
  id, code, player1_name, player2_name,
  player1_guesses, player2_guesses,
  current_position_for_p1, current_position_for_p2,
  current_turn, winner, status, created_at, updated_at
) ON public.games TO anon, authenticated;
GRANT ALL ON public.games TO service_role;

-- Explicitly block direct UPDATE/DELETE from clients (all mutations must go through SECURITY DEFINER RPCs)
DROP POLICY IF EXISTS "no direct updates" ON public.games;
DROP POLICY IF EXISTS "no direct deletes" ON public.games;
CREATE POLICY "no direct updates" ON public.games AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no direct deletes" ON public.games AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- Lock down SECURITY DEFINER function EXECUTE: only allow the specific RPCs the app calls
REVOKE ALL ON FUNCTION public.create_game(text, integer[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.join_game(text, text, integer[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconnect_game(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.make_guess(uuid, integer, integer, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_game(text, integer[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_game(text, text, integer[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconnect_game(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.make_guess(uuid, integer, integer, uuid) TO anon, authenticated;