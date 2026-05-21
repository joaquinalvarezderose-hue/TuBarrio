-- ─────────────────────────────────────────────────────────────────────────────
-- Admin Monitoring System
-- Provides virtual dashboards for tournament administration without needing
-- to navigate raw UUID tables in Supabase dashboard.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. v_admin_grupos_posiciones ────────────────────────────────────────────
-- Group stage standings with real player names and calculated ranking.
-- Mirrors the tiebreaker logic in Standings.tsx / tournamentLogic.ts:
--   1° Puntos  2° Dif. Sets  3° Sets Ganados

CREATE OR REPLACE VIEW public.v_admin_grupos_posiciones
WITH (security_invoker = true) AS
SELECT
  t.id                                                            AS torneo_id,
  t.titulo                                                        AS torneo_titulo,
  tj.categoria,
  tj.grupo,
  te.estado                                                       AS estado_grupo,
  te.sorteo_realizado,
  RANK() OVER (
    PARTITION BY tj.torneo_id, tj.categoria, tj.grupo
    ORDER BY
      COALESCE(tj.puntos, 0)                                        DESC,
      COALESCE(tj.sets_ganados,0) - COALESCE(tj.sets_perdidos,0)   DESC,
      COALESCE(tj.sets_ganados, 0)                                  DESC
  )                                                               AS posicion,
  p.nombre_completo                                               AS jugador_nombre,
  p.whatsapp                                                      AS jugador_whatsapp,
  tj.perfil_id,
  COALESCE(tj.puntos, 0)                                          AS puntos,
  COALESCE(tj.partidos_jugados, 0)                                AS pj,
  COALESCE(tj.sets_ganados, 0)                                    AS sg,
  COALESCE(tj.sets_perdidos, 0)                                   AS sp,
  COALESCE(tj.sets_ganados,0) - COALESCE(tj.sets_perdidos,0)     AS dif_sets
FROM public.torneo_jugadores tj
JOIN  public.perfiles p  ON p.id = tj.perfil_id
JOIN  public.torneos  t  ON t.id = tj.torneo_id
LEFT JOIN public.torneo_estado te
  ON  te.torneo_id = tj.torneo_id
  AND te.categoria = tj.categoria
  AND te.grupo     = tj.grupo
ORDER BY tj.torneo_id, tj.categoria, tj.grupo, posicion;

GRANT SELECT ON public.v_admin_grupos_posiciones TO authenticated;

-- ─── 2. v_admin_llaves_playoffs ──────────────────────────────────────────────
-- Playoff bracket matches with real player names instead of UUIDs.
-- LEFT JOINs on perfiles because bracket slots can be NULL until a prior
-- winner promotes (bracket is pre-generated with NULL player slots).

CREATE OR REPLACE VIEW public.v_admin_llaves_playoffs
WITH (security_invoker = true) AS
SELECT
  t.id                                                            AS torneo_id,
  t.titulo                                                        AS torneo_titulo,
  pa.id                                                           AS partido_id,
  pa.categoria,
  pa.grupo,
  pa.ronda,
  pa.stage_name,
  pa.posicion_bracket,
  pa.estado,
  pa.resultado,
  pa.siguiente_partido_id,
  pa.set1_j1, pa.set1_j2,
  pa.set2_j1, pa.set2_j2,
  pa.set3_j1, pa.set3_j2,
  pa.jugador1_id,
  j1.nombre_completo                                              AS jugador1_nombre,
  j1.whatsapp                                                     AS jugador1_whatsapp,
  pa.jugador2_id,
  j2.nombre_completo                                              AS jugador2_nombre,
  j2.whatsapp                                                     AS jugador2_whatsapp,
  pa.ganador_id,
  gw.nombre_completo                                              AS ganador_nombre
FROM public.partidos pa
JOIN  public.torneos  t    ON t.id  = pa.torneo_id
LEFT JOIN public.perfiles j1 ON j1.id = pa.jugador1_id
LEFT JOIN public.perfiles j2 ON j2.id = pa.jugador2_id
LEFT JOIN public.perfiles gw ON gw.id = pa.ganador_id
WHERE pa.bracket_tipo IS NOT NULL
ORDER BY pa.torneo_id, pa.categoria, pa.ronda, pa.posicion_bracket;

GRANT SELECT ON public.v_admin_llaves_playoffs TO authenticated;

-- ─── 3. v_admin_disputas_activas ─────────────────────────────────────────────
-- Active disputes requiring admin intervention:
-- • estado = 'discrepancia' (players submitted conflicting scores)
-- • estado = 'pendiente' and older than 48h (rival not responding)
-- Ordered: discrepancies first, then oldest pending first.

CREATE OR REPLACE VIEW public.v_admin_disputas_activas
WITH (security_invoker = true) AS
SELECT
  tpp.id                                                          AS propuesta_id,
  tpp.partido_id,
  tpp.torneo_id,
  t.titulo                                                        AS torneo_titulo,
  par.categoria,
  par.grupo,
  par.ronda,
  par.stage_name,
  par.bracket_tipo,
  tpp.estado,
  tpp.created_at,
  ROUND(
    EXTRACT(EPOCH FROM (now() - tpp.created_at)) / 3600.0, 1
  )                                                               AS horas_pendiente,
  j1.nombre_completo                                              AS jugador1_nombre,
  j2.nombre_completo                                              AS jugador2_nombre,
  tpp.jugador1_id,
  tpp.jugador2_id,
  tpp.sets_json_j1,
  tpp.sets_json_j2,
  tpp.debe_confirmar_por,
  dc.nombre_completo                                              AS debe_confirmar_nombre
FROM public.torneo_propuestas_partido tpp
JOIN  public.torneos  t    ON t.id   = tpp.torneo_id
JOIN  public.partidos par  ON par.id = tpp.partido_id
LEFT JOIN public.perfiles j1 ON j1.id = tpp.jugador1_id
LEFT JOIN public.perfiles j2 ON j2.id = tpp.jugador2_id
LEFT JOIN public.perfiles dc ON dc.id = tpp.debe_confirmar_por
WHERE tpp.estado = 'discrepancia'
   OR (tpp.estado = 'pendiente' AND tpp.created_at < now() - INTERVAL '48 hours')
ORDER BY
  CASE WHEN tpp.estado = 'discrepancia' THEN 0 ELSE 1 END,
  tpp.created_at ASC;

GRANT SELECT ON public.v_admin_disputas_activas TO authenticated;

-- ─── 4. admin_forzar_resultado_partido ───────────────────────────────────────
-- Admin manually forces a match result, bypassing the player proposal flow.
-- Steps:
--   1. Resolves any active proposal (marks as 'confirmado')
--   2. Updates partidos (trigger_promover_ganador_bracket fires automatically
--      for bracket matches — no manual call needed)
--   3. Inserts into torneo_partidos_historial (idempotent guard)
--   4. Updates torneo_jugadores standings for group-phase matches only

CREATE OR REPLACE FUNCTION public.admin_forzar_resultado_partido(
  p_partido_id  uuid,
  p_ganador_id  uuid,
  p_sets_json   jsonb,   -- Array of {p1: int, p2: int} objects
  p_motivo      text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partido   public.partidos%ROWTYPE;
  v_set_row   jsonb;
  v_sets_j1   integer := 0;
  v_sets_j2   integer := 0;
  v_pts_j1    integer := 0;
  v_pts_j2    integer := 0;
  v_resultado text;
  v_titulo    text;
  v_set1_j1   integer; v_set1_j2 integer;
  v_set2_j1   integer; v_set2_j2 integer;
  v_set3_j1   integer; v_set3_j2 integer;
  v_idx       integer := 0;
  v_ya_registrado boolean;
BEGIN
  -- Admin gate (validates against JWT, not localStorage)
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permiso denegado: solo admin puede forzar resultados.';
  END IF;

  SELECT * INTO v_partido
  FROM public.partidos
  WHERE id = p_partido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partido no encontrado: %', p_partido_id;
  END IF;

  IF p_ganador_id NOT IN (v_partido.jugador1_id, v_partido.jugador2_id) THEN
    RAISE EXCEPTION 'El ganador debe ser uno de los dos jugadores del partido.';
  END IF;

  -- Parse sets_json into per-set columns and aggregate counts
  FOR v_set_row IN SELECT value FROM jsonb_array_elements(p_sets_json) LOOP
    v_idx := v_idx + 1;
    IF COALESCE((v_set_row->>'p1')::integer, 0) > COALESCE((v_set_row->>'p2')::integer, 0) THEN
      v_sets_j1 := v_sets_j1 + 1;
    ELSIF COALESCE((v_set_row->>'p2')::integer, 0) > COALESCE((v_set_row->>'p1')::integer, 0) THEN
      v_sets_j2 := v_sets_j2 + 1;
    END IF;
    IF    v_idx = 1 THEN
      v_set1_j1 := (v_set_row->>'p1')::integer; v_set1_j2 := (v_set_row->>'p2')::integer;
    ELSIF v_idx = 2 THEN
      v_set2_j1 := (v_set_row->>'p1')::integer; v_set2_j2 := (v_set_row->>'p2')::integer;
    ELSIF v_idx = 3 THEN
      v_set3_j1 := (v_set_row->>'p1')::integer; v_set3_j2 := (v_set_row->>'p2')::integer;
    END IF;
  END LOOP;

  v_resultado := FORMAT('%s-%s', v_sets_j1, v_sets_j2);

  -- Points formula identical to validar_resultado_seguro
  IF p_ganador_id = v_partido.jugador1_id THEN
    v_pts_j1 := CASE WHEN v_sets_j2 = 0 THEN 3 ELSE 2 END;
    v_pts_j2 := CASE WHEN v_sets_j2 = 1 THEN 1 ELSE 0 END;
  ELSE
    v_pts_j2 := CASE WHEN v_sets_j1 = 0 THEN 3 ELSE 2 END;
    v_pts_j1 := CASE WHEN v_sets_j1 = 1 THEN 1 ELSE 0 END;
  END IF;

  -- Check whether this partido was already in historial (idempotency guard)
  SELECT EXISTS (
    SELECT 1 FROM public.torneo_partidos_historial h WHERE h.partido_id = p_partido_id
  ) INTO v_ya_registrado;

  -- 1. Resolve any active proposal
  UPDATE public.torneo_propuestas_partido
  SET estado = 'confirmado', debe_confirmar_por = NULL, updated_at = now()
  WHERE partido_id = p_partido_id
    AND estado IN ('discrepancia', 'pendiente');

  -- 2. Update match record
  --    trigger_promover_ganador_bracket fires automatically on this UPDATE
  --    for bracket matches — handles bracket advancement without extra call.
  UPDATE public.partidos
  SET estado        = 'finalizado',
      resultado     = v_resultado,
      ganador_id    = p_ganador_id,
      sets_jugador1 = v_sets_j1,
      sets_jugador2 = v_sets_j2,
      set1_j1 = v_set1_j1, set1_j2 = v_set1_j2,
      set2_j1 = v_set2_j1, set2_j2 = v_set2_j2,
      set3_j1 = v_set3_j1, set3_j2 = v_set3_j2,
      updated_at    = now()
  WHERE id = p_partido_id;

  -- 3. Insert into historial (idempotent — skip if already recorded)
  IF NOT v_ya_registrado THEN
    SELECT titulo INTO v_titulo FROM public.torneos WHERE id = v_partido.torneo_id;

    INSERT INTO public.torneo_partidos_historial (
      partido_id, torneo_id, torneo_titulo, categoria, grupo,
      jugador1_perfil_id, jugador2_perfil_id, ganador_perfil_id,
      sets_json, sets_jugador1, sets_jugador2,
      puntos_jugador1, puntos_jugador2,
      cargado_por_perfil_id, registrado_por, cargado_en,
      stage_name, ronda
    ) VALUES (
      v_partido.id,
      v_partido.torneo_id::integer,
      v_titulo,
      COALESCE(v_partido.categoria, ''),
      COALESCE(v_partido.grupo, ''),
      v_partido.jugador1_id,
      v_partido.jugador2_id,
      p_ganador_id,
      p_sets_json,
      v_sets_j1, v_sets_j2,
      v_pts_j1,  v_pts_j2,
      auth.uid(), auth.uid(), now(),
      v_partido.stage_name,
      v_partido.ronda
    );

    -- 4. Update group standings only for non-bracket (round-robin) matches
    IF COALESCE(v_partido.grupo, '') <> '' AND v_partido.bracket_tipo IS NULL THEN
      UPDATE public.torneo_jugadores tj
      SET
        puntos = COALESCE(tj.puntos, 0)
          + CASE WHEN tj.perfil_id = v_partido.jugador1_id THEN v_pts_j1
                 WHEN tj.perfil_id = v_partido.jugador2_id THEN v_pts_j2
                 ELSE 0 END,
        sets_ganados = COALESCE(tj.sets_ganados, 0)
          + CASE WHEN tj.perfil_id = v_partido.jugador1_id THEN v_sets_j1
                 WHEN tj.perfil_id = v_partido.jugador2_id THEN v_sets_j2
                 ELSE 0 END,
        sets_perdidos = COALESCE(tj.sets_perdidos, 0)
          + CASE WHEN tj.perfil_id = v_partido.jugador1_id THEN v_sets_j2
                 WHEN tj.perfil_id = v_partido.jugador2_id THEN v_sets_j1
                 ELSE 0 END,
        partidos_jugados = COALESCE(tj.partidos_jugados, 0) + 1
      WHERE tj.torneo_id = v_partido.torneo_id
        AND tj.categoria = v_partido.categoria
        AND tj.grupo     = v_partido.grupo
        AND tj.perfil_id IN (v_partido.jugador1_id, v_partido.jugador2_id);
    END IF;
  END IF;

  RETURN FORMAT(
    'OK: Partido %s forzado. Ganador: %s. Resultado: %s. Historial: %s. Motivo: %s',
    p_partido_id,
    p_ganador_id,
    v_resultado,
    CASE WHEN v_ya_registrado THEN 'ya existía' ELSE 'insertado' END,
    COALESCE(p_motivo, 'sin motivo')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_forzar_resultado_partido(uuid, uuid, jsonb, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_forzar_resultado_partido(uuid, uuid, jsonb, text) TO authenticated, service_role;

-- ─── 5. admin_resetear_disputa ───────────────────────────────────────────────
-- Clears a 'discrepancia' proposal so both players can re-submit scores.
-- Also resets the match back to 'programado' so the proposal flow can restart.

CREATE OR REPLACE FUNCTION public.admin_resetear_disputa(
  p_partido_id  uuid,
  p_motivo      text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permiso denegado: solo admin puede resetear disputas.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.partidos WHERE id = p_partido_id) THEN
    RAISE EXCEPTION 'Partido no encontrado: %', p_partido_id;
  END IF;

  UPDATE public.torneo_propuestas_partido
  SET estado             = 'pendiente',
      sets_json_j1       = NULL,
      sets_json_j2       = NULL,
      debe_confirmar_por = NULL,
      updated_at         = now()
  WHERE partido_id = p_partido_id
    AND estado     = 'discrepancia';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    UPDATE public.partidos
    SET estado      = 'programado',
        ganador_id  = NULL,
        resultado   = NULL,
        set1_j1 = NULL, set1_j2 = NULL,
        set2_j1 = NULL, set2_j2 = NULL,
        set3_j1 = NULL, set3_j2 = NULL,
        updated_at  = now()
    WHERE id     = p_partido_id
      AND estado NOT IN ('finalizado');
  END IF;

  RETURN FORMAT(
    'OK: Disputa del partido %s reseteada (%s filas). Motivo: %s',
    p_partido_id,
    v_rows,
    COALESCE(p_motivo, 'sin motivo')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_resetear_disputa(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_resetear_disputa(uuid, text) TO authenticated, service_role;
