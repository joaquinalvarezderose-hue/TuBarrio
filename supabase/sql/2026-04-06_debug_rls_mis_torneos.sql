-- Debug y fix de RLS para pantalla "Mis Torneos"
-- Ejecutar por bloques en Supabase SQL Editor

-- 1) Chequeo simple: ver policies existentes en tablas clave
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'torneo_jugadores',
    'partidos',
    'torneo_estado',
    'inscripciones_torneo',
    'perfiles',
    'torneos'
  )
ORDER BY tablename, policyname;

-- 2) Chequeo objetivo: confirma si existe policy SELECT por tabla
SELECT
  t.tabla,
  EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = t.tabla
      AND p.cmd = 'SELECT'
  ) AS tiene_select_policy
FROM (
  VALUES
    ('torneo_jugadores'),
    ('partidos'),
    ('torneo_estado'),
    ('inscripciones_torneo'),
    ('perfiles'),
    ('torneos')
) AS t(tabla)
ORDER BY t.tabla;

-- 3) Fix idempotente: crea policies faltantes para lectura
BEGIN;

DROP POLICY IF EXISTS torneo_jugadores_select_own ON public.torneo_jugadores;
DROP POLICY IF EXISTS torneo_jugadores_select_visible_scope ON public.torneo_jugadores;
CREATE POLICY torneo_jugadores_select_visible_scope
ON public.torneo_jugadores
FOR SELECT
TO authenticated
USING (
  perfil_id = auth.uid()
  OR is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.inscripciones_torneo it
    WHERE it.torneo_id = torneo_jugadores.torneo_id
      AND it.perfil_id = auth.uid()
      AND it.estado IN ('pagado_aprobado', 'pendiente_revision')
  )
  OR EXISTS (
    SELECT 1
    FROM public.partidos p
    WHERE p.torneo_id = torneo_jugadores.torneo_id
      AND coalesce(p.categoria, '') = coalesce(torneo_jugadores.categoria, '')
      AND coalesce(p.grupo, '') = coalesce(torneo_jugadores.grupo, '')
      AND (p.jugador1_id = auth.uid() OR p.jugador2_id = auth.uid())
  )
);

DROP POLICY IF EXISTS partidos_select_own ON public.partidos;
CREATE POLICY partidos_select_own
ON public.partidos
FOR SELECT
TO authenticated
USING (
  jugador1_id = auth.uid()
  OR jugador2_id = auth.uid()
  OR is_admin()
);

DROP POLICY IF EXISTS torneo_estado_select_authenticated ON public.torneo_estado;
CREATE POLICY torneo_estado_select_authenticated
ON public.torneo_estado
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can select their own perfil" ON public.perfiles;
DROP POLICY IF EXISTS perfiles_select_authenticated ON public.perfiles;
CREATE POLICY perfiles_select_authenticated
ON public.perfiles
FOR SELECT
TO authenticated
USING (true);

COMMIT;

-- 4) Re-validacion: repetir chequeo objetivo
SELECT
  t.tabla,
  EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = t.tabla
      AND p.cmd = 'SELECT'
  ) AS tiene_select_policy
FROM (
  VALUES
    ('torneo_jugadores'),
    ('partidos'),
    ('torneo_estado'),
    ('inscripciones_torneo'),
    ('perfiles'),
    ('torneos')
) AS t(tabla)
ORDER BY t.tabla;
