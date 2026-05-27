-- ============================================================
-- Fix: Add jugador1_id and jugador2_id to torneo_partidos_historial INSERT
-- Issue: validar_resultado_seguro was only inserting jugador1_perfil_id/jugador2_perfil_id
--        but the table columns jugador1_id/jugador2_id are NOT NULL
--        This caused HTTP 400 errors when confirming results
-- ============================================================

CREATE OR REPLACE FUNCTION public.validar_resultado_seguro(
  p_partido_id uuid,
  p_user_id uuid,
  p_accion text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partido public.partidos%rowtype;
  v_propuesta public.torneo_propuestas_partido%rowtype;
  v_set_row jsonb;
  v_sets jsonb;
  v_existing_historial_id uuid;
  v_sets_j1 integer := 0;
  v_sets_j2 integer := 0;
  v_pts_j1 integer := 0;
  v_pts_j2 integer := 0;
  v_winner uuid;
  v_resultado text;
  v_historial_insertado boolean := false;
  v_scope_updates integer := 0;
  v_torneo_titulo text;
BEGIN
  -- Identity binding: caller must match the claimed p_user_id
  IF auth.uid() IS NULL THEN
    RETURN 'No autenticado.';
  END IF;
  IF p_user_id <> auth.uid() THEN
    RETURN 'No puedes actuar en nombre de otro jugador.';
  END IF;

  IF p_partido_id IS NULL OR p_user_id IS NULL THEN
    RETURN 'Partido o usuario invalido.';
  END IF;

  SELECT * INTO v_partido FROM public.partidos p WHERE p.id = p_partido_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'Partido no encontrado.';
  END IF;

  IF p_user_id NOT IN (v_partido.jugador1_id, v_partido.jugador2_id) THEN
    RETURN 'Solo los jugadores del partido pueden validar resultado.';
  END IF;

  SELECT * INTO v_propuesta FROM public.torneo_propuestas_partido tpp WHERE tpp.partido_id = p_partido_id FOR UPDATE;

  IF v_propuesta.id IS NOT NULL AND v_propuesta.debe_confirmar_por IS NOT NULL THEN
    IF p_user_id <> v_propuesta.debe_confirmar_por THEN
      RETURN 'Solo el jugador designado puede confirmar o rechazar este resultado.';
    END IF;
  ELSIF p_user_id <> v_partido.jugador2_id THEN
    RETURN 'Solo el Jugador 2 puede confirmar o rechazar este resultado.';
  END IF;

  IF LOWER(COALESCE(p_accion, '')) = 'rechazar' THEN
    UPDATE public.partidos
    SET estado = 'programado', resultado = NULL, ganador_id = NULL,
        set1_j1 = NULL, set1_j2 = NULL, set2_j1 = NULL, set2_j2 = NULL, set3_j1 = NULL, set3_j2 = NULL
    WHERE id = p_partido_id;

    IF FOUND AND v_propuesta.id IS NOT NULL THEN
      UPDATE public.torneo_propuestas_partido
      SET estado = 'discrepancia', sets_json_j1 = NULL, sets_json_j2 = NULL, debe_confirmar_por = NULL, updated_at = now()
      WHERE id = v_propuesta.id;
    END IF;

    RETURN 'OK_RECHAZADO';
  END IF;

  IF LOWER(COALESCE(p_accion, '')) <> 'confirmar' THEN
    RETURN 'Accion invalida.';
  END IF;

  IF COALESCE(v_partido.estado, '') NOT IN ('esperando_validacion', 'finalizado') THEN
    RETURN 'El partido no esta esperando validacion.';
  END IF;

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

  IF v_sets_j1 > v_sets_j2 THEN
    v_winner := v_partido.jugador1_id;
    v_pts_j1 := CASE WHEN v_sets_j2 = 0 THEN 3 ELSE 2 END;
    v_pts_j2 := CASE WHEN v_sets_j2 = 1 THEN 1 ELSE 0 END;
  ELSE
    v_winner := v_partido.jugador2_id;
    v_pts_j2 := CASE WHEN v_sets_j1 = 0 THEN 3 ELSE 2 END;
    v_pts_j1 := CASE WHEN v_sets_j1 = 1 THEN 1 ELSE 0 END;
  END IF;

  v_resultado := FORMAT('%s-%s', v_sets_j1, v_sets_j2);

  SELECT t.titulo INTO v_torneo_titulo FROM public.torneos t WHERE t.id = v_partido.torneo_id::bigint;

  IF v_existing_historial_id IS NULL THEN
    WITH hist AS (
      INSERT INTO public.torneo_partidos_historial (
        partido_id, torneo_id, torneo_titulo, categoria, grupo,
        jugador1_id, jugador2_id,
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
    v_historial_insertado := true;
  END IF;

  UPDATE public.torneo_propuestas_partido
  SET estado = 'confirmado', debe_confirmar_por = NULL, updated_at = now()
  WHERE id = v_propuesta.id;

  UPDATE public.partidos
  SET estado = 'finalizado', resultado = v_resultado, ganador_id = v_winner
  WHERE id = p_partido_id;

  IF v_partido.torneo_id IS NOT NULL AND COALESCE(v_partido.grupo, '') <> '' THEN
    UPDATE public.torneo_jugadores tj
    SET puntos = COALESCE(tj.puntos, 0) + CASE WHEN tj.perfil_id = v_partido.jugador1_id THEN v_pts_j1 WHEN tj.perfil_id = v_partido.jugador2_id THEN v_pts_j2 ELSE 0 END,
        sets_ganados = COALESCE(tj.sets_ganados, 0) + CASE WHEN tj.perfil_id = v_partido.jugador1_id THEN v_sets_j1 WHEN tj.perfil_id = v_partido.jugador2_id THEN v_sets_j2 ELSE 0 END,
        partidos_jugados = COALESCE(tj.partidos_jugados, 0) + CASE WHEN tj.perfil_id IN (v_partido.jugador1_id, v_partido.jugador2_id) THEN 1 ELSE 0 END
    WHERE tj.torneo_id = v_partido.torneo_id
      AND tj.categoria = v_partido.categoria
      AND tj.grupo = v_partido.grupo
      AND tj.perfil_id IN (v_partido.jugador1_id, v_partido.jugador2_id);

    GET DIAGNOSTICS v_scope_updates = ROW_COUNT;
  END IF;

  RETURN 'OK_CONFIRMADO';
END;
$$;

GRANT EXECUTE ON FUNCTION public.validar_resultado_seguro(uuid, uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.validar_resultado_seguro(uuid, uuid, text) FROM anon;
