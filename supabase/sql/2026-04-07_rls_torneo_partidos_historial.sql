-- RLS policies para torneo_partidos_historial
-- Ejecutar en Supabase SQL Editor

BEGIN;

-- 1) Habilitar RLS en la tabla si no está habilitado
ALTER TABLE public.torneo_partidos_historial ENABLE ROW LEVEL SECURITY;

-- 2) Crear política SELECT: usuarios pueden ver un historial si fueron participantes del partido
DROP POLICY IF EXISTS historial_select_own ON public.torneo_partidos_historial;
CREATE POLICY historial_select_own
ON public.torneo_partidos_historial
FOR SELECT
TO authenticated
USING (
  -- Usuario es uno de los jugadores
  jugador1_perfil_id = auth.uid()
  OR jugador2_perfil_id = auth.uid()
  -- O es admin
  OR is_admin()
);

-- 3) Crear política INSERT: RPCs pueden insertar directamente via SECURITY DEFINER
--    Para restricciones manuales via frontend, usuarios solo pueden insertar si son participantes
DROP POLICY IF EXISTS historial_insert_own ON public.torneo_partidos_historial;
CREATE POLICY historial_insert_own
ON public.torneo_partidos_historial
FOR INSERT
TO authenticated
WITH CHECK (
  jugador1_perfil_id = auth.uid()
  OR jugador2_perfil_id = auth.uid()
  OR is_admin()
);

COMMIT;

-- Verificación (opcional, ejecutar en bloque separado para ver el estado)
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'torneo_partidos_historial'
ORDER BY policyname;
