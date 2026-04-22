-- The table had REPLICA IDENTITY FULL from an older migration, which conflicts
-- with the restricted realtime publication column list and blocks updates.
ALTER TABLE public.games REPLICA IDENTITY DEFAULT;

-- Re-assert the safe realtime publication column list.
ALTER PUBLICATION supabase_realtime DROP TABLE public.games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.games (
  id, code, player1_name, player2_name,
  player1_guesses, player2_guesses,
  current_position_for_p1, current_position_for_p2,
  current_turn, winner, status, created_at, updated_at
);