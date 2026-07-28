-- ============================================================
-- COORDINAR PARTIDO — DOBLES — 2026-07-28
-- Extiende la coordinacion de horarios (partido_disponibilidad)
-- para que los 4 integrantes de un partido de dobles puedan
-- cargar su propia disponibilidad y encontrarse coincidencias
-- entre los 4.
--
-- Estrategia: aditivo puro, igual que 20260721_dobles_tournament_support.sql.
-- No se modifica ninguna funcion ni condicion de RLS existente para
-- singles: solo se agregan clausulas OR adicionales que evaluan a
-- false quedan garantizado en un partido de singles (equipo1_id/
-- equipo2_id son NULL ahi), y se agrega una funcion RPC nueva
-- (set_coordinacion_manual_equipo) en vez de tocar la de singles.
-- ============================================================


-- ============================================================
-- 1. obtener_estado_equipo_torneo: exponer companero y mi_equipo_id
--    Necesario para que el frontend pueda armar la lista de los
--    4 participantes (yo, mi companero, los 2 rivales) sin tener
--    que adivinar el "representante" del equipo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.obtener_estado_equipo_torneo(p_torneo_id bigint, p_perfil_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_equipo_id        uuid;
  v_next_match       jsonb := NULL;
  v_stats            jsonb;
  v_ronda_actual     integer := NULL;
  v_total            integer := 0;
  v_wins             integer := 0;
  v_losses           integer := 0;
  v_sets_won         integer := 0;
  v_sets_lost        integer := 0;

  v_bracket_played   integer := 0;
  v_bracket_wins     integer := 0;
  v_bracket_losses   integer := 0;
  v_max_ronda        integer := NULL;
  v_total_rondas     integer := NULL;
  v_has_pending      boolean := false;
  v_stage_name       text := NULL;
  v_current_round    integer := NULL;

  v_cat              text := NULL;
  v_pendientes       integer := 0;
  v_playoffs_on      boolean := false;

  v_rival_equipo_id  uuid;
  v_rival_j1_id      uuid;
  v_rival_j1_nombre  text;
  v_rival_j1_whatsapp text;
  v_rival_j2_id      uuid;
  v_rival_j2_nombre  text;
  v_rival_j2_whatsapp text;
  v_rival_nombre     text;

  v_my_j1_id         uuid;
  v_my_j2_id         uuid;
  v_companero_id     uuid;
  v_companero_nombre text;
  v_companero_whatsapp text;

  rec RECORD;
BEGIN
  SELECT te.id, te.categoria, te.jugador1_id, te.jugador2_id
  INTO v_equipo_id, v_cat, v_my_j1_id, v_my_j2_id
  FROM public.torneo_equipos te
  WHERE te.torneo_id = p_torneo_id
    AND (te.jugador1_id = p_perfil_id OR te.jugador2_id = p_perfil_id)
  LIMIT 1;

  IF v_equipo_id IS NULL THEN
    RETURN jsonb_build_object(
      'estado', 'sin_participacion',
      'proximo_partido', NULL,
      'stats', jsonb_build_object('total', 0, 'wins', 0, 'losses', 0, 'sets_won', 0, 'sets_lost', 0, 'win_rate', 0),
      'ronda_actual', NULL,
      'mensaje', 'No tenes un equipo formado en este torneo todavia.'
    );
  END IF;

  v_companero_id := CASE WHEN v_my_j1_id = p_perfil_id THEN v_my_j2_id ELSE v_my_j1_id END;

  SELECT nombre_completo, whatsapp
  INTO v_companero_nombre, v_companero_whatsapp
  FROM public.perfiles
  WHERE id = v_companero_id;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE equipo_ganador_id = v_equipo_id)::int,
    COUNT(*) FILTER (WHERE equipo_ganador_id IS NOT NULL AND equipo_ganador_id <> v_equipo_id)::int,
    COALESCE(SUM(
      CASE WHEN equipo1_id = v_equipo_id THEN
        COALESCE(set1_j1,0) + COALESCE(set2_j1,0) + COALESCE(set3_j1,0)
      ELSE
        COALESCE(set1_j2,0) + COALESCE(set2_j2,0) + COALESCE(set3_j2,0)
      END
    ), 0)::int,
    COALESCE(SUM(
      CASE WHEN equipo1_id = v_equipo_id THEN
        COALESCE(set1_j2,0) + COALESCE(set2_j2,0) + COALESCE(set3_j2,0)
      ELSE
        COALESCE(set1_j1,0) + COALESCE(set2_j1,0) + COALESCE(set3_j1,0)
      END
    ), 0)::int
  INTO v_total, v_wins, v_losses, v_sets_won, v_sets_lost
  FROM public.partidos
  WHERE torneo_id = p_torneo_id
    AND (equipo1_id = v_equipo_id OR equipo2_id = v_equipo_id)
    AND estado = 'finalizado';

  v_stats := jsonb_build_object(
    'total', v_total,
    'wins', v_wins,
    'losses', v_losses,
    'sets_won', v_sets_won,
    'sets_lost', v_sets_lost,
    'win_rate', CASE WHEN v_total > 0 THEN ROUND((v_wins::numeric / v_total) * 100) ELSE 0 END
  );

  IF v_total = 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.partidos
      WHERE torneo_id = p_torneo_id
        AND (equipo1_id = v_equipo_id OR equipo2_id = v_equipo_id)
        AND estado IN ('programado', 'en_curso', 'esperando_validacion')
    ) INTO v_has_pending;

    IF NOT v_has_pending THEN
      RETURN jsonb_build_object(
        'estado', 'sin_participacion',
        'proximo_partido', NULL,
        'stats', v_stats,
        'ronda_actual', NULL,
        'mensaje', 'No tenes partidos registrados en este torneo todavia.'
      );
    END IF;
  END IF;

  SELECT
    p.id, p.jornada, p.estado, p.fecha_programada,
    p.equipo1_id, p.equipo2_id, p.ronda, p.bracket_tipo, p.grupo, p.categoria, p.stage_name,
    e1.jugador1_id AS e1_j1, e1.jugador2_id AS e1_j2,
    e2.jugador1_id AS e2_j1, e2.jugador2_id AS e2_j2,
    pr_e1_j1.nombre_completo AS e1_j1_nombre, pr_e1_j2.nombre_completo AS e1_j2_nombre,
    pr_e2_j1.nombre_completo AS e2_j1_nombre, pr_e2_j2.nombre_completo AS e2_j2_nombre,
    pr_e1_j1.whatsapp AS e1_j1_whatsapp, pr_e1_j2.whatsapp AS e1_j2_whatsapp,
    pr_e2_j1.whatsapp AS e2_j1_whatsapp, pr_e2_j2.whatsapp AS e2_j2_whatsapp
  INTO rec
  FROM public.partidos p
  JOIN public.torneo_equipos e1 ON e1.id = p.equipo1_id
  JOIN public.torneo_equipos e2 ON e2.id = p.equipo2_id
  LEFT JOIN public.perfiles pr_e1_j1 ON pr_e1_j1.id = e1.jugador1_id
  LEFT JOIN public.perfiles pr_e1_j2 ON pr_e1_j2.id = e1.jugador2_id
  LEFT JOIN public.perfiles pr_e2_j1 ON pr_e2_j1.id = e2.jugador1_id
  LEFT JOIN public.perfiles pr_e2_j2 ON pr_e2_j2.id = e2.jugador2_id
  WHERE p.torneo_id = p_torneo_id
    AND (p.equipo1_id = v_equipo_id OR p.equipo2_id = v_equipo_id)
    AND p.estado IN ('programado', 'en_curso', 'esperando_validacion')
  ORDER BY
    CASE p.estado
      WHEN 'esperando_validacion' THEN 0
      WHEN 'en_curso' THEN 1
      ELSE 2
    END ASC,
    p.ronda ASC NULLS LAST,
    p.jornada ASC,
    p.fecha_programada ASC NULLS LAST
  LIMIT 1;

  IF rec.id IS NOT NULL THEN
    IF rec.equipo1_id = v_equipo_id THEN
      v_rival_equipo_id := rec.equipo2_id;
      v_rival_j1_id := rec.e2_j1; v_rival_j1_nombre := rec.e2_j1_nombre; v_rival_j1_whatsapp := rec.e2_j1_whatsapp;
      v_rival_j2_id := rec.e2_j2; v_rival_j2_nombre := rec.e2_j2_nombre; v_rival_j2_whatsapp := rec.e2_j2_whatsapp;
    ELSE
      v_rival_equipo_id := rec.equipo1_id;
      v_rival_j1_id := rec.e1_j1; v_rival_j1_nombre := rec.e1_j1_nombre; v_rival_j1_whatsapp := rec.e1_j1_whatsapp;
      v_rival_j2_id := rec.e1_j2; v_rival_j2_nombre := rec.e1_j2_nombre; v_rival_j2_whatsapp := rec.e1_j2_whatsapp;
    END IF;

    v_rival_nombre := TRIM(BOTH ' / ' FROM
      COALESCE(v_rival_j1_nombre, 'Jugador') || ' / ' || COALESCE(v_rival_j2_nombre, 'Jugador')
    );

    v_next_match := jsonb_build_object(
      'id', rec.id,
      'jornada', rec.jornada,
      'estado', rec.estado,
      'fecha_programada', rec.fecha_programada,
      'equipo1_id', rec.equipo1_id,
      'equipo2_id', rec.equipo2_id,
      'ronda', rec.ronda,
      'bracket_tipo', rec.bracket_tipo,
      'grupo', rec.grupo,
      'categoria', rec.categoria,
      'stage_name', rec.stage_name,
      'rival_equipo_id', v_rival_equipo_id,
      'rival_nombre', v_rival_nombre,
      'rival_jugadores', jsonb_build_array(
        jsonb_build_object('id', v_rival_j1_id, 'nombre', v_rival_j1_nombre, 'whatsapp', v_rival_j1_whatsapp),
        jsonb_build_object('id', v_rival_j2_id, 'nombre', v_rival_j2_nombre, 'whatsapp', v_rival_j2_whatsapp)
      ),
      'jugador1_id', rec.e1_j1,
      'jugador2_id', rec.e2_j1,
      'rival_id', v_rival_j1_id,
      'rival_whatsapp', v_rival_j1_whatsapp,
      'mi_equipo_id', v_equipo_id,
      'companero', jsonb_build_object('id', v_companero_id, 'nombre', v_companero_nombre, 'whatsapp', v_companero_whatsapp)
    );

    RETURN jsonb_build_object(
      'estado', 'activo',
      'proximo_partido', v_next_match,
      'stats', v_stats,
      'ronda_actual', rec.ronda,
      'stage_name', v_stage_name,
      'mensaje', 'Tenes un partido pendiente.'
    );
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE bracket_tipo = 'eliminacion_directa')::int,
    COUNT(*) FILTER (WHERE bracket_tipo = 'eliminacion_directa' AND equipo_ganador_id = v_equipo_id)::int,
    COUNT(*) FILTER (WHERE bracket_tipo = 'eliminacion_directa' AND equipo_ganador_id IS NOT NULL AND equipo_ganador_id <> v_equipo_id)::int,
    MAX(ronda) FILTER (WHERE bracket_tipo = 'eliminacion_directa')
  INTO v_bracket_played, v_bracket_wins, v_bracket_losses, v_max_ronda
  FROM public.partidos
  WHERE torneo_id = p_torneo_id
    AND (equipo1_id = v_equipo_id OR equipo2_id = v_equipo_id)
    AND estado = 'finalizado';

  IF v_max_ronda IS NOT NULL THEN
    SELECT MAX(ronda) INTO v_total_rondas
    FROM public.partidos
    WHERE torneo_id = p_torneo_id AND bracket_tipo = 'eliminacion_directa';

    v_ronda_actual := v_max_ronda;
  END IF;

  IF rec.id IS NOT NULL AND rec.ronda IS NOT NULL THEN
    v_current_round := rec.ronda;
  ELSIF v_max_ronda IS NOT NULL THEN
    v_current_round := v_max_ronda;
  END IF;

  IF v_current_round IS NOT NULL AND v_total_rondas IS NOT NULL THEN
    v_stage_name := public.calculate_stage_name(p_torneo_id, v_current_round);
  END IF;

  IF v_bracket_losses > 0 THEN
    IF v_max_ronda IS NOT NULL AND v_total_rondas IS NOT NULL AND v_max_ronda = v_total_rondas THEN
      RETURN jsonb_build_object(
        'estado', 'eliminado',
        'proximo_partido', NULL,
        'stats', v_stats,
        'ronda_actual', v_ronda_actual,
        'stage_name', v_stage_name,
        'mensaje', 'Quedaron eliminados en la final. Pueden seguir viendo los resultados del torneo.'
      );
    END IF;

    RETURN jsonb_build_object(
      'estado', 'eliminado',
      'proximo_partido', NULL,
      'stats', v_stats,
      'ronda_actual', v_ronda_actual,
      'stage_name', v_stage_name,
      'mensaje', 'No avanzaron a la siguiente ronda. Pueden seguir viendo los resultados del torneo.'
    );
  END IF;

  IF v_bracket_wins > 0 AND v_bracket_losses = 0 THEN
    IF v_max_ronda IS NOT NULL AND v_total_rondas IS NOT NULL AND v_max_ronda = v_total_rondas THEN
      RETURN jsonb_build_object(
        'estado', 'campeon',
        'proximo_partido', NULL,
        'stats', v_stats,
        'ronda_actual', v_ronda_actual,
        'stage_name', v_stage_name,
        'mensaje', 'Son los campeones del torneo!'
      );
    END IF;

    RETURN jsonb_build_object(
      'estado', 'esperando_siguiente_ronda',
      'proximo_partido', NULL,
      'stats', v_stats,
      'ronda_actual', v_ronda_actual,
      'stage_name', v_stage_name,
      'mensaje', 'Avanzaron a la siguiente ronda. Esperen que se generen los cruces.'
    );
  END IF;

  IF v_total > 0 AND v_bracket_played = 0 THEN
    IF v_cat IS NULL THEN
      SELECT p.categoria INTO v_cat
      FROM public.partidos p
      WHERE p.torneo_id = p_torneo_id
        AND (p.equipo1_id = v_equipo_id OR p.equipo2_id = v_equipo_id)
        AND p.estado = 'finalizado'
      LIMIT 1;
    END IF;

    SELECT COALESCE(tc.crear_playoffs_eliminacion_directa, false)
    INTO v_playoffs_on
    FROM public.torneo_configuracion tc
    WHERE tc.torneo_id = p_torneo_id;
    v_playoffs_on := COALESCE(v_playoffs_on, false);

    SELECT COUNT(*)
    INTO v_pendientes
    FROM public.partidos p
    WHERE p.torneo_id = p_torneo_id
      AND (v_cat IS NULL OR p.categoria = v_cat)
      AND (p.bracket_tipo IS NULL OR p.bracket_tipo <> 'eliminacion_directa')
      AND p.estado <> 'finalizado'
      AND p.equipo1_id IS NOT NULL;

    IF v_pendientes > 0 THEN
      RETURN jsonb_build_object(
        'estado', 'fase_grupos_en_curso',
        'proximo_partido', NULL,
        'stats', v_stats,
        'ronda_actual', NULL,
        'mensaje', 'Terminaron sus partidos. La clasificacion se definira cuando se jueguen todos los partidos de la fase de grupos.'
      );
    END IF;

    IF v_playoffs_on AND public.equipo_clasifica_en_fase_grupos(p_torneo_id, v_cat, v_equipo_id) THEN
      RETURN jsonb_build_object(
        'estado', 'esperando_siguiente_ronda',
        'proximo_partido', NULL,
        'stats', v_stats,
        'ronda_actual', NULL,
        'mensaje', 'Clasificaron a los playoffs. Esperen que se generen los cruces.'
      );
    END IF;

    RETURN jsonb_build_object(
      'estado', 'eliminado',
      'proximo_partido', NULL,
      'stats', v_stats,
      'ronda_actual', NULL,
      'mensaje', 'La fase de grupos termino y no clasificaron a los playoffs.'
    );
  END IF;

  RETURN jsonb_build_object(
    'estado', 'sin_participacion',
    'proximo_partido', NULL,
    'stats', v_stats,
    'ronda_actual', NULL,
    'mensaje', 'No hay informacion disponible sobre el estado del equipo en el torneo.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_estado_equipo_torneo(bigint, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_estado_equipo_torneo(bigint, uuid) TO authenticated, service_role;


-- ============================================================
-- 2. RLS de partido_disponibilidad: permitir a los 4 integrantes
--    de un partido de dobles leer/escribir su disponibilidad.
--    Aditivo: se agrega un OR EXISTS sobre torneo_equipos que
--    evalua a false en partidos de singles (equipo1_id/equipo2_id
--    son NULL ahi), por lo que el comportamiento singles no cambia.
-- ============================================================

DROP POLICY IF EXISTS "disponibilidad_select_participante" ON public.partido_disponibilidad;
CREATE POLICY "disponibilidad_select_participante"
  ON public.partido_disponibilidad
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.partidos p
      WHERE p.id = partido_disponibilidad.partido_id
        AND (
          p.jugador1_id = auth.uid() OR p.jugador2_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.torneo_equipos te
            WHERE te.id IN (p.equipo1_id, p.equipo2_id)
              AND (te.jugador1_id = auth.uid() OR te.jugador2_id = auth.uid())
          )
        )
    )
  );

DROP POLICY IF EXISTS "disponibilidad_insert_own" ON public.partido_disponibilidad;
CREATE POLICY "disponibilidad_insert_own"
  ON public.partido_disponibilidad
  FOR INSERT
  TO authenticated
  WITH CHECK (
    perfil_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.partidos p
      WHERE p.id = partido_disponibilidad.partido_id
        AND (
          p.jugador1_id = auth.uid() OR p.jugador2_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.torneo_equipos te
            WHERE te.id IN (p.equipo1_id, p.equipo2_id)
              AND (te.jugador1_id = auth.uid() OR te.jugador2_id = auth.uid())
          )
        )
    )
  );

DROP POLICY IF EXISTS "disponibilidad_update_own" ON public.partido_disponibilidad;
CREATE POLICY "disponibilidad_update_own"
  ON public.partido_disponibilidad
  FOR UPDATE
  TO authenticated
  USING (
    perfil_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.partidos p
      WHERE p.id = partido_disponibilidad.partido_id
        AND (
          p.jugador1_id = auth.uid() OR p.jugador2_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.torneo_equipos te
            WHERE te.id IN (p.equipo1_id, p.equipo2_id)
              AND (te.jugador1_id = auth.uid() OR te.jugador2_id = auth.uid())
          )
        )
    )
  )
  WITH CHECK (
    perfil_id = auth.uid()
  );

-- (DELETE sigue solo-admin, sin cambios: "disponibilidad_delete_admin")


-- ============================================================
-- 3. RPC nueva: set_coordinacion_manual_equipo
--    Espejo de set_coordinacion_manual pero validando membresia
--    de equipo (2 jugadores por lado) en vez de jugador1_id/
--    jugador2_id binario. No se toca set_coordinacion_manual.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_coordinacion_manual_equipo(
  p_partido_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_equipo1        UUID;
  v_equipo2        UUID;
  v_is_participante boolean;
BEGIN
  SELECT equipo1_id, equipo2_id
    INTO v_equipo1, v_equipo2
    FROM public.partidos
   WHERE id = p_partido_id;

  IF NOT FOUND OR v_equipo1 IS NULL OR v_equipo2 IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Partido no encontrado o no es de dobles');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.torneo_equipos te
    WHERE te.id IN (v_equipo1, v_equipo2)
      AND (te.jugador1_id = auth.uid() OR te.jugador2_id = auth.uid())
  ) INTO v_is_participante;

  IF NOT v_is_participante THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No sos participante de este partido');
  END IF;

  UPDATE public.partidos
     SET estado_coordinacion = 'manual'
   WHERE id = p_partido_id
     AND estado_coordinacion = 'pendiente';

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.set_coordinacion_manual_equipo(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_coordinacion_manual_equipo(UUID) TO authenticated, service_role;
