-- ============================================================
-- Security fix (audit 2026-08-04): identity spoofing + missing
-- authorization checks in match-result and registration RPCs,
-- plus a lightweight app-level rate limiter.
--
-- CRITICAL: enviar_resultado_seguro / enviar_resultado_seguro_equipo
--   Both are SECURITY DEFINER and take p_user_id as a caller-supplied
--   parameter, but neither currently checks p_user_id = auth.uid().
--   Any authenticated player can therefore submit (and flip who-must-
--   confirm) a result AS THEIR OPPONENT.
--
--   This is a regression, not a design gap: 20260515_fix_auth_uid_check_
--   security_definer.sql added this exact check to enviar_resultado_seguro
--   with a comment calling out this precise risk, but the next
--   CREATE OR REPLACE (20260601_enforce_jornada_order.sql) silently
--   dropped it, and every later redefinition (20260603_*, 20260720_*)
--   carried the regression forward. enviar_resultado_seguro_equipo
--   (added later, 20260721_dobles_tournament_support.sql) never had it
--   at all. This migration restores the check in both, and also binds
--   it going forward via a comment + the rate limiter below so any
--   future CREATE OR REPLACE is less likely to drop it silently.
--
-- HIGH: registrar_participante_y_sortear_si_lleno
--   Same missing-binding pattern for p_perfil_id. Unlike the result
--   RPCs, this one is legitimately called by procesar_inscripcion_
--   aprobada() (a trigger on inscripciones_torneo) when an ADMIN or
--   ORGANIZADOR approves someone else's payment -- in that flow
--   auth.uid() is the approving admin, not the registrant, by design.
--   So the fix here is NOT "must equal auth.uid()" but "must equal
--   auth.uid() OR the caller can administer this tournament"
--   (public.puede_administrar_torneo, the same helper gating every
--   other admin/organizer RPC since 20260727_04). A NULL auth.uid()
--   (service_role / migration context) is left unblocked on purpose,
--   matching every other helper in this codebase.
--
-- LOW: no rate limiting anywhere in the schema (confirmed by audit).
--   Adds a minimal, reusable check_rate_limit() backed by a private
--   table (RLS enabled, zero policies -> only reachable through
--   SECURITY DEFINER functions). Wired into the two result-submission
--   RPCs, which are the cheapest to abuse now that identity spoofing
--   is closed (rapid-fire resubmission/flip-flopping a result).
--   Deliberately NOT wired into registrar_participante_y_sortear_si_
--   lleno: that RPC is invoked once per row from an admin bulk-approve
--   flow, and a per-admin rate limit there would risk throttling
--   legitimate bulk approvals for no real security gain now that the
--   authorization check above closes the actual hole.
-- ============================================================


-- ============================================================
-- 0. Rate limiter: private log table + check function
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id bigserial PRIMARY KEY,
  perfil_id uuid NOT NULL,
  accion text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_log_lookup
  ON public.rate_limit_log (perfil_id, accion, created_at DESC);

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;
-- Intentionally zero CREATE POLICY statements: PostgREST/anon/authenticated
-- get no direct access at all. Only SECURITY DEFINER functions owned by
-- the table owner (which bypasses RLS) can read or write it.

REVOKE ALL ON public.rate_limit_log FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_accion text,
  p_max_intentos integer,
  p_ventana interval
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- No session (service_role / migration context): don't gate internal callers.
  IF auth.uid() IS NULL THEN
    RETURN true;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.rate_limit_log
  WHERE perfil_id = auth.uid()
    AND accion = p_accion
    AND created_at > now() - p_ventana;

  IF v_count >= p_max_intentos THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_log (perfil_id, accion) VALUES (auth.uid(), p_accion);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, interval) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, interval) TO authenticated, service_role;

-- Housekeeping: old rows are never read again after their window passes.
CREATE OR REPLACE FUNCTION public.limpiar_rate_limit_log()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limit_log WHERE created_at < now() - interval '1 day';
$$;

REVOKE ALL ON FUNCTION public.limpiar_rate_limit_log() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.limpiar_rate_limit_log() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'limpiar-rate-limit-log';
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

SELECT cron.schedule(
  'limpiar-rate-limit-log',
  '0 4 * * *',
  $$SELECT public.limpiar_rate_limit_log();$$
);


-- ============================================================
-- 1. enviar_resultado_seguro (singles) -- restore identity binding
--    + rate limit. Body otherwise identical to the current
--    production definition (20260720_fix_fecha_propuesta_not_null_
--    regression.sql).
-- ============================================================

CREATE OR REPLACE FUNCTION public.enviar_resultado_seguro(
  p_partido_id uuid,
  p_user_id uuid,
  p_set1_j1 integer,
  p_set1_j2 integer,
  p_set2_j1 integer,
  p_set2_j2 integer,
  p_set3_j1 integer,
  p_set3_j2 integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partido public.partidos%rowtype;
  v_propuesta public.torneo_propuestas_partido%rowtype;
  v_match_pair_key text;
  v_sets jsonb;
  v_debe_confirmar uuid;
BEGIN
  -- Identity binding: caller must match the claimed p_user_id.
  IF auth.uid() IS NULL THEN
    RETURN 'No autenticado.';
  END IF;
  IF p_user_id <> auth.uid() THEN
    RETURN 'No puedes actuar en nombre de otro jugador.';
  END IF;

  IF NOT public.check_rate_limit('enviar_resultado_seguro', 20, interval '5 minutes') THEN
    RETURN 'Demasiados intentos. Espera unos minutos y volve a intentar.';
  END IF;

  IF p_partido_id IS NULL OR p_user_id IS NULL THEN
    RETURN 'Partido o usuario invalido.';
  END IF;

  IF p_set1_j1 IS NULL OR p_set1_j2 IS NULL OR p_set2_j1 IS NULL OR p_set2_j2 IS NULL THEN
    RETURN 'Faltan sets obligatorios para enviar el resultado.';
  END IF;

  SELECT *
  INTO v_partido
  FROM public.partidos p
  WHERE p.id = p_partido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'Partido no encontrado.';
  END IF;

  IF p_user_id NOT IN (v_partido.jugador1_id, v_partido.jugador2_id) THEN
    RETURN 'Solo los jugadores del partido pueden cargar resultado.';
  END IF;

  IF COALESCE(v_partido.estado, '') = 'finalizado' THEN
    RETURN 'Este partido ya esta finalizado.';
  END IF;

  -- Calculate who must confirm: the OTHER player
  IF p_user_id = v_partido.jugador1_id THEN
    v_debe_confirmar := v_partido.jugador2_id;
  ELSE
    v_debe_confirmar := v_partido.jugador1_id;
  END IF;

  v_match_pair_key := FORMAT(
    'PARTIDO:%s|T:%s|C:%s|G:%s|J:%s',
    v_partido.id,
    v_partido.torneo_id,
    COALESCE(v_partido.categoria, ''),
    COALESCE(v_partido.grupo, ''),
    COALESCE(v_partido.jornada, 1)
  );

  v_sets := jsonb_build_array(
    jsonb_build_object('p1', GREATEST(0, COALESCE(p_set1_j1, 0)), 'p2', GREATEST(0, COALESCE(p_set1_j2, 0))),
    jsonb_build_object('p1', GREATEST(0, COALESCE(p_set2_j1, 0)), 'p2', GREATEST(0, COALESCE(p_set2_j2, 0))),
    jsonb_build_object('p1', GREATEST(0, COALESCE(p_set3_j1, 0)), 'p2', GREATEST(0, COALESCE(p_set3_j2, 0)))
  );

  SELECT *
  INTO v_propuesta
  FROM public.torneo_propuestas_partido tpp
  WHERE tpp.partido_id = p_partido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.torneo_propuestas_partido (
      torneo_id,
      categoria,
      grupo,
      jugador1_id,
      jugador2_id,
      jugador1_perfil_id,
      jugador2_perfil_id,
      fecha_propuesta,
      propuesta_por,
      match_pair_key,
      partido_id,
      jornada,
      ultimo_cargado_por,
      debe_confirmar_por,
      sets_json_j1,
      sets_json_j2,
      estado,
      updated_at
    )
    VALUES (
      COALESCE(v_partido.torneo_id, 0)::integer,
      COALESCE(v_partido.categoria, ''),
      COALESCE(v_partido.grupo, ''),
      v_partido.jugador1_id,
      v_partido.jugador2_id,
      v_partido.jugador1_id,
      v_partido.jugador2_id,
      now(),
      p_user_id,
      v_match_pair_key,
      v_partido.id,
      COALESCE(v_partido.jornada, 1),
      p_user_id,
      v_debe_confirmar,
      CASE WHEN p_user_id = v_partido.jugador1_id THEN v_sets ELSE NULL END,
      CASE WHEN p_user_id = v_partido.jugador2_id THEN v_sets ELSE NULL END,
      'pendiente',
      now()
    );
  ELSE
    UPDATE public.torneo_propuestas_partido
    SET sets_json_j1 = CASE WHEN p_user_id = v_partido.jugador1_id THEN v_sets ELSE sets_json_j1 END,
        sets_json_j2 = CASE WHEN p_user_id = v_partido.jugador2_id THEN v_sets ELSE sets_json_j2 END,
        ultimo_cargado_por = p_user_id,
        debe_confirmar_por = v_debe_confirmar,
        estado = 'pendiente',
        updated_at = now()
    WHERE partido_id = p_partido_id;
  END IF;

  UPDATE public.partidos
  SET estado = 'esperando_validacion',
      set1_j1 = GREATEST(0, COALESCE(p_set1_j1, 0)),
      set1_j2 = GREATEST(0, COALESCE(p_set1_j2, 0)),
      set2_j1 = GREATEST(0, COALESCE(p_set2_j1, 0)),
      set2_j2 = GREATEST(0, COALESCE(p_set2_j2, 0)),
      set3_j1 = CASE WHEN p_set3_j1 IS NULL THEN NULL ELSE GREATEST(0, p_set3_j1) END,
      set3_j2 = CASE WHEN p_set3_j2 IS NULL THEN NULL ELSE GREATEST(0, p_set3_j2) END
  WHERE id = p_partido_id;

  RETURN 'OK';
END;
$$;

REVOKE ALL ON FUNCTION public.enviar_resultado_seguro(uuid, uuid, integer, integer, integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enviar_resultado_seguro(uuid, uuid, integer, integer, integer, integer, integer, integer) TO authenticated, service_role;


-- ============================================================
-- 2. enviar_resultado_seguro_equipo (dobles) -- same fix. Body
--    otherwise identical to 20260721_dobles_tournament_support.sql.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enviar_resultado_seguro_equipo(
  p_partido_id uuid,
  p_user_id uuid,
  p_set1_j1 integer,
  p_set1_j2 integer,
  p_set2_j1 integer,
  p_set2_j2 integer,
  p_set3_j1 integer,
  p_set3_j2 integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partido public.partidos%rowtype;
  v_equipo1 public.torneo_equipos%rowtype;
  v_equipo2 public.torneo_equipos%rowtype;
  v_propuesta public.torneo_propuestas_partido%rowtype;
  v_match_pair_key text;
  v_sets jsonb;
  v_debe_confirmar_equipo uuid;
  v_user_lado integer;
  v_rep_jugador1 uuid;
  v_rep_jugador2 uuid;
BEGIN
  -- Identity binding: caller must match the claimed p_user_id.
  IF auth.uid() IS NULL THEN
    RETURN 'No autenticado.';
  END IF;
  IF p_user_id <> auth.uid() THEN
    RETURN 'No puedes actuar en nombre de otro jugador.';
  END IF;

  IF NOT public.check_rate_limit('enviar_resultado_seguro_equipo', 20, interval '5 minutes') THEN
    RETURN 'Demasiados intentos. Espera unos minutos y volve a intentar.';
  END IF;

  IF p_partido_id IS NULL OR p_user_id IS NULL THEN
    RETURN 'Partido o usuario invalido.';
  END IF;

  IF p_set1_j1 IS NULL OR p_set1_j2 IS NULL OR p_set2_j1 IS NULL OR p_set2_j2 IS NULL THEN
    RETURN 'Faltan sets obligatorios para enviar el resultado.';
  END IF;

  SELECT * INTO v_partido FROM public.partidos p WHERE p.id = p_partido_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'Partido no encontrado.';
  END IF;

  IF v_partido.equipo1_id IS NULL OR v_partido.equipo2_id IS NULL THEN
    RETURN 'Este partido no tiene equipos de dobles asignados.';
  END IF;

  SELECT * INTO v_equipo1 FROM public.torneo_equipos WHERE id = v_partido.equipo1_id;
  SELECT * INTO v_equipo2 FROM public.torneo_equipos WHERE id = v_partido.equipo2_id;

  IF p_user_id IN (v_equipo1.jugador1_id, v_equipo1.jugador2_id) THEN
    v_user_lado := 1;
  ELSIF p_user_id IN (v_equipo2.jugador1_id, v_equipo2.jugador2_id) THEN
    v_user_lado := 2;
  ELSE
    RETURN 'Solo los integrantes de los equipos del partido pueden cargar resultado.';
  END IF;

  IF COALESCE(v_partido.estado, '') = 'finalizado' THEN
    RETURN 'Este partido ya esta finalizado.';
  END IF;

  IF v_user_lado = 1 THEN
    v_debe_confirmar_equipo := v_partido.equipo2_id;
  ELSE
    v_debe_confirmar_equipo := v_partido.equipo1_id;
  END IF;

  v_rep_jugador1 := v_equipo1.jugador1_id;
  v_rep_jugador2 := v_equipo2.jugador1_id;

  v_match_pair_key := FORMAT(
    'PARTIDO:%s|T:%s|C:%s|G:%s|J:%s',
    v_partido.id,
    v_partido.torneo_id,
    COALESCE(v_partido.categoria, ''),
    COALESCE(v_partido.grupo, ''),
    COALESCE(v_partido.jornada, 1)
  );

  v_sets := jsonb_build_array(
    jsonb_build_object('p1', GREATEST(0, COALESCE(p_set1_j1, 0)), 'p2', GREATEST(0, COALESCE(p_set1_j2, 0))),
    jsonb_build_object('p1', GREATEST(0, COALESCE(p_set2_j1, 0)), 'p2', GREATEST(0, COALESCE(p_set2_j2, 0))),
    jsonb_build_object('p1', GREATEST(0, COALESCE(p_set3_j1, 0)), 'p2', GREATEST(0, COALESCE(p_set3_j2, 0)))
  );

  SELECT * INTO v_propuesta FROM public.torneo_propuestas_partido tpp WHERE tpp.partido_id = p_partido_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.torneo_propuestas_partido (
      torneo_id, categoria, grupo,
      jugador1_id, jugador2_id, jugador1_perfil_id, jugador2_perfil_id,
      equipo1_id, equipo2_id,
      fecha_propuesta, propuesta_por, match_pair_key, partido_id, jornada,
      ultimo_cargado_por, debe_confirmar_equipo_id,
      sets_json_j1, sets_json_j2,
      estado, updated_at
    ) VALUES (
      COALESCE(v_partido.torneo_id, 0)::integer,
      COALESCE(v_partido.categoria, ''),
      COALESCE(v_partido.grupo, ''),
      v_rep_jugador1, v_rep_jugador2, v_rep_jugador1, v_rep_jugador2,
      v_partido.equipo1_id, v_partido.equipo2_id,
      now(), p_user_id, v_match_pair_key, v_partido.id, COALESCE(v_partido.jornada, 1),
      p_user_id, v_debe_confirmar_equipo,
      CASE WHEN v_user_lado = 1 THEN v_sets ELSE NULL END,
      CASE WHEN v_user_lado = 2 THEN v_sets ELSE NULL END,
      'pendiente', now()
    );
  ELSE
    UPDATE public.torneo_propuestas_partido
    SET sets_json_j1 = CASE WHEN v_user_lado = 1 THEN v_sets ELSE sets_json_j1 END,
        sets_json_j2 = CASE WHEN v_user_lado = 2 THEN v_sets ELSE sets_json_j2 END,
        equipo1_id = v_partido.equipo1_id,
        equipo2_id = v_partido.equipo2_id,
        ultimo_cargado_por = p_user_id,
        debe_confirmar_equipo_id = v_debe_confirmar_equipo,
        estado = 'pendiente',
        updated_at = now()
    WHERE partido_id = p_partido_id;
  END IF;

  UPDATE public.partidos
  SET estado = 'esperando_validacion',
      set1_j1 = GREATEST(0, COALESCE(p_set1_j1, 0)),
      set1_j2 = GREATEST(0, COALESCE(p_set1_j2, 0)),
      set2_j1 = GREATEST(0, COALESCE(p_set2_j1, 0)),
      set2_j2 = GREATEST(0, COALESCE(p_set2_j2, 0)),
      set3_j1 = CASE WHEN p_set3_j1 IS NULL THEN NULL ELSE GREATEST(0, p_set3_j1) END,
      set3_j2 = CASE WHEN p_set3_j2 IS NULL THEN NULL ELSE GREATEST(0, p_set3_j2) END
  WHERE id = p_partido_id;

  RETURN 'OK';
END;
$$;

REVOKE ALL ON FUNCTION public.enviar_resultado_seguro_equipo(uuid, uuid, integer, integer, integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enviar_resultado_seguro_equipo(uuid, uuid, integer, integer, integer, integer, integer, integer) TO authenticated, service_role;


-- ============================================================
-- 3. registrar_participante_y_sortear_si_lleno -- add ownership-or-
--    admin authorization check. Body otherwise identical to the
--    current production definition (20260410_round_robin_auto_
--    group_split.sql). Only the new IF block at the top is added.
-- ============================================================

CREATE OR REPLACE FUNCTION public.registrar_participante_y_sortear_si_lleno(
  p_torneo_id bigint,
  p_perfil_id uuid,
  p_categoria text,
  p_grupo text,
  p_max_participantes integer
)
RETURNS TABLE (
  torneo_id bigint,
  perfil_id uuid,
  ya_inscripto boolean,
  estado_antes text,
  estado_despues text,
  participantes_actuales integer,
  max_participantes integer,
  sorteo_disparado boolean,
  partidos_creados integer,
  byes uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado record;
  v_ya_inscripto boolean := false;
  v_perfiles uuid[];
  v_shuffled uuid[];
  v_work uuid[];
  v_created integer := 0;
  v_byes uuid[] := '{}';
  v_expected_partidos integer := 0;
  v_i integer;
  v_j integer;
  v_round integer;
  v_rounds integer;
  v_slots integer;
  v_half integer;
  v_tmp uuid;
  v_estado_antes text;
  v_can_insert_partidos boolean := false;
  v_partidos_existentes integer := 0;
  v_j1 uuid;
  v_j2 uuid;
  v_is_bye_recorded boolean;
BEGIN
  -- Authorization: caller must be registering themselves, or be an
  -- admin/organizer with rights over this tournament (this is also
  -- the path procesar_inscripcion_aprobada() uses when an admin
  -- approves someone else's payment -- auth.uid() there is the
  -- admin, not p_perfil_id, by design). A NULL auth.uid() means a
  -- service_role/trusted internal caller and is left unblocked.
  IF auth.uid() IS NOT NULL
     AND p_perfil_id <> auth.uid()
     AND NOT public.puede_administrar_torneo(p_torneo_id) THEN
    RAISE EXCEPTION 'No autorizado: no podes inscribir a otro jugador.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.torneo_estado (torneo_id, categoria, grupo, estado, max_participantes, current_participantes)
  VALUES (p_torneo_id, p_categoria, p_grupo, 'RECRUITING', GREATEST(2, p_max_participantes), 0)
  ON CONFLICT ON CONSTRAINT uq_torneo_estado_scope
  DO UPDATE
  SET max_participantes = EXCLUDED.max_participantes,
      updated_at = now();

  SELECT * INTO v_estado
  FROM public.torneo_estado te
  WHERE te.torneo_id = p_torneo_id
    AND te.categoria = p_categoria
    AND te.grupo = p_grupo
  FOR UPDATE;

  v_estado_antes := v_estado.estado;

  IF v_estado.estado <> 'RECRUITING' THEN
    SELECT count(*)::integer INTO v_partidos_existentes
    FROM public.partidos p
    WHERE p.torneo_id = p_torneo_id
      AND p.categoria = p_categoria
      AND p.grupo = p_grupo;

    IF NOT (v_estado.current_participantes >= v_estado.max_participantes AND v_partidos_existentes = 0) THEN
      RETURN QUERY
      SELECT p_torneo_id, p_perfil_id, false, v_estado_antes, v_estado.estado,
             v_estado.current_participantes, v_estado.max_participantes, false, 0, '{}'::uuid[];
      RETURN;
    END IF;
  END IF;

  IF v_estado.estado <> 'RECRUITING' AND v_estado.current_participantes >= v_estado.max_participantes AND v_partidos_existentes = 0 THEN
    v_estado.estado := 'RECRUITING';
    v_estado.sorteo_realizado := false;
  END IF;

  IF v_estado.estado <> 'RECRUITING' THEN
    RETURN QUERY
    SELECT p_torneo_id, p_perfil_id, false, v_estado_antes, v_estado.estado,
           v_estado.current_participantes, v_estado.max_participantes, false, 0, '{}'::uuid[];
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.torneo_jugadores tj
    WHERE tj.perfil_id = p_perfil_id
      AND tj.torneo_id = p_torneo_id
      AND tj.categoria = p_categoria
      AND tj.grupo = p_grupo
  ) INTO v_ya_inscripto;

  IF NOT v_ya_inscripto THEN
    INSERT INTO public.torneo_jugadores (torneo_id, perfil_id, categoria, grupo, puntos, partidos_jugados, sets_ganados)
    VALUES (p_torneo_id, p_perfil_id, p_categoria, p_grupo, 0, 0, 0);
  END IF;

  UPDATE public.torneo_estado te
  SET current_participantes = (
        SELECT count(*)::integer
        FROM public.torneo_jugadores tj
        WHERE tj.torneo_id = p_torneo_id
          AND tj.categoria = p_categoria
          AND tj.grupo = p_grupo
      ),
      updated_at = now()
  WHERE te.torneo_id = p_torneo_id
    AND te.categoria = p_categoria
    AND te.grupo = p_grupo
  RETURNING * INTO v_estado;

  IF v_estado.current_participantes > v_estado.max_participantes THEN
    RAISE EXCEPTION 'El torneo %/%/% supero el cupo configurado: % inscriptos para % lugares.',
      p_torneo_id, p_categoria, p_grupo, v_estado.current_participantes, v_estado.max_participantes;
  END IF;

  IF v_ya_inscripto AND v_estado.current_participantes < v_estado.max_participantes THEN
    RETURN QUERY
    SELECT p_torneo_id, p_perfil_id, true, v_estado_antes, v_estado.estado,
           v_estado.current_participantes, v_estado.max_participantes, false, 0, '{}'::uuid[];
    RETURN;
  END IF;

  IF v_estado.current_participantes < v_estado.max_participantes THEN
    RETURN QUERY
    SELECT p_torneo_id, p_perfil_id, false, v_estado_antes, v_estado.estado,
           v_estado.current_participantes, v_estado.max_participantes, false, 0, '{}'::uuid[];
    RETURN;
  END IF;

  UPDATE public.torneo_estado
  SET estado = 'LOCKED', updated_at = now()
  WHERE public.torneo_estado.torneo_id = p_torneo_id
    AND public.torneo_estado.categoria = p_categoria
    AND public.torneo_estado.grupo = p_grupo;

  SELECT array_agg(tj.perfil_id) INTO v_perfiles
  FROM public.torneo_jugadores tj
  WHERE tj.torneo_id = p_torneo_id
    AND tj.categoria = p_categoria
    AND tj.grupo = p_grupo;

  v_shuffled := COALESCE(v_perfiles, '{}');
  v_expected_partidos := (COALESCE(array_length(v_shuffled, 1), 0) * GREATEST(COALESCE(array_length(v_shuffled, 1), 0) - 1, 0)) / 2;

  IF array_length(v_shuffled, 1) IS NOT NULL THEN
    FOR v_i IN REVERSE array_lower(v_shuffled, 1)..array_upper(v_shuffled, 1) LOOP
      IF v_i <= 1 THEN
        EXIT;
      END IF;
      v_j := 1 + floor(random() * v_i)::int;
      v_tmp := v_shuffled[v_j];
      v_shuffled[v_j] := v_shuffled[v_i];
      v_shuffled[v_i] := v_tmp;
    END LOOP;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'partidos'
      AND column_name IN ('id', 'torneo_id', 'categoria', 'grupo', 'jornada', 'jugador1_id', 'jugador2_id', 'fecha_programada', 'resultado', 'estado', 'ganador_id')
    GROUP BY table_name
    HAVING count(DISTINCT column_name) = 11
  ) INTO v_can_insert_partidos;

  IF NOT v_can_insert_partidos AND v_expected_partidos > 0 THEN
    RAISE EXCEPTION 'La tabla public.partidos no tiene las columnas esperadas para crear cruces automaticamente.';
  END IF;

  IF v_can_insert_partidos THEN
    SELECT count(*)::integer INTO v_partidos_existentes
    FROM public.partidos p
    WHERE p.torneo_id = p_torneo_id
      AND p.categoria = p_categoria
      AND p.grupo = p_grupo;

    IF v_expected_partidos > 0 AND v_partidos_existentes = v_expected_partidos THEN
      UPDATE public.torneo_estado
      SET estado = 'LOCKED', sorteo_realizado = true, updated_at = now()
      WHERE public.torneo_estado.torneo_id = p_torneo_id
        AND public.torneo_estado.categoria = p_categoria
        AND public.torneo_estado.grupo = p_grupo
      RETURNING * INTO v_estado;

      RETURN QUERY
      SELECT p_torneo_id, p_perfil_id, v_ya_inscripto, v_estado_antes, v_estado.estado,
             v_estado.current_participantes, v_estado.max_participantes, false, 0, '{}'::uuid[];
      RETURN;
    ELSIF v_expected_partidos > 0 AND v_partidos_existentes > 0 THEN
      RAISE EXCEPTION 'Se detectaron % partidos existentes para %/%/%, pero el fixture esperado es de % partidos. Limpia los partidos existentes antes de reintentar el sorteo.',
        v_partidos_existentes, p_torneo_id, p_categoria, p_grupo, v_expected_partidos;
    END IF;
  END IF;

  IF COALESCE(array_length(v_shuffled, 1), 0) > 1 THEN
    v_work := v_shuffled;

    IF mod(array_length(v_work, 1), 2) = 1 THEN
      v_work := array_append(v_work, NULL::uuid);
    END IF;

    v_slots := COALESCE(array_length(v_work, 1), 0);
    v_half := v_slots / 2;
    v_rounds := GREATEST(v_slots - 1, 0);

    FOR v_round IN 1..v_rounds LOOP
      FOR v_i IN 1..v_half LOOP
        v_j1 := v_work[v_i];
        v_j2 := v_work[v_slots - v_i + 1];

        IF v_j1 IS NULL AND v_j2 IS NULL THEN
          CONTINUE;
        ELSIF v_j1 IS NULL OR v_j2 IS NULL THEN
          IF v_j1 IS NULL THEN
            v_j1 := v_j2;
          END IF;

          SELECT EXISTS (
            SELECT 1
            FROM unnest(v_byes) AS b(perfil_id)
            WHERE b.perfil_id = v_j1
          ) INTO v_is_bye_recorded;

          IF NOT v_is_bye_recorded THEN
            v_byes := array_append(v_byes, v_j1);
          END IF;
        ELSE
          IF v_can_insert_partidos THEN
            INSERT INTO public.partidos (id, torneo_id, categoria, grupo, jornada, jugador1_id, jugador2_id, fecha_programada, resultado, estado, ganador_id)
            VALUES (
              (
                substr(md5(random()::text || clock_timestamp()::text), 1, 8) || '-' ||
                substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
                substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
                substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
                substr(md5(random()::text || clock_timestamp()::text), 1, 12)
              )::uuid,
              p_torneo_id,
              p_categoria,
              p_grupo,
              v_round,
              v_j1,
              v_j2,
              NULL,
              'PENDIENTE',
              'programado',
              NULL
            );
            v_created := v_created + 1;
          END IF;
        END IF;
      END LOOP;

      IF v_slots > 2 THEN
        v_tmp := v_work[v_slots];
        FOR v_i IN REVERSE 3..v_slots LOOP
          v_work[v_i] := v_work[v_i - 1];
        END LOOP;
        v_work[2] := v_tmp;
      END IF;
    END LOOP;
  END IF;

  IF COALESCE(array_length(v_shuffled, 1), 0) >= 2 AND v_created = 0 THEN
    RAISE EXCEPTION 'El sorteo round robin se ejecuto pero no se pudo crear ningun partido en public.partidos.';
  END IF;

  UPDATE public.torneo_estado
  SET estado = 'LOCKED', sorteo_realizado = true, updated_at = now()
  WHERE public.torneo_estado.torneo_id = p_torneo_id
    AND public.torneo_estado.categoria = p_categoria
    AND public.torneo_estado.grupo = p_grupo
  RETURNING * INTO v_estado;

  RETURN QUERY
  SELECT p_torneo_id, p_perfil_id, false, v_estado_antes, v_estado.estado,
         v_estado.current_participantes, v_estado.max_participantes, true, v_created, v_byes;
END;
$$;

COMMENT ON FUNCTION public.registrar_participante_y_sortear_si_lleno(bigint, uuid, text, text, integer)
IS 'Inscribe jugador en el grupo y, al completar cupo, genera fixture round robin completo (todas las jornadas) para ese grupo.';

REVOKE ALL ON FUNCTION public.registrar_participante_y_sortear_si_lleno(bigint, uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_participante_y_sortear_si_lleno(bigint, uuid, text, text, integer) TO authenticated, service_role;
