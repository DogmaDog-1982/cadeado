-- Permitir leitura pública da tabela games (a view games_public já oculta os segredos)
DROP POLICY IF EXISTS "Anyone can read games" ON public.games;
CREATE POLICY "Anyone can read games"
ON public.games
FOR SELECT
TO anon, authenticated
USING (true);