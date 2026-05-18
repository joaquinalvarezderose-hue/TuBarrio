-- ============================================================
-- Trigger: finalizar_grupo_si_completo
-- Se dispara AFTER UPDATE en partidos.
-- Cuando el último partido de fase de grupo se marca como
-- 'finalizado', actualiza torneo_estado y lanza playoffs
-- automáticamente si están habilitados.
-- ============================================================

CREATE OR REPLACE FUNCTION public.finalizar_grupo_si_completo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_torneo_id     bigint;
  v_categoria     text;
  v_pendientes    integer;
BEGIN
  -- Solo aplica a partidos de fase de grupo que acaban de finalizar
  IF NEW.estado <> 'finalizado'
     OR OLD.estado = 'finalizado'
     OR NEW.bracket_tipo = 'eliminacion_directa' THEN
    RETURN NEW;
  END IF;

  v_torneo_id := NEW.torneo_id;
  v_categoria := NEW.categoria;

  -- Contar partidos de fase de grupo aún no finalizados
  SELECT COUNT(*) INTO v_pendientes
  FROM public.partidos
  WHERE torneo_id = v_torneo_id
    AND (v_categoria IS NULL OR categoria = v_categoria)
    AND (bracket_tipo IS NULL OR bracket_tipo <> 'eliminacion_directa')
    AND estado <> 'finalizado';

  IF v_pendientes > 0 THEN
    RETURN NEW;
  END IF;

  -- Todos los partidos de grupos terminaron → marcar grupos como FINALIZADO
  UPDATE public.torneo_estado
  SET estado = 'FINALIZADO', updated_at = now()
  WHERE torneo_id = v_torneo_id
    AND (v_categoria IS NULL OR categoria = v_categoria)
    AND grupo NOT LIKE '%_PLAYOFFS'
    AND TRIM(estado) <> 'FINALIZADO';

  -- Si playoffs ya existen, no regenerar
  IF EXISTS (
    SELECT 1 FROM public.partidos
    WHERE torneo_id = v_torneo_id
      AND (v_categoria IS NULL OR categoria = v_categoria)
      AND bracket_tipo = 'eliminacion_directa'
  ) THEN
    RETURN NEW;
  END IF;

  -- Si playoffs no están habilitados en la configuración, no hacer nada
  IF NOT EXISTS (
    SELECT 1 FROM public.torneo_configuracion
    WHERE torneo_id = v_torneo_id
      AND crear_playoffs_eliminacion_directa = true
  ) THEN
    RETURN NEW;
  END IF;

  -- Generar playoffs automáticamente
  BEGIN
    PERFORM public.generar_playoffs_eliminacion_directa_torneo(v_torneo_id, v_categoria);
  EXCEPTION WHEN OTHERS THEN
    -- Loguear el error sin interrumpir la validación del resultado
    RAISE WARNING 'Auto-generación de playoffs falló para torneo %: %', v_torneo_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finalizar_grupo_al_completar_partidos ON public.partidos;

CREATE TRIGGER trg_finalizar_grupo_al_completar_partidos
  AFTER UPDATE ON public.partidos
  FOR EACH ROW
  EXECUTE FUNCTION public.finalizar_grupo_si_completo();

-- ============================================================
-- Guard en generar_playoffs_eliminacion_directa_torneo:
-- Verificar que todos los grupos estén FINALIZADO antes de
-- generar el bracket.
-- ============================================================

CREATE OR REPLACE FUNCTION public.generar_playoffs_eliminacion_directa_torneo(p_torneo_id bigint, p_categoria text DEFAULT NULL::text, p_grupo_base text DEFAULT NULL::text)
 RETURNS TABLE(out_categoria text, grupo_playoffs text, grupos_fuente integer, clasificados_totales integer, partidos_creados integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_categoria text;
  v_grupo_base text;
  v_grupo_base_id uuid;
  v_clasificados_por_grupo integer := 2;
  v_habilitar_playoffs boolean := false;
  v_grupo_playoffs text;
  v_grupo_playoffs_id uuid;
  v_total integer := 0;
  v_grupos_fuente integer := 0;
  v_partidos integer := 0;
  v_has_existing boolean := false;
  v_seeded uuid[];
  v_total_rondas integer;
  v_match_ids uuid[];
  v_ronda integer;
  v_pos integer;
  v_num_matches integer;
  v_flat_idx integer;
  v_flat_idx_next integer;
  v_offset integer;
  v_offset_next integer;
  v_j1 uuid;
  v_j2 uuid;
  v_grupos_no_finalizados integer;
  i integer;
BEGIN
  v_categoria := nullif(trim(coalesce(p_categoria, '')), '');
  IF v_categoria IS NULL THEN
    SELECT t.subtitulo INTO v_categoria FROM public.torneos t WHERE t.id = p_torneo_id LIMIT 1;
  END IF;
  v_categoria := coalesce(v_categoria, 'General');

  SELECT
    greatest(1, coalesce(tc.clasificados_por_grupo, 2)),
    coalesce(tc.crear_playoffs_eliminacion_directa, false),
    tc.grupo_base_id
  INTO v_clasificados_por_grupo, v_habilitar_playoffs, v_grupo_base_id
  FROM public.torneo_configuracion tc
  WHERE tc.torneo_id = p_torneo_id;

  SELECT grupo_id, grupo_codigo
  INTO v_grupo_base_id, v_grupo_base
  FROM public.resolver_grupo_base_torneo(p_torneo_id, v_categoria, p_grupo_base, v_grupo_base_id);

  IF NOT v_habilitar_playoffs THEN
    RAISE EXCEPTION 'Playoffs por eliminacion directa no habilitado en torneo_configuracion para torneo %.', p_torneo_id;
  END IF;

  -- Guard: verificar que todos los grupos de fase de grupo estén FINALIZADO
  SELECT COUNT(*) INTO v_grupos_no_finalizados
  FROM public.torneo_estado
  WHERE torneo_id = p_torneo_id
    AND categoria = v_categoria
    AND grupo NOT LIKE '%_PLAYOFFS'
    AND TRIM(estado) <> 'FINALIZADO';

  IF v_grupos_no_finalizados > 0 THEN
    RAISE EXCEPTION 'No se pueden generar playoffs: % grupo(s) aún no han finalizado todos sus partidos.', v_grupos_no_finalizados;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.partidos p
    WHERE p.torneo_id = p_torneo_id AND p.categoria = v_categoria AND p.grupo LIKE (v_grupo_base || '_PLAYOFFS')
  ) INTO v_has_existing;
  IF v_has_existing THEN
    RAISE EXCEPTION 'El playoffs ya tiene partidos cargados. Limpialos antes de regenerar.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.torneo_partidos_historial h
    WHERE h.torneo_id = p_torneo_id AND h.categoria = v_categoria AND h.grupo LIKE (v_grupo_base || '_PLAYOFFS')
  ) INTO v_has_existing;
  IF v_has_existing THEN
    RAISE EXCEPTION 'El playoffs ya tiene historial cargado. Limpialo antes de regenerar.';
  END IF;

  WITH ranking AS (
    SELECT
      tj.grupo, tj.perfil_id,
      coalesce(tj.puntos, 0) AS puntos,
      coalesce(tj.sets_ganados, 0) AS sets_ganados,
      coalesce(tj.partidos_jugados, 0) AS partidos_jugados,
      row_number() OVER (
        PARTITION BY tj.grupo
        ORDER BY coalesce(tj.puntos, 0) DESC, coalesce(tj.sets_ganados, 0) DESC,
                 coalesce(tj.partidos_jugados, 0) ASC, tj.perfil_id ASC
      ) AS pos_grupo
    FROM public.torneo_jugadores tj
    WHERE tj.torneo_id = p_torneo_id AND tj.categoria = v_categoria
      AND (tj.grupo = v_grupo_base OR starts_with(tj.grupo, v_grupo_base || '_G'))
  ),
  clasificados AS (SELECT * FROM ranking WHERE pos_grupo <= v_clasificados_por_grupo),
  seeded AS (
    SELECT c.*,
      row_number() OVER (
        ORDER BY c.pos_grupo ASC, c.puntos DESC, c.sets_ganados DESC,
                 c.partidos_jugados ASC, c.grupo ASC, c.perfil_id ASC
      ) AS seed
    FROM clasificados c
  )
  SELECT array_agg(s.perfil_id ORDER BY s.seed), count(*)::integer, count(DISTINCT s.grupo)::integer
  INTO v_seeded, v_total, v_grupos_fuente
  FROM seeded s;

  IF v_total < 2 THEN
    RAISE EXCEPTION 'No hay suficientes clasificados para playoffs (%).', v_total;
  END IF;
  IF (v_total & (v_total - 1)) <> 0 THEN
    RAISE EXCEPTION 'Los clasificados totales (%) deben ser potencia de 2 para armar cruces directos.', v_total;
  END IF;

  v_total_rondas := log(2, v_total)::integer;
  v_grupo_playoffs := format('%s_PLAYOFFS', v_grupo_base);

  v_grupo_playoffs_id := public.upsert_torneo_grupo(
    p_torneo_id, v_categoria, v_grupo_playoffs, 'Playoffs', 'PLAYOFFS', 1, v_grupo_base_id, false
  );

  DELETE FROM public.torneo_estado
  WHERE torneo_id = p_torneo_id AND categoria = v_categoria AND grupo = v_grupo_playoffs;

  INSERT INTO public.torneo_estado (torneo_id, categoria, grupo, estado, max_participantes, current_participantes)
  VALUES (p_torneo_id, v_categoria, v_grupo_playoffs, 'LOCKED', v_total, v_total);

  v_match_ids := ARRAY[]::uuid[];
  FOR i IN 1..(v_total - 1) LOOP
    v_match_ids := array_append(v_match_ids, gen_random_uuid());
  END LOOP;

  v_offset := 0;
  FOR v_ronda IN 1..v_total_rondas LOOP
    v_num_matches := v_total / (2 ^ v_ronda);
    FOR v_pos IN 1..v_num_matches LOOP
      v_flat_idx := v_offset + v_pos;
      IF v_ronda = 1 THEN
        v_j1 := v_seeded[2 * v_pos - 1];
        v_j2 := v_seeded[v_total - (2 * v_pos - 1) + 1];
      ELSE
        v_j1 := NULL;
        v_j2 := NULL;
      END IF;
      INSERT INTO public.partidos (
        id, torneo_id, categoria, grupo, jornada,
        jugador1_id, jugador2_id, estado,
        ronda, posicion_bracket, bracket_tipo
      ) VALUES (
        v_match_ids[v_flat_idx], p_torneo_id, v_categoria, v_grupo_playoffs, v_ronda,
        v_j1, v_j2, 'programado', v_ronda, v_pos, 'eliminacion_directa'
      );
      v_partidos := v_partidos + 1;
    END LOOP;
    v_offset := v_offset + v_num_matches;
  END LOOP;

  v_offset := 0;
  FOR v_ronda IN 1..(v_total_rondas - 1) LOOP
    v_num_matches := v_total / (2 ^ v_ronda);
    v_offset_next := v_offset + v_num_matches;
    FOR v_pos IN 1..v_num_matches LOOP
      v_flat_idx := v_offset + v_pos;
      v_flat_idx_next := v_offset_next + ceil(v_pos::numeric / 2)::integer;
      UPDATE public.partidos SET siguiente_partido_id = v_match_ids[v_flat_idx_next]
      WHERE id = v_match_ids[v_flat_idx];
    END LOOP;
    v_offset := v_offset + v_num_matches;
  END LOOP;

  -- Recalculate stage_name now that all rounds are present (trigger has timing issue)
  UPDATE public.partidos
  SET stage_name = public.calculate_stage_name(p_torneo_id, ronda)
  WHERE torneo_id = p_torneo_id AND categoria = v_categoria
    AND grupo = v_grupo_playoffs AND bracket_tipo = 'eliminacion_directa';

  RETURN QUERY SELECT v_categoria, v_grupo_playoffs, v_grupos_fuente, v_total, v_partidos;
END;
$function$;
