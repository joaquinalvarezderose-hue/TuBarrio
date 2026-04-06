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
CREATE POLICY torneo_jugadores_select_own
ON public.torneo_jugadores
FOR SELECT
TO authenticated
USING (perfil_id = auth.uid() OR is_admin());

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
