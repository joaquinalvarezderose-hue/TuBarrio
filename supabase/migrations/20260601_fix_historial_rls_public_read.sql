-- Permitir a cualquier usuario autenticado leer el historial de partidos.
-- Los resultados de torneo son información pública dentro de la app.
-- Antes: solo los participantes del partido podían leer su historial → usuarios
-- de terceros veían "No hay resultado registrado" aunque el resultado existía.
DROP POLICY IF EXISTS historial_select_own ON public.torneo_partidos_historial;
CREATE POLICY historial_select_autenticado
ON public.torneo_partidos_historial
FOR SELECT
TO authenticated
USING (true);
