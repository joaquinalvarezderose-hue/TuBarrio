-- RLS Policy for viewing bracket/playoff matches
-- Allows all authenticated users to view playoff matches for tournaments they participate in

-- Drop existing select policy if it exists and is too restrictive
DROP POLICY IF EXISTS "partidos_select_participante" ON public.partidos;
DROP POLICY IF EXISTS "partidos_select_all" ON public.partidos;

-- Create a new policy that allows viewing:
-- 1. All matches where user is a player (existing behavior)
-- 2. All bracket/playoff matches for tournaments the user participates in
-- 3. All matches for public tournaments (optional)
CREATE POLICY "partidos_select_torneos_participante"
  ON public.partidos
  FOR SELECT
  TO authenticated
  USING (
    -- User is a player in this match
    (jugador1_id = auth.uid() OR jugador2_id = auth.uid())
    OR
    -- OR it's a bracket match and user participates in the tournament
    (
      bracket_tipo IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.torneo_jugadores tj
        WHERE tj.torneo_id = partidos.torneo_id
          AND tj.perfil_id = auth.uid()
      )
    )
  );

-- Also allow authenticated users to view any match (simpler but less restrictive)
-- Uncomment this if the above is too complex:
-- CREATE POLICY "partidos_select_authenticated"
--   ON public.partidos
--   FOR SELECT
--   TO authenticated
--   USING (true);

-- Alternative: Service role bypass for admin queries
-- The app could use service_role key for bracket queries
