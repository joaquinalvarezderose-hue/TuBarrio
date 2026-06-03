-- Corrige la imprecisión de la pantalla "Avanzaste de ronda" en la fase de grupos.
--
-- Problema: obtener_estado_jugador_torneo devolvía 'esperando_siguiente_ronda'
-- para CUALQUIER jugador que terminó sus partidos de grupo y no tenía partido de
-- bracket, sin mirar su posición ni si el grupo había terminado. Resultado: un
-- jugador 6.º que no clasificó veía "Avanzaste de ronda", incluso con partidos del
-- grupo todavía sin jugar.
--
-- Solución:
--   1. Helper jugador_clasifica_en_fase_grupos: replica el seeding del generador de
--      playoffs (top-N por grupo + mejores terceros) para saber si un jugador entra
--      realmente al bracket.
--   2. Sección 7 de obtener_estado_jugador_torneo:
--      - Si quedan partidos de fase de grupos sin jugar en la categoría →
--        'fase_grupos_en_curso' (no se puede asegurar la clasificación todavía).
--      - Si la fase de grupos terminó y el jugador clasificó → 'esperando_siguiente_ronda'.
--      - Si terminó y no clasificó → 'eliminado'.
-- Fecha: 2026-06-03

-- ============================================================
-- 1. Helper: ¿el jugador clasifica en la fase de grupos?
--    Mantiene el mismo criterio que generar_playoffs_eliminacion_directa_torneo
--    (20260520_mejores_terceros_playoffs.sql) para que coincida con quién entra
--    realmente al bracket.
-- ============================================================

CREATE OR REPLACE FUNCTION public.jugador_clasifica_en_fase_grupos(
  p_torneo_id bigint,
  p_categoria text,
  p_perfil_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categoria                 text;
  v_grupo_base                text;
  v_grupo_base_id             uuid;
  v_clasificados_por_grupo    integer := 2;
  v_incluir_mejores_terceros  boolean := false;
  v_cantidad_mejores_terceros integer := 0;
  v_clasifica                 boolean := false;
BEGIN
  v_categoria := nullif(trim(coalesce(p_categoria, '')), '');
  IF v_categoria IS NULL THEN
    SELECT t.subtitulo INTO v_categoria FROM public.torneos t WHERE t.id = p_torneo_id LIMIT 1;
  END IF;
  v_categoria := coalesce(v_categoria, 'General');

  SELECT
    greatest(1, coalesce(tc.clasificados_por_grupo, 2)),
    coalesce(tc.incluir_mejores_terceros, false),
    coalesce(tc.cantidad_mejores_terceros, 0),
    tc.grupo_base_id
  INTO
    v_clasificados_por_grupo,
    v_incluir_mejores_terceros,
    v_cantidad_mejores_terceros,
    v_grupo_base_id
  FROM public.torneo_configuracion tc
  WHERE tc.torneo_id = p_torneo_id;

  SELECT grupo_codigo
  INTO v_grupo_base
  FROM public.resolver_grupo_base_torneo(p_torneo_id, v_categoria, NULL, v_grupo_base_id);

  IF v_grupo_base IS NULL THEN
    RETURN false;
  END IF;

  WITH ranking AS (
    SELECT
      tj.grupo,
      tj.perfil_id,
      coalesce(tj.puntos, 0)           AS puntos,
      coalesce(tj.sets_ganados, 0)     AS sets_ganados,
      coalesce(tj.partidos_jugados, 0) AS partidos_jugados,
      row_number() OVER (
        PARTITION BY tj.grupo
        ORDER BY coalesce(tj.puntos, 0) DESC,
                 coalesce(tj.sets_ganados, 0) DESC,
                 coalesce(tj.partidos_jugados, 0) ASC,
                 tj.perfil_id ASC
      ) AS pos_grupo
    FROM public.torneo_jugadores tj
    WHERE tj.torneo_id = p_torneo_id
      AND tj.categoria = v_categoria
      AND (tj.grupo = v_grupo_base OR starts_with(tj.grupo, v_grupo_base || '_G'))
  ),
  clasificados AS (
    SELECT perfil_id
    FROM ranking
    WHERE pos_grupo <= v_clasificados_por_grupo
  ),
  terceros_rankeados AS (
    SELECT perfil_id,
           row_number() OVER (
             ORDER BY puntos DESC, sets_ganados DESC, partidos_jugados ASC, grupo ASC, perfil_id ASC
           ) AS rank_tercero
    FROM ranking
    WHERE pos_grupo = v_clasificados_por_grupo + 1
  ),
  mejores_terceros AS (
    SELECT perfil_id
    FROM terceros_rankeados
    WHERE v_incluir_mejores_terceros
      AND rank_tercero <= v_cantidad_mejores_terceros
  )
  SELECT EXISTS (
    SELECT 1 FROM clasificados      WHERE perfil_id = p_perfil_id
    UNION ALL
    SELECT 1 FROM mejores_terceros  WHERE perfil_id = p_perfil_id
  ) INTO v_clasifica;

  RETURN coalesce(v_clasifica, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.jugador_clasifica_en_fase_grupos(bigint, text, uuid)
  TO authenticated, service_role;


-- ============================================================
-- 2. obtener_estado_jugador_torneo: sección 7 precisa por clasificación
--    y completitud de la fase de grupos. El resto del cuerpo es idéntico a
--    20260514_torneo_finalizacion_e_historial.sql.
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

  -- group-stage resolution (section 7)
  v_cat              text := NULL;
  v_pendientes       integer := 0;
  v_playoffs_on      boolean := false;

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
  -- 7. Sólo tiene partidos de fase de grupos y ningún partido pendiente.
  --    Decidir según la completitud de la fase de grupos y la clasificación.
  -- --------------------------------------------------------
  IF v_total > 0 AND v_bracket_played = 0 THEN
    -- Categoría del jugador (alcance de la fase de grupos)
    SELECT tj.categoria
    INTO v_cat
    FROM public.torneo_jugadores tj
    WHERE tj.torneo_id = p_torneo_id
      AND tj.perfil_id = p_perfil_id
    LIMIT 1;

    IF v_cat IS NULL THEN
      SELECT p.categoria
      INTO v_cat
      FROM public.partidos p
      WHERE p.torneo_id = p_torneo_id
        AND (p.jugador1_id = p_perfil_id OR p.jugador2_id = p_perfil_id)
        AND p.estado = 'finalizado'
      LIMIT 1;
    END IF;

    -- ¿Hay playoffs por eliminación directa habilitados?
    SELECT coalesce(tc.crear_playoffs_eliminacion_directa, false)
    INTO v_playoffs_on
    FROM public.torneo_configuracion tc
    WHERE tc.torneo_id = p_torneo_id;
    v_playoffs_on := coalesce(v_playoffs_on, false);

    -- Partidos de fase de grupos aún sin finalizar en toda la categoría
    SELECT COUNT(*)
    INTO v_pendientes
    FROM public.partidos p
    WHERE p.torneo_id = p_torneo_id
      AND (v_cat IS NULL OR p.categoria = v_cat)
      AND (p.bracket_tipo IS NULL OR p.bracket_tipo <> 'eliminacion_directa')
      AND p.estado <> 'finalizado';

    IF v_pendientes > 0 THEN
      -- El jugador terminó sus partidos pero la fase de grupos no terminó:
      -- no se puede asegurar la clasificación hasta que se jueguen todos.
      RETURN jsonb_build_object(
        'estado',          'fase_grupos_en_curso',
        'proximo_partido', NULL,
        'stats',           v_stats,
        'ronda_actual',    NULL,
        'mensaje',         'Terminaste tus partidos. La clasificación se definirá cuando se jueguen todos los partidos del grupo.'
      );
    END IF;

    -- Fase de grupos completa → determinar si el jugador realmente clasificó
    IF v_playoffs_on
       AND public.jugador_clasifica_en_fase_grupos(p_torneo_id, v_cat, p_perfil_id) THEN
      RETURN jsonb_build_object(
        'estado',          'esperando_siguiente_ronda',
        'proximo_partido', NULL,
        'stats',           v_stats,
        'ronda_actual',    NULL,
        'mensaje',         'Clasificaste a los playoffs. Esperá que se generen los cruces.'
      );
    END IF;

    -- Fase de grupos completa pero el jugador no clasificó
    RETURN jsonb_build_object(
      'estado',          'eliminado',
      'proximo_partido', NULL,
      'stats',           v_stats,
      'ronda_actual',    NULL,
      'mensaje',         'La fase de grupos terminó y no clasificaste a los playoffs.'
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

GRANT EXECUTE ON FUNCTION public.obtener_estado_jugador_torneo(bigint, uuid)
  TO authenticated, service_role;
