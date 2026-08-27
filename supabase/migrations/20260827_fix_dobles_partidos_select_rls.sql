-- La policy SELECT de partidos solo reconocia participantes de singles
-- (jugador1_id/jugador2_id), que siempre son NULL en partidos de dobles (usan
-- equipo1_id/equipo2_id + torneo_equipos.jugador1_id/jugador2_id). Como ademas
-- los torneos de dobles no cargan filas en torneo_jugadores (esa tabla es
-- exclusiva de singles), el EXISTS de respaldo tampoco cubria a nadie.
-- Resultado: NINGUN jugador de dobles podia leer sus propios partidos -> la app
-- mostraba "Todavia no hay un partido generado" aunque el cruce ya existiera
-- (reportado por Florencia Caffarini, torneo 27 "Segunda Categoria" dobles).
-- Mismo patron ya corregido en torneo_propuestas_partido, ver
-- 20260807_fix_dobles_propuestas_select_rls.sql.
DROP POLICY IF EXISTS partidos_select_torneos_participante ON public.partidos;

CREATE POLICY partidos_select_torneos_participante
ON public.partidos
FOR SELECT
TO authenticated
USING (
  jugador1_id = auth.uid()
  OR jugador2_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.torneo_jugadores tj
    WHERE tj.torneo_id = partidos.torneo_id
      AND tj.perfil_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.torneo_equipos te
    WHERE te.id IN (partidos.equipo1_id, partidos.equipo2_id)
      AND (te.jugador1_id = auth.uid() OR te.jugador2_id = auth.uid())
  )
  OR public.is_admin()
);
