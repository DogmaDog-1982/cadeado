-- Restore the minimum table privileges required by SECURITY DEFINER game functions
GRANT INSERT, UPDATE ON TABLE public.games TO postgres, anon, authenticated;

-- Keep direct reads locked down to non-sensitive columns only
REVOKE SELECT ON public.games FROM anon, authenticated;
GRANT SELECT (
  id, code, player1_name, player2_name,
  player1_guesses, player2_guesses,
  current_position_for_p1, current_position_for_p2,
  current_turn, winner, status, created_at, updated_at
) ON public.games TO anon, authenticated;

-- Ensure RPCs remain callable after the security hardening migration
GRANT EXECUTE ON FUNCTION public.create_game(text, integer[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_game(text, text, integer[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconnect_game(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.make_guess(uuid, integer, integer, uuid) TO anon, authenticated;