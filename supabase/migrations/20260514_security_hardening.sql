-- ============================================================
-- SECURITY HARDENING — 2026-05-14
--
-- Aborda los siguientes hallazgos de la auditoría:
--
--   CRÍTICO #4 — Regresión RLS en `partidos` (USING (true))
--   CRÍTICO #5 — Tablas con RLS habilitado sin políticas
--                (marketplace_servicios, torneo_grupos)
--   CRÍTICO #6 — Funciones SECURITY DEFINER con search_path mutable
--                (6 funciones detectadas en pg_proc)
--   ALTO    #7 — torneo_propuestas_partido expuesta a `anon`
--   ALTO    #8 — GRANT SELECT en inscripciones_torneo a `anon`
--   MEDIO   #9 — Vista perfiles_publicos (defensa en profundidad)
--
-- Migración idempotente: re-ejecutable sin efectos colaterales.
-- ============================================================


-- ============================================================
-- 1. CRÍTICO #4 — Restaurar RLS estricta en `partidos`
--    (revertir el USING (true) que metió 20260504_complete_stage_name_fix.sql)
-- ============================================================

DROP POLICY IF EXISTS "partidos_select_autenticado"          ON public.partidos;
DROP POLICY IF EXISTS "partidos_select_admin"                ON public.partidos;
DROP POLICY IF EXISTS "partidos_select_participante"         ON public.partidos;
DROP POLICY IF EXISTS "partidos_select_all"                  ON public.partidos;
DROP POLICY IF EXISTS "partidos_select_torneos_participante" ON public.partidos;

CREATE POLICY "partidos_select_torneos_participante"
  ON public.partidos
  FOR SELECT
  TO authenticated
  USING (
    -- Sos uno de los jugadores del partido
    jugador1_id = auth.uid()
    OR jugador2_id = auth.uid()
    -- O estás inscripto en el torneo (necesario para ver el bracket completo)
    OR EXISTS (
      SELECT 1 FROM public.torneo_jugadores tj
      WHERE tj.torneo_id = partidos.torneo_id
        AND tj.perfil_id = auth.uid()
    )
    -- O sos admin/organizador
    OR public.is_admin()
  );


-- ============================================================
-- 2. CRÍTICO #5 — Políticas explícitas para `marketplace_servicios`
--    Columna del dueño: `proveedor_id uuid`
-- ============================================================

DROP POLICY IF EXISTS "marketplace_select_authenticated" ON public.marketplace_servicios;
DROP POLICY IF EXISTS "marketplace_insert_own"           ON public.marketplace_servicios;
DROP POLICY IF EXISTS "marketplace_update_own"           ON public.marketplace_servicios;
DROP POLICY IF EXISTS "marketplace_delete_own_or_admin"  ON public.marketplace_servicios;

CREATE POLICY "marketplace_select_authenticated"
  ON public.marketplace_servicios
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "marketplace_insert_own"
  ON public.marketplace_servicios
  FOR INSERT
  TO authenticated
  WITH CHECK (proveedor_id = auth.uid());

CREATE POLICY "marketplace_update_own"
  ON public.marketplace_servicios
  FOR UPDATE
  TO authenticated
  USING      (proveedor_id = auth.uid())
  WITH CHECK (proveedor_id = auth.uid()); -- previene reasignación a otro dueño

CREATE POLICY "marketplace_delete_own_or_admin"
  ON public.marketplace_servicios
  FOR DELETE
  TO authenticated
  USING (proveedor_id = auth.uid() OR public.is_admin());


-- ============================================================
-- 3. CRÍTICO #5 — Políticas explícitas para `torneo_grupos`
--    (catálogo de grupos administrado por admin/organizador)
-- ============================================================

DROP POLICY IF EXISTS "torneo_grupos_select_authenticated" ON public.torneo_grupos;
DROP POLICY IF EXISTS "torneo_grupos_admin_insert"         ON public.torneo_grupos;
DROP POLICY IF EXISTS "torneo_grupos_admin_update"         ON public.torneo_grupos;
DROP POLICY IF EXISTS "torneo_grupos_admin_delete"         ON public.torneo_grupos;

CREATE POLICY "torneo_grupos_select_authenticated"
  ON public.torneo_grupos
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "torneo_grupos_admin_insert"
  ON public.torneo_grupos
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "torneo_grupos_admin_update"
  ON public.torneo_grupos
  FOR UPDATE
  TO authenticated
  USING      (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "torneo_grupos_admin_delete"
  ON public.torneo_grupos
  FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ============================================================
-- 4. CRÍTICO #6 — Fijar search_path en funciones SECURITY DEFINER
--    Lint Supabase 0011: function_search_path_mutable
-- ============================================================

ALTER FUNCTION public.calculate_stage_name(bigint, integer)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.enviar_resultado_seguro(uuid, uuid, integer, integer, integer, integer, integer, integer)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.promover_ganador_bracket()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.reparar_bracket_existente(bigint, text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.update_stage_name_for_partidos()
  SET search_path = public, pg_temp;

-- reset_password_test_user: función de testing. Si NO se usa en prod,
-- borrarla con `DROP FUNCTION public.reset_password_test_user(text);`.
-- Mientras tanto, al menos fijar el search_path:
ALTER FUNCTION public.reset_password_test_user(text)
  SET search_path = public, pg_temp;


-- ============================================================
-- 5. ALTO #7 — Quitar acceso anon a torneo_propuestas_partido
-- ============================================================

DROP POLICY IF EXISTS "torneo_propuestas_select_todos"               ON public.torneo_propuestas_partido;
DROP POLICY IF EXISTS "torneo_propuestas_select_participante_or_admin" ON public.torneo_propuestas_partido;

CREATE POLICY "torneo_propuestas_select_participante_or_admin"
  ON public.torneo_propuestas_partido
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.partidos p
      WHERE p.id = torneo_propuestas_partido.partido_id
        AND (p.jugador1_id = auth.uid() OR p.jugador2_id = auth.uid())
    )
    OR public.is_admin()
  );


-- ============================================================
-- 6. ALTO #8 — Revocar grants a anon en inscripciones_torneo
-- ============================================================

REVOKE ALL ON public.inscripciones_torneo FROM anon;


-- ============================================================
-- 7. MEDIO #9 — Vista de perfiles públicos (defensa en profundidad)
--    Reduce exposición de email/WhatsApp a usuarios no relacionados.
--
-- USO EN EL FRONTEND:
--   Para listados de jugadores ajenos: SELECT * FROM perfiles_publicos
--   Para el propio perfil del usuario: SELECT * FROM perfiles WHERE id = auth.uid()
-- ============================================================

DROP VIEW IF EXISTS public.perfiles_publicos;

CREATE VIEW public.perfiles_publicos
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.nombre_completo,
  -- email solo visible a admin o al propio usuario
  CASE
    WHEN public.is_admin() OR p.id = auth.uid() THEN p.email
    ELSE NULL
  END AS email,
  -- WhatsApp visible a rivales (mismo partido), admin o al propio usuario
  CASE
    WHEN public.is_admin() OR p.id = auth.uid() THEN p.whatsapp
    WHEN EXISTS (
      SELECT 1 FROM public.partidos m
      WHERE (m.jugador1_id = p.id AND m.jugador2_id = auth.uid())
         OR (m.jugador2_id = p.id AND m.jugador1_id = auth.uid())
    ) THEN p.whatsapp
    ELSE NULL
  END AS whatsapp,
  p.direccion,
  p.rol,
  p.created_at
FROM public.perfiles p;

GRANT SELECT ON public.perfiles_publicos TO authenticated;


-- ============================================================
-- 8. Constraints de formato — defensa en profundidad
--    (la validación Zod del frontend es solo UX; estos CHECKs
--    son la verdad de datos en la BD)
-- ============================================================

-- WhatsApp en formato E.164 argentino (+549XXXXXXXXXX) o NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'perfiles_whatsapp_e164_chk'
  ) THEN
    ALTER TABLE public.perfiles
      ADD CONSTRAINT perfiles_whatsapp_e164_chk
      CHECK (whatsapp IS NULL OR whatsapp ~ '^\+549\d{10}$')
      NOT VALID;  -- NOT VALID = no chequea filas existentes (pueden tener formato viejo)
  END IF;
END $$;

-- Email siempre en lowercase (evita duplicados por case sensitivity)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'perfiles_email_lower_chk'
  ) THEN
    ALTER TABLE public.perfiles
      ADD CONSTRAINT perfiles_email_lower_chk
      CHECK (email IS NULL OR email = lower(email))
      NOT VALID;
  END IF;
END $$;


-- ============================================================
-- VERIFICACIONES (informativas — no rompen la migración)
-- ============================================================

DO $$
DECLARE
  v_partidos_open INTEGER;
  v_no_path INTEGER;
  v_marketplace_pol INTEGER;
  v_grupos_pol INTEGER;
BEGIN
  -- Verificar que no quede USING(true) abierta en partidos
  SELECT count(*) INTO v_partidos_open
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'partidos'
    AND cmd = 'SELECT'
    AND qual = 'true';

  IF v_partidos_open > 0 THEN
    RAISE WARNING 'Aún existen % policies SELECT con USING(true) en partidos', v_partidos_open;
  END IF;

  -- Funciones sin search_path
  SELECT count(*) INTO v_no_path
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.prosecdef = true AND p.proconfig IS NULL;

  IF v_no_path > 0 THEN
    RAISE WARNING 'Aún quedan % funciones SECURITY DEFINER sin search_path', v_no_path;
  END IF;

  -- Tablas sin policies
  SELECT count(*) INTO v_marketplace_pol FROM pg_policies
  WHERE schemaname='public' AND tablename='marketplace_servicios';
  SELECT count(*) INTO v_grupos_pol FROM pg_policies
  WHERE schemaname='public' AND tablename='torneo_grupos';

  RAISE NOTICE 'Hardening completado. partidos_select_abiertas=%, funciones_sin_path=%, marketplace_policies=%, grupos_policies=%',
    v_partidos_open, v_no_path, v_marketplace_pol, v_grupos_pol;
END $$;
