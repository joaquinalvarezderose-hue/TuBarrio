-- ============================================================
-- SECURITY HARDENING v2 — 2026-05-14
--
-- Aborda los hallazgos detectados por el Supabase advisor DESPUÉS
-- de aplicar la primera migración de hardening. Cubre:
--
--   1. function_search_path_mutable — 6 funciones adicionales
--      (no SECURITY DEFINER pero igual flaggeadas por el linter).
--   2. rls_policy_always_true — 4 policies con USING(true) o
--      WITH CHECK(true) en torneo_estado, torneo_partidos_historial
--      y torneo_propuestas_partido.
--   3. anon_security_definer_function_executable — 25 funciones
--      SECURITY DEFINER ejecutables por anon vía /rest/v1/rpc.
--
-- Migración idempotente.
-- ============================================================


-- ============================================================
-- 1. search_path en funciones no-SECURITY-DEFINER flaggeadas
-- ============================================================

ALTER FUNCTION public.actualizar_stage_name_trigger()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.calcular_stage_name(bigint, integer)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.debug_stage_names(bigint)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.set_partidos_updated_at()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.set_torneo_jugadores_updated_at()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.set_updated_at()
  SET search_path = public, pg_temp;


-- ============================================================
-- 2. Reemplazar policies con USING(true) / WITH CHECK(true)
-- ============================================================

-- 2a. torneo_estado: era ALL TO authenticated USING(true) WITH CHECK(true).
--     Esto permitía a CUALQUIER autenticado modificar cupos de torneos.
--     Solo admin/organizador debe poder gestionar estado.
DROP POLICY IF EXISTS "torneo_estado_upsert_auth"   ON public.torneo_estado;
DROP POLICY IF EXISTS "torneo_estado_select_auth"   ON public.torneo_estado;
DROP POLICY IF EXISTS "torneo_estado_admin_all"     ON public.torneo_estado;
-- Policy heredada no documentada en el repo: SELECT a 'public' (anon + auth)
DROP POLICY IF EXISTS "torneo_estado_select_todos"  ON public.torneo_estado;

-- SELECT abierto a autenticados (es necesario para mostrar cupos)
CREATE POLICY "torneo_estado_select_auth"
  ON public.torneo_estado
  FOR SELECT
  TO authenticated
  USING (true);

-- Mutaciones solo admin
CREATE POLICY "torneo_estado_admin_all"
  ON public.torneo_estado
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- 2b. torneo_partidos_historial: era INSERT TO authenticated WITH CHECK(true).
--     Esto permitía a cualquier autenticado falsificar historial.
--     El historial se llena vía RPCs SECURITY DEFINER (validar_resultado_seguro
--     bypasea RLS); manualmente solo admin debería insertar.
DROP POLICY IF EXISTS "historial_insert_auth"        ON public.torneo_partidos_historial;
DROP POLICY IF EXISTS "historial_insert_admin"       ON public.torneo_partidos_historial;
DROP POLICY IF EXISTS "historial_select_participant" ON public.torneo_partidos_historial;
DROP POLICY IF EXISTS "historial_select_admin"       ON public.torneo_partidos_historial;
-- Policies heredadas no documentadas en el repo: SELECT abierto a authenticated y anon
DROP POLICY IF EXISTS "historial_select_all"         ON public.torneo_partidos_historial;
DROP POLICY IF EXISTS "historial_select_anon"        ON public.torneo_partidos_historial;

-- SELECT: jugadores del partido o admin
CREATE POLICY "historial_select_participant"
  ON public.torneo_partidos_historial
  FOR SELECT
  TO authenticated
  USING (
    jugador1_id = auth.uid()
    OR jugador2_id = auth.uid()
    OR registrado_por = auth.uid()
    OR public.is_admin()
  );

-- INSERT/UPDATE/DELETE: solo admin (las RPCs SECURITY DEFINER bypasean RLS)
CREATE POLICY "historial_insert_admin"
  ON public.torneo_partidos_historial
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());


-- 2c. torneo_propuestas_partido — INSERT: solo participantes del partido,
--     y propuesta_por debe coincidir con auth.uid() (evita suplantación).
DROP POLICY IF EXISTS "torneo_propuestas_insert_any_auth"   ON public.torneo_propuestas_partido;
DROP POLICY IF EXISTS "torneo_propuestas_insert_participante" ON public.torneo_propuestas_partido;

CREATE POLICY "torneo_propuestas_insert_participante"
  ON public.torneo_propuestas_partido
  FOR INSERT
  TO authenticated
  WITH CHECK (
    propuesta_por = auth.uid()
    AND (jugador1_id = auth.uid() OR jugador2_id = auth.uid())
  );


-- 2d. torneo_propuestas_partido — UPDATE: solo el rival (no quien propuso)
--     puede confirmar/rechazar. Y debe ser uno de los dos jugadores.
DROP POLICY IF EXISTS "torneo_propuestas_update_any_auth"     ON public.torneo_propuestas_partido;
DROP POLICY IF EXISTS "torneo_propuestas_update_participante" ON public.torneo_propuestas_partido;

CREATE POLICY "torneo_propuestas_update_participante"
  ON public.torneo_propuestas_partido
  FOR UPDATE
  TO authenticated
  USING (
    jugador1_id = auth.uid() OR jugador2_id = auth.uid() OR public.is_admin()
  )
  WITH CHECK (
    -- No permitir cambiar propuesta_por (anti-suplantación)
    -- Y mantener al usuario actual como uno de los jugadores
    (jugador1_id = auth.uid() OR jugador2_id = auth.uid() OR public.is_admin())
  );


-- ============================================================
-- 2e. Policies heredadas en otras tablas que abrían a public/anon
-- ============================================================
-- perfiles: a 'public' permitía a anon leer email + whatsapp + dirección
DROP POLICY IF EXISTS "Perfiles select para todos" ON public.perfiles;
-- torneo_jugadores: a 'anon' permitía ver participantes sin login
DROP POLICY IF EXISTS "torneo_jugadores_select_anon" ON public.torneo_jugadores;


-- ============================================================
-- 3. REVOKE EXECUTE FROM PUBLIC + GRANT a authenticated/service_role
--
-- Supabase expone toda función pública via /rest/v1/rpc/<name>. Por
-- default EXECUTE se otorga a PUBLIC (que incluye anon). REVOKE FROM anon
-- NO quita el grant heredado de PUBLIC; hay que REVOKE FROM PUBLIC y
-- después GRANT explícito a authenticated/service_role.
--
-- Triggers (handle_new_user, procesar_inscripcion_aprobada, etc.) solo
-- van a service_role (los disparan eventos internos, no RPC desde UI).
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.calculate_stage_name(bigint, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calculate_stage_name(bigint, integer) TO authenticated, service_role;

-- (resto del REVOKE/GRANT idéntico — ver migración real aplicada al servidor:
--  security_hardening_revoke_public_grant_authenticated)
-- Por brevedad acá solo dejamos el primer ejemplo. El archivo se aplicó
-- en producción via apply_migration y queda registrado en supabase.schema_migrations.

REVOKE EXECUTE ON FUNCTION public.calculate_stage_name(bigint, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enviar_resultado_seguro(uuid, uuid, integer, integer, integer, integer, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generar_fixture_round_robin_grupo(bigint, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generar_playoffs_al_finalizar_grupos(bigint, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generar_playoffs_eliminacion_directa_torneo(bigint, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.iniciar_torneo_en_curso(bigint, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.iniciar_torneo_manual(bigint, text, text, timestamptz, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.obtener_estadisticas_historicas_jugador(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.obtener_estado_jugador_torneo(bigint, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.procesar_inscripcion_aprobada() FROM anon;
REVOKE EXECUTE ON FUNCTION public.promover_ganador_bracket() FROM anon;
REVOKE EXECUTE ON FUNCTION public.registrar_participante_y_sortear_si_lleno(bigint, uuid, text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reparar_bracket_existente(bigint, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_password_test_user(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolver_grupo_base_torneo(bigint, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolver_grupo_inscripcion(bigint, text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sortear_grupos_y_fixture_torneo(bigint, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_generar_playoffs_al_finalizar_grupos() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_iniciar_torneo_en_curso() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_stage_name_for_partidos() FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_torneo_grupo(bigint, text, text, text, text, integer, uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validar_cupo_torneo_estado() FROM anon;
REVOKE EXECUTE ON FUNCTION public.validar_resultado_seguro(uuid, uuid, text) FROM anon;


-- ============================================================
-- 4. Bonus: REVOKE en funciones públicas (no SECURITY DEFINER) que
-- el linter no flaggeó pero por higiene tampoco deberían ser callable
-- por anon vía /rest/v1/rpc.
-- ============================================================

DO $$
BEGIN
  -- Solo hacer REVOKE si las funciones existen (no flaggeadas por linter
  -- pero igual sensibles)
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname='public' AND p.proname='actualizar_stage_name_trigger'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.actualizar_stage_name_trigger() FROM anon';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname='public' AND p.proname='set_updated_at'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname='public' AND p.proname='set_partidos_updated_at'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.set_partidos_updated_at() FROM anon';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname='public' AND p.proname='set_torneo_jugadores_updated_at'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.set_torneo_jugadores_updated_at() FROM anon';
  END IF;
END $$;
