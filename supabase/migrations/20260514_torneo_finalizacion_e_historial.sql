-- ============================================================
-- Tournament Finalization, Historical Stats & Finalista State
--
-- Changes:
-- 1. promover_ganador_bracket: auto-close tournament when Final is played
-- 2. torneo_partidos_historial: add stage_name, ronda columns
-- 3. torneo_partidos_historial: change partido_id FK to ON DELETE SET NULL
-- 4. validar_resultado_seguro: populate torneo_titulo, stage_name, ronda in historial
-- 5. obtener_estado_jugador_torneo: return 'finalista' for finalist (lost in Final)
-- 6. New RPC: obtener_estadisticas_historicas_jugador
-- 7. Backfill existing data (torneo 3)
-- ============================================================


-- ============================================================
-- 1. Schema changes on torneo_partidos_historial
-- ============================================================

ALTER TABLE public.torneo_partidos_historial
  ADD COLUMN IF NOT EXISTS stage_name TEXT,
  ADD COLUMN IF NOT EXISTS ronda INTEGER;

-- Change partido_id FK to SET NULL on delete (preserve history if a match is deleted)
ALTER TABLE public.torneo_partidos_historial
  DROP CONSTRAINT IF EXISTS torneo_partidos_historial_partido_id_fkey;

ALTER TABLE public.torneo_partidos_historial
  ADD CONSTRAINT torneo_partidos_historial_partido_id_fkey
  FOREIGN KEY (partido_id) REFERENCES public.partidos(id) ON DELETE SET NULL;


-- ============================================================
-- 2. promover_ganador_bracket: auto-finalize tournament at Final
-- ============================================================

CREATE OR REPLACE FUNCTION public.promover_ganador_bracket()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.bracket_tipo = 'eliminacion_directa'
    AND NEW.estado = 'finalizado'
    AND NEW.ganador_id IS NOT NULL
    AND (OLD.estado IS DISTINCT FROM 'finalizado' OR OLD.ganador_id IS NULL)
  THEN
    IF NEW.siguiente_partido_id IS NOT NULL THEN
      -- Promote winner to next match slot (odd position → jugador1, even → jugador2)
      IF NEW.posicion_bracket % 2 = 1 THEN
        UPDATE public.partidos SET jugador1_id = NEW.ganador_id WHERE id = NEW.siguiente_partido_id;
      ELSE
        UPDATE public.partidos SET jugador2_id = NEW.ganador_id WHERE id = NEW.siguiente_partido_id;
      END IF;
    ELSE
      -- siguiente_partido_id IS NULL → this is the Final; close the tournament
      UPDATE public.torneo_estado
      SET estado = 'FINALIZADO', updated_at = now()
      WHERE torneo_id = NEW.torneo_id
        AND categoria = NEW.categoria
        AND grupo LIKE '%_PLAYOFFS';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_promover_ganador_bracket ON public.partidos;
CREATE TRIGGER trigger_promover_ganador_bracket
  AFTER UPDATE ON public.partidos
  FOR EACH ROW EXECUTE FUNCTION public.promover_ganador_bracket();


-- ============================================================
-- 3. validar_resultado_seguro: populate torneo_titulo, stage_name, ronda
-- ============================================================

CREATE OR REPLACE FUNCTION public.validar_resultado_seguro(
  p_partido_id uuid,
  p_user_id uuid,
  p_accion text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  IF p_partido_id IS NULL OR p_user_id IS NULL THEN
    RETURN 'Partido o usuario invalido.';
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
    RETURN 'Solo los jugadores del partido pueden validar resultado.';
  END IF;

  -- Fetch the proposal to check who must confirm
  SELECT *
  INTO v_propuesta
  FROM public.torneo_propuestas_partido tpp
  WHERE tpp.partido_id = p_partido_id
  FOR UPDATE;

  -- Use debe_confirmar_por if available, fallback to jugador2_id for backward compatibility
  IF v_propuesta.id IS NOT NULL AND v_propuesta.debe_confirmar_por IS NOT NULL THEN
    IF p_user_id <> v_propuesta.debe_confirmar_por THEN
      RETURN 'Solo el jugador designado puede confirmar o rechazar este resultado.';
    END IF;
  ELSIF p_user_id <> v_partido.jugador2_id THEN
    RETURN 'Solo el Jugador 2 puede confirmar o rechazar este resultado.';
  END IF;

  IF LOWER(COALESCE(p_accion, '')) = 'rechazar' THEN
    UPDATE public.partidos
    SET estado = 'programado',
        resultado = NULL,
        ganador_id = NULL,
        set1_j1 = NULL,
        set1_j2 = NULL,
        set2_j1 = NULL,
        set2_j2 = NULL,
        set3_j1 = NULL,
        set3_j2 = NULL
    WHERE id = p_partido_id;

    IF FOUND AND v_propuesta.id IS NOT NULL THEN
      UPDATE public.torneo_propuestas_partido
      SET estado = 'discrepancia',
          sets_json_j1 = NULL,
          sets_json_j2 = NULL,
          debe_confirmar_por = NULL,
          updated_at = now()
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

  SELECT h.id
  INTO v_existing_historial_id
  FROM public.torneo_partidos_historial h
  WHERE h.partido_id = p_partido_id
  LIMIT 1;

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

  -- Fetch tournament title for historial
  SELECT t.titulo INTO v_torneo_titulo
  FROM public.torneos t
  WHERE t.id = v_partido.torneo_id::bigint;

  IF v_existing_historial_id IS NULL THEN
    WITH hist AS (
      INSERT INTO public.torneo_partidos_historial (
        partido_id,
        torneo_id,
        torneo_titulo,
        categoria,
        grupo,
        jugador1_perfil_id,
        jugador2_perfil_id,
        ganador_perfil_id,
        sets_json,
        sets_jugador1,
        sets_jugador2,
        puntos_jugador1,
        puntos_jugador2,
        external_match_key,
        cargado_por_perfil_id,
        cargado_en,
        stage_name,
        ronda
      ) VALUES (
        v_partido.id,
        COALESCE(v_partido.torneo_id, 0)::integer,
        v_torneo_titulo,
        COALESCE(v_partido.categoria, ''),
        COALESCE(v_partido.grupo, ''),
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
  SET estado = 'confirmado',
      debe_confirmar_por = NULL,
      updated_at = now()
  WHERE id = v_propuesta.id;

  UPDATE public.partidos
  SET estado = 'finalizado',
      resultado = v_resultado,
      ganador_id = v_winner
  WHERE id = p_partido_id;

  -- Recalc scope points if this match belongs to a group scope
  IF v_partido.torneo_id IS NOT NULL AND COALESCE(v_partido.grupo, '') <> '' THEN
    UPDATE public.torneo_jugadores tj
    SET puntos = COALESCE(tj.puntos, 0) + CASE
          WHEN tj.perfil_id = v_partido.jugador1_id THEN v_pts_j1
          WHEN tj.perfil_id = v_partido.jugador2_id THEN v_pts_j2
          ELSE 0
        END,
        sets_ganados = COALESCE(tj.sets_ganados, 0) + CASE
          WHEN tj.perfil_id = v_partido.jugador1_id THEN v_sets_j1
          WHEN tj.perfil_id = v_partido.jugador2_id THEN v_sets_j2
          ELSE 0
        END,
        partidos_jugados = COALESCE(tj.partidos_jugados, 0) + CASE
          WHEN tj.perfil_id IN (v_partido.jugador1_id, v_partido.jugador2_id) THEN 1
          ELSE 0
        END
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


-- ============================================================
-- 4. obtener_estado_jugador_torneo: return 'finalista' for finalist
-- ============================================================

CREATE OR REPLACE FUNCTION public.obtener_estado_jugador_torneo(
  p_torneo_id  bigint,
  p_perfil_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_match       jsonb := NULL;
  v_stats            jsonb;
  v_estado           text;
  v_mensaje          text;
  v_ronda_actual     integer := NULL;
  v_total            integer := 0;
  v_wins             integer := 0;
  v_losses           integer := 0;
  v_sets_won         integer := 0;
  v_sets_lost        integer := 0;

  -- bracket-related
  v_bracket_played   integer := 0;
  v_bracket_wins     integer := 0;
  v_bracket_losses   integer := 0;
  v_max_ronda        integer := NULL;
  v_total_rondas     integer := NULL;
  v_has_pending      boolean := false;
  v_total_playoff_players integer := 0;
  v_stage_name       text := NULL;
  v_current_round    integer := NULL;

  -- next match row
  rec RECORD;
BEGIN

  -- --------------------------------------------------------
  -- 1. Compute all-time stats for this player in this tournament
  -- --------------------------------------------------------
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE ganador_id = p_perfil_id)::int,
    COUNT(*) FILTER (WHERE ganador_id IS NOT NULL AND ganador_id <> p_perfil_id)::int,
    COALESCE(SUM(
      CASE
        WHEN jugador1_id = p_perfil_id THEN
          COALESCE(set1_j1,0) + COALESCE(set2_j1,0) + COALESCE(set3_j1,0)
        ELSE
          COALESCE(set1_j2,0) + COALESCE(set2_j2,0) + COALESCE(set3_j2,0)
      END
    ), 0)::int,
    COALESCE(SUM(
      CASE
        WHEN jugador1_id = p_perfil_id THEN
          COALESCE(set1_j2,0) + COALESCE(set2_j2,0) + COALESCE(set3_j2,0)
        ELSE
          COALESCE(set1_j1,0) + COALESCE(set2_j1,0) + COALESCE(set3_j1,0)
      END
    ), 0)::int
  INTO v_total, v_wins, v_losses, v_sets_won, v_sets_lost
  FROM public.partidos
  WHERE torneo_id = p_torneo_id
    AND (jugador1_id = p_perfil_id OR jugador2_id = p_perfil_id)
    AND estado = 'finalizado';

  v_stats := jsonb_build_object(
    'total',      v_total,
    'wins',       v_wins,
    'losses',     v_losses,
    'sets_won',   v_sets_won,
    'sets_lost',  v_sets_lost,
    'win_rate',   CASE WHEN v_total > 0 THEN ROUND((v_wins::numeric / v_total) * 100) ELSE 0 END
  );

  -- --------------------------------------------------------
  -- 2. No participation at all → sin_participacion
  -- --------------------------------------------------------
  IF v_total = 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.partidos
      WHERE torneo_id = p_torneo_id
        AND (jugador1_id = p_perfil_id OR jugador2_id = p_perfil_id)
        AND estado = 'programado'
    ) INTO v_has_pending;

    IF NOT v_has_pending THEN
      RETURN jsonb_build_object(
        'estado',          'sin_participacion',
        'proximo_partido', NULL,
        'stats',           v_stats,
        'ronda_actual',    NULL,
        'mensaje',         'No tenés partidos registrados en este torneo todavía.'
      );
    END IF;
  END IF;

  -- --------------------------------------------------------
  -- 3. Find next scheduled match for this player
  -- --------------------------------------------------------
  SELECT
    p.id,
    p.jornada,
    p.estado,
    p.fecha_programada,
    p.jugador1_id,
    p.jugador2_id,
    p.ronda,
    p.bracket_tipo,
    p.grupo,
    p.categoria,
    p.stage_name,
    pr1.nombre_completo AS jugador1_nombre,
    pr1.whatsapp        AS jugador1_whatsapp,
    pr2.nombre_completo AS jugador2_nombre,
    pr2.whatsapp        AS jugador2_whatsapp
  INTO rec
  FROM public.partidos p
  LEFT JOIN public.perfiles pr1 ON pr1.id = p.jugador1_id
  LEFT JOIN public.perfiles pr2 ON pr2.id = p.jugador2_id
  WHERE p.torneo_id = p_torneo_id
    AND (p.jugador1_id = p_perfil_id OR p.jugador2_id = p_perfil_id)
    AND p.estado = 'programado'
  ORDER BY
    p.ronda ASC NULLS LAST,
    p.jornada ASC,
    p.fecha_programada ASC NULLS LAST
  LIMIT 1;

  IF rec.id IS NOT NULL THEN
    v_next_match := jsonb_build_object(
      'id',               rec.id,
      'jornada',          rec.jornada,
      'estado',           rec.estado,
      'fecha_programada', rec.fecha_programada,
      'jugador1_id',      rec.jugador1_id,
      'jugador2_id',      rec.jugador2_id,
      'ronda',            rec.ronda,
      'bracket_tipo',     rec.bracket_tipo,
      'grupo',            rec.grupo,
      'categoria',        rec.categoria,
      'stage_name',       rec.stage_name,
      'rival_id',         CASE WHEN rec.jugador1_id = p_perfil_id THEN rec.jugador2_id ELSE rec.jugador1_id END,
      'rival_nombre',     CASE WHEN rec.jugador1_id = p_perfil_id THEN rec.jugador2_nombre ELSE rec.jugador1_nombre END,
      'rival_whatsapp',   CASE WHEN rec.jugador1_id = p_perfil_id THEN rec.jugador2_whatsapp ELSE rec.jugador1_whatsapp END
    );

    RETURN jsonb_build_object(
      'estado',          'activo',
      'proximo_partido', v_next_match,
      'stats',           v_stats,
      'ronda_actual',    rec.ronda,
      'stage_name',      v_stage_name,
      'mensaje',         'Tenés un partido pendiente.'
    );
  END IF;

  -- --------------------------------------------------------
  -- 4. No pending match → analyse bracket history
  -- --------------------------------------------------------
  SELECT
    COUNT(*) FILTER (WHERE bracket_tipo = 'eliminacion_directa')::int,
    COUNT(*) FILTER (WHERE bracket_tipo = 'eliminacion_directa' AND ganador_id = p_perfil_id)::int,
    COUNT(*) FILTER (WHERE bracket_tipo = 'eliminacion_directa' AND ganador_id IS NOT NULL AND ganador_id <> p_perfil_id)::int,
    MAX(ronda) FILTER (WHERE bracket_tipo = 'eliminacion_directa')
  INTO v_bracket_played, v_bracket_wins, v_bracket_losses, v_max_ronda
  FROM public.partidos
  WHERE torneo_id = p_torneo_id
    AND (jugador1_id = p_perfil_id OR jugador2_id = p_perfil_id)
    AND estado = 'finalizado';

  -- How many rounds does this bracket have in total?
  IF v_max_ronda IS NOT NULL THEN
    SELECT MAX(ronda)
    INTO v_total_rondas
    FROM public.partidos
    WHERE torneo_id = p_torneo_id
      AND bracket_tipo = 'eliminacion_directa';

    v_ronda_actual := v_max_ronda;
  END IF;

  -- Calculate total number of playoff players
  SELECT COUNT(DISTINCT COALESCE(jugador1_id, jugador2_id))
  INTO v_total_playoff_players
  FROM public.partidos
  WHERE torneo_id = p_torneo_id
    AND bracket_tipo = 'eliminacion_directa';

  -- Determine stage name based on round position relative to total rounds
  IF rec.id IS NOT NULL AND rec.ronda IS NOT NULL THEN
    v_current_round := rec.ronda;
  ELSIF v_max_ronda IS NOT NULL THEN
    v_current_round := v_max_ronda;
  END IF;

  IF v_current_round IS NOT NULL AND v_total_rondas IS NOT NULL THEN
    CASE
      WHEN v_current_round = v_total_rondas THEN
        v_stage_name := 'Final';
      WHEN v_current_round = v_total_rondas - 1 AND v_total_rondas >= 3 THEN
        v_stage_name := 'Semifinal';
      WHEN v_current_round = v_total_rondas - 2 AND v_total_rondas >= 4 THEN
        v_stage_name := 'Cuartos de Final';
      WHEN v_current_round = v_total_rondas - 3 AND v_total_rondas >= 5 THEN
        v_stage_name := 'Octavos de Final';
      WHEN v_current_round = v_total_rondas - 4 AND v_total_rondas >= 6 THEN
        v_stage_name := 'Dieciseisavos de Final';
      ELSE
        CASE v_current_round
          WHEN 1 THEN
            CASE v_total_rondas
              WHEN 1 THEN v_stage_name := 'Final';
              WHEN 2 THEN v_stage_name := 'Semifinal';
              ELSE v_stage_name := 'Primera Ronda';
            END CASE;
          WHEN 2 THEN
            CASE v_total_rondas
              WHEN 2 THEN v_stage_name := 'Final';
              WHEN 3 THEN v_stage_name := 'Semifinal';
              ELSE v_stage_name := 'Segunda Ronda';
            END CASE;
          ELSE
            v_stage_name := 'Ronda ' || v_current_round;
        END CASE;
    END CASE;
  END IF;

  -- --------------------------------------------------------
  -- 5. Was player eliminated in bracket?
  -- --------------------------------------------------------
  IF v_bracket_losses > 0 THEN
    -- Lost at least one bracket match → check if it was the Final
    IF v_max_ronda IS NOT NULL AND v_total_rondas IS NOT NULL AND v_max_ronda = v_total_rondas THEN
      -- Lost in the Final → Finalist (runner-up)
      RETURN jsonb_build_object(
        'estado',          'finalista',
        'proximo_partido', NULL,
        'stats',           v_stats,
        'ronda_actual',    v_ronda_actual,
        'stage_name',      v_stage_name,
        'mensaje',         '¡Llegaste a la Final! Una actuación increíble en el torneo.'
      );
    END IF;

    RETURN jsonb_build_object(
      'estado',          'eliminado',
      'proximo_partido', NULL,
      'stats',           v_stats,
      'ronda_actual',    v_ronda_actual,
      'stage_name',      v_stage_name,
      'mensaje',         'No avanzaste a la siguiente ronda. Podés seguir viendo los resultados del torneo.'
    );
  END IF;

  -- --------------------------------------------------------
  -- 6. Won every bracket match played, no pending match →
  --    either champion or waiting for next round to be generated
  -- --------------------------------------------------------
  IF v_bracket_wins > 0 AND v_bracket_losses = 0 THEN
    -- Are they the winner of the final round?
    IF v_max_ronda IS NOT NULL AND v_total_rondas IS NOT NULL AND v_max_ronda = v_total_rondas THEN
      RETURN jsonb_build_object(
        'estado',          'campeon',
        'proximo_partido', NULL,
        'stats',           v_stats,
        'ronda_actual',    v_ronda_actual,
        'stage_name',      v_stage_name,
        'mensaje',         '¡Sos el campeón del torneo!'
      );
    END IF;

    -- Won bracket matches but final hasn't been generated yet
    RETURN jsonb_build_object(
      'estado',          'esperando_siguiente_ronda',
      'proximo_partido', NULL,
      'stats',           v_stats,
      'ronda_actual',    v_ronda_actual,
      'stage_name',      v_stage_name,
      'mensaje',         'Avanzaste a la siguiente ronda. Esperá que se generen los cruces.'
    );
  END IF;

  -- --------------------------------------------------------
  -- 7. Has only group-stage matches and no next match →
  --    group stage finished, waiting for playoffs
  -- --------------------------------------------------------
  IF v_total > 0 AND v_bracket_played = 0 THEN
    RETURN jsonb_build_object(
      'estado',          'esperando_siguiente_ronda',
      'proximo_partido', NULL,
      'stats',           v_stats,
      'ronda_actual',    NULL,
      'mensaje',         'Tu fase de grupos terminó. Esperá que se generen los cruces de playoffs.'
    );
  END IF;

  -- Fallback
  RETURN jsonb_build_object(
    'estado',          'sin_participacion',
    'proximo_partido', NULL,
    'stats',           v_stats,
    'ronda_actual',    NULL,
    'mensaje',         'No se pudo determinar el estado del jugador en el torneo.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_estado_jugador_torneo(bigint, uuid) TO authenticated, service_role;


-- ============================================================
-- 5. New RPC: obtener_estadisticas_historicas_jugador
-- ============================================================

CREATE OR REPLACE FUNCTION public.obtener_estadisticas_historicas_jugador(
  p_perfil_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_partidos',  COUNT(*)::int,
    'victorias',       COUNT(*) FILTER (WHERE ganador_perfil_id = p_perfil_id)::int,
    'derrotas',        COUNT(*) FILTER (WHERE ganador_perfil_id IS NOT NULL AND ganador_perfil_id <> p_perfil_id)::int,
    'win_rate',        ROUND(
                         COUNT(*) FILTER (WHERE ganador_perfil_id = p_perfil_id)::numeric
                         / NULLIF(COUNT(*), 0) * 100
                       )::int,
    'sets_ganados',    COALESCE(SUM(
                         CASE WHEN jugador1_perfil_id = p_perfil_id THEN sets_jugador1 ELSE sets_jugador2 END
                       ), 0)::int,
    'sets_perdidos',   COALESCE(SUM(
                         CASE WHEN jugador1_perfil_id = p_perfil_id THEN sets_jugador2 ELSE sets_jugador1 END
                       ), 0)::int,
    'por_torneo', (
      SELECT COALESCE(jsonb_agg(t ORDER BY t.fecha DESC), '[]'::jsonb)
      FROM (
        SELECT
          h.torneo_id,
          h.torneo_titulo,
          COUNT(*)::int                                                                              AS partidos,
          COUNT(*) FILTER (WHERE h.ganador_perfil_id = p_perfil_id)::int                            AS victorias,
          MIN(h.cargado_en)                                                                          AS fecha
        FROM public.torneo_partidos_historial h
        WHERE h.jugador1_perfil_id = p_perfil_id OR h.jugador2_perfil_id = p_perfil_id
        GROUP BY h.torneo_id, h.torneo_titulo
      ) t
    )
  )
  INTO v_result
  FROM public.torneo_partidos_historial
  WHERE jugador1_perfil_id = p_perfil_id OR jugador2_perfil_id = p_perfil_id;

  RETURN COALESCE(v_result, jsonb_build_object(
    'total_partidos', 0,
    'victorias', 0,
    'derrotas', 0,
    'win_rate', 0,
    'sets_ganados', 0,
    'sets_perdidos', 0,
    'por_torneo', '[]'::jsonb
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_estadisticas_historicas_jugador(uuid) TO authenticated, service_role;


-- ============================================================
-- 6. Backfill existing data for torneo 3
-- ============================================================

-- Fix torneo_titulo NULL for all existing records
UPDATE public.torneo_partidos_historial h
SET torneo_titulo = t.titulo
FROM public.torneos t
WHERE t.id = h.torneo_id::bigint
  AND h.torneo_titulo IS NULL;

-- Populate stage_name and ronda from partidos for existing records
UPDATE public.torneo_partidos_historial h
SET stage_name = p.stage_name,
    ronda      = p.ronda
FROM public.partidos p
WHERE p.id = h.partido_id
  AND (h.stage_name IS NULL OR h.ronda IS NULL);

-- Auto-close torneo 3 (already has a champion, bracket is done)
UPDATE public.torneo_estado
SET estado = 'FINALIZADO', updated_at = now()
WHERE torneo_id = 3
  AND grupo LIKE '%_PLAYOFFS'
  AND estado <> 'FINALIZADO';
