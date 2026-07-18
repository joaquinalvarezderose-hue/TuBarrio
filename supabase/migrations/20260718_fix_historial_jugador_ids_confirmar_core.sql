-- Fix: _confirmar_resultado_core (20260718_auto_confirmar_resultados_24hs.sql) reintrodujo
-- el bug ya corregido en 20260603_fix_historial_jugador_ids.sql: el INSERT en
-- torneo_partidos_historial no poblaba las columnas legacy NOT NULL jugador1_id/jugador2_id/ganador_id,
-- solo las _perfil_id. Esto hacía fallar TODA confirmación (manual y automática por cron)
-- con "null value in column jugador1_id violates not-null constraint".

CREATE OR REPLACE FUNCTION public._confirmar_resultado_core(
  p_partido_id uuid,
  p_automatico boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partido                public.partidos%rowtype;
  v_propuesta              public.torneo_propuestas_partido%rowtype;
  v_set_row                jsonb;
  v_sets                   jsonb;
  v_existing_historial_id  uuid;
  v_sets_j1                integer := 0;
  v_sets_j2                integer := 0;
  v_pts_j1                 integer := 0;
  v_pts_j2                 integer := 0;
  v_winner                 uuid;
  v_resultado              text;
  v_torneo_titulo          text;
BEGIN
  SELECT * INTO v_partido FROM public.partidos p WHERE p.id = p_partido_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'Partido no encontrado.';
  END IF;

  IF COALESCE(v_partido.estado, '') NOT IN ('esperando_validacion', 'finalizado') THEN
    RETURN 'El partido no esta esperando validacion.';
  END IF;

  SELECT * INTO v_propuesta FROM public.torneo_propuestas_partido tpp WHERE tpp.partido_id = p_partido_id FOR UPDATE;

  SELECT h.id INTO v_existing_historial_id FROM public.torneo_partidos_historial h WHERE h.partido_id = p_partido_id LIMIT 1;

  IF v_propuesta.id IS NOT NULL THEN
    v_sets := COALESCE(v_propuesta.sets_json_j1, v_propuesta.sets_json_j2);
  END IF;

  IF v_sets IS NULL AND v_partido.set1_j1 IS NOT NULL AND v_partido.set1_j2 IS NOT NULL AND v_partido.set2_j1 IS NOT NULL AND v_partido.set2_j2 IS NOT NULL THEN
    v_sets := jsonb_build_array(
      jsonb_build_object('p1', v_partido.set1_j1, 'p2', v_partido.set1_j2),
      jsonb_build_object('p1', v_partido.set2_j1, 'p2', v_partido.set2_j2),
      jsonb_build_object('p1', COALESCE(v_partido.set3_j1, 0), 'p2', COALESCE(v_partido.set3_j2, 0))
    );
  END IF;

  IF v_sets IS NULL THEN
    RETURN 'No hay un resultado propuesto para confirmar.';
  END IF;

  FOR v_set_row IN SELECT value FROM jsonb_array_elements(v_sets)
  LOOP
    IF COALESCE((v_set_row->>'p1')::integer, 0) > COALESCE((v_set_row->>'p2')::integer, 0) THEN
      v_sets_j1 := v_sets_j1 + 1;
    ELSIF COALESCE((v_set_row->>'p2')::integer, 0) > COALESCE((v_set_row->>'p1')::integer, 0) THEN
      v_sets_j2 := v_sets_j2 + 1;
    END IF;
  END LOOP;

  IF v_sets_j1 = v_sets_j2 THEN
    RETURN 'El marcador propuesto no define un ganador valido.';
  END IF;

  -- Puntuación plana: ganar = 3 pts, perder = 1 pt (independiente del marcador de sets)
  IF v_sets_j1 > v_sets_j2 THEN
    v_winner  := v_partido.jugador1_id;
    v_pts_j1  := 3;
    v_pts_j2  := 1;
  ELSE
    v_winner  := v_partido.jugador2_id;
    v_pts_j2  := 3;
    v_pts_j1  := 1;
  END IF;

  v_resultado := FORMAT('%s-%s', v_sets_j1, v_sets_j2);

  SELECT t.titulo INTO v_torneo_titulo FROM public.torneos t WHERE t.id = v_partido.torneo_id::bigint;

  IF v_existing_historial_id IS NULL THEN
    WITH hist AS (
      INSERT INTO public.torneo_partidos_historial (
        partido_id, torneo_id, torneo_titulo, categoria, grupo,
        jugador1_id, jugador2_id, ganador_id,
        jugador1_perfil_id, jugador2_perfil_id, ganador_perfil_id,
        sets_json, sets_jugador1, sets_jugador2, puntos_jugador1, puntos_jugador2,
        external_match_key, cargado_por_perfil_id, cargado_en,
        stage_name, ronda
      ) VALUES (
        v_partido.id,
        COALESCE(v_partido.torneo_id, 0)::integer,
        v_torneo_titulo,
        COALESCE(v_partido.categoria, ''),
        COALESCE(v_partido.grupo, ''),
        v_partido.jugador1_id,
        v_partido.jugador2_id,
        v_winner,
        v_partido.jugador1_id,
        v_partido.jugador2_id,
        v_winner,
        v_sets,
        v_sets_j1,
        v_sets_j2,
        v_pts_j1,
        v_pts_j2,
        v_propuesta.match_pair_key,
        v_propuesta.ultimo_cargado_por,
        now(),
        v_partido.stage_name,
        v_partido.ronda
      )
      RETURNING id
    )
    SELECT id INTO v_existing_historial_id FROM hist;
  END IF;

  UPDATE public.torneo_propuestas_partido
  SET estado = 'confirmado', debe_confirmar_por = NULL, updated_at = now(),
      confirmado_automaticamente = p_automatico
  WHERE id = v_propuesta.id;

  UPDATE public.partidos
  SET estado      = 'finalizado',
      resultado   = v_resultado,
      ganador_id  = v_winner,
      sets_jugador1 = v_sets_j1,
      sets_jugador2 = v_sets_j2,
      confirmado_automaticamente = p_automatico
  WHERE id = p_partido_id;

  IF v_partido.torneo_id IS NOT NULL AND COALESCE(v_partido.grupo, '') <> '' THEN
    UPDATE public.torneo_jugadores tj
    SET
      puntos = COALESCE(tj.puntos, 0) + CASE
        WHEN tj.perfil_id = v_partido.jugador1_id THEN v_pts_j1
        WHEN tj.perfil_id = v_partido.jugador2_id THEN v_pts_j2
        ELSE 0
      END,
      sets_ganados = COALESCE(tj.sets_ganados, 0) + CASE
        WHEN tj.perfil_id = v_partido.jugador1_id THEN v_sets_j1
        WHEN tj.perfil_id = v_partido.jugador2_id THEN v_sets_j2
        ELSE 0
      END,
      sets_perdidos = COALESCE(tj.sets_perdidos, 0) + CASE
        WHEN tj.perfil_id = v_partido.jugador1_id THEN v_sets_j2
        WHEN tj.perfil_id = v_partido.jugador2_id THEN v_sets_j1
        ELSE 0
      END,
      partidos_jugados = COALESCE(tj.partidos_jugados, 0) + CASE
        WHEN tj.perfil_id IN (v_partido.jugador1_id, v_partido.jugador2_id) THEN 1
        ELSE 0
      END
    WHERE tj.torneo_id = v_partido.torneo_id
      AND tj.categoria = v_partido.categoria
      AND tj.grupo     = v_partido.grupo
      AND tj.perfil_id IN (v_partido.jugador1_id, v_partido.jugador2_id);
  END IF;

  RETURN 'OK_CONFIRMADO';
END;
$$;

REVOKE ALL ON FUNCTION public._confirmar_resultado_core(uuid, boolean) FROM PUBLIC, authenticated, anon;
