
DROP POLICY "anyone can insert" ON public.games;

CREATE POLICY "validated insert" ON public.games FOR INSERT
WITH CHECK (
  player1_name IS NOT NULL
  AND length(player1_name) BETWEEN 1 AND 30
  AND array_length(player1_secret, 1) = 4
  AND array_length(player2_secret, 1) = 4
  AND code IS NOT NULL
  AND length(code) BETWEEN 4 AND 10
);
