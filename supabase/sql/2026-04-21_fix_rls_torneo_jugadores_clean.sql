-- Fix: Limpiar y reinstalar correctamente la política RLS de torneo_jugadores

-- 1) Ver TODAS las políticas existentes en torneo_jugadores
SELECT policyname, cmd, roles 
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'torneo_jugadores'
ORDER BY policyname;

-- 2) Eliminar TODAS las políticas anteriores
DROP POLICY IF EXISTS "torneo_jugadores_select_visible_scope" ON public.torneo_jugadores;
DROP POLICY IF EXISTS "torneo_jugadores_select_own" ON public.torneo_jugadores;

-- 3) Crear NUEVA política - Simple y clara
-- Usuario puede ver jugadores si:
-- - Es ese jugador mismo, O
-- - Es admin, O
-- - Está inscrito en el mismo torneo
CREATE POLICY torneo_jugadores_read
ON public.torneo_jugadores
FOR SELECT
TO authenticated
USING (
  perfil_id = auth.uid()
  OR public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.inscripciones_torneo it
    WHERE it.torneo_id = torneo_jugadores.torneo_id
      AND it.perfil_id = auth.uid()
      AND it.estado IN ('pagado_aprobado', 'pendiente_revision')
  )
);

-- 4) Verificar que ahora hay solo 1 política
SELECT policyname, cmd, roles 
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'torneo_jugadores'
ORDER BY policyname;

-- 5) Test: simular vista como usuario autenticado
-- Esta query simula lo que ve un usuario del torneo 3
SELECT 
  grupo,
  count(*) as jugadores_visibles
FROM public.torneo_jugadores
WHERE torneo_id = 3
  AND categoria = 'Singles Caballeros'
GROUP BY grupo
ORDER BY grupo;
