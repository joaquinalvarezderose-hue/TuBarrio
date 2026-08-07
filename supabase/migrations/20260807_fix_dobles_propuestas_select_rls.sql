-- La policy SELECT de torneo_propuestas_partido solo reconocia participantes de
-- singles (partidos.jugador1_id/jugador2_id), que siempre son NULL en partidos de
-- dobles. Por eso ningun integrante de ninguno de los dos equipos podia leer la
-- propuesta de un partido de dobles, y el frontend caia siempre en el estado
-- "esperando confirmacion del rival" para ambos lados (bug reportado: pruebatorneo20
-- y pruebatorneo30, torneo dobles, ambas pantallas mostraban "esperando confirmacion").
DROP POLICY IF EXISTS torneo_propuestas_select_participante_or_admin ON public.torneo_propuestas_partido;

CREATE POLICY torneo_propuestas_select_participante_or_admin
ON public.torneo_propuestas_partido
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.partidos p
    WHERE p.id = torneo_propuestas_partido.partido_id
      AND (
        p.jugador1_id = auth.uid()
        OR p.jugador2_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.torneo_equipos te
          WHERE te.id IN (p.equipo1_id, p.equipo2_id)
            AND (te.jugador1_id = auth.uid() OR te.jugador2_id = auth.uid())
        )
      )
  )
  OR public.is_admin()
);
