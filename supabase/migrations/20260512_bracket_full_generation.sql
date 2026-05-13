-- ============================================================
-- Bracket full generation: all rounds upfront + winner promotion trigger
-- Fixes: champion shown after QF instead of after Final
-- ============================================================

-- ============================================================
-- 1. Updated generar_playoffs_eliminacion_directa_torneo
--    Now creates ALL rounds (QF → SF → F) with siguiente_partido_id links
-- ============================================================

DROP FUNCTION IF EXISTS public.generar_playoffs_eliminacion_directa_torneo(bigint, text, text);

CREATE FUNCTION public.generar_playoffs_eliminacion_directa_torneo(
  p_torneo_id bigint,
  p_categoria text DEFAULT NULL,
  p_grupo_base text DEFAULT NULL
)
RETURNS TABLE (
  out_categoria text,
  grupo_playoffs text,
  grupos_fuente integer,
  clasificados_totales integer,
  partidos_creados integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Flat match-id array: round r, position p → index = offset(r) + p
  -- offset(r) = sum_{k=1}^{r-1} (v_total / 2^k)
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

  -- Build seeded player list
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

  -- -------------------------------------------------------
  -- Phase 1: Pre-generate UUIDs for ALL matches (total = v_total - 1)
  -- flat index layout: round 1 = [1..v_total/2], round 2 = [v_total/2+1..v_total/2+v_total/4], ...
  -- -------------------------------------------------------
  v_match_ids := ARRAY[]::uuid[];
  FOR i IN 1..(v_total - 1) LOOP
    v_match_ids := array_append(v_match_ids, gen_random_uuid());
  END LOOP;

  -- -------------------------------------------------------
  -- Phase 2: Insert match records for all rounds
  -- -------------------------------------------------------
  v_offset := 0;
  FOR v_ronda IN 1..v_total_rondas LOOP
    v_num_matches := v_total / (2 ^ v_ronda);

    FOR v_pos IN 1..v_num_matches LOOP
      v_flat_idx := v_offset + v_pos;

      IF v_ronda = 1 THEN
        -- Preserve original seeding: seed[2p-1] vs seed[total-(2p-1)+1]
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
        v_match_ids[v_flat_idx],
        p_torneo_id, v_categoria, v_grupo_playoffs,
        v_ronda,
        v_j1, v_j2,
        'programado',
        v_ronda, v_pos, 'eliminacion_directa'
      );

      v_partidos := v_partidos + 1;
    END LOOP;

    v_offset := v_offset + v_num_matches;
  END LOOP;

  -- -------------------------------------------------------
  -- Phase 3: Set siguiente_partido_id links
  -- Match at round R, pos P → match at round R+1, pos ceil(P/2)
  -- -------------------------------------------------------
  v_offset := 0;
  FOR v_ronda IN 1..(v_total_rondas - 1) LOOP
    v_num_matches := v_total / (2 ^ v_ronda);
    v_offset_next := v_offset + v_num_matches;

    FOR v_pos IN 1..v_num_matches LOOP
      v_flat_idx := v_offset + v_pos;
      v_flat_idx_next := v_offset_next + ceil(v_pos::numeric / 2)::integer;

      UPDATE public.partidos
      SET siguiente_partido_id = v_match_ids[v_flat_idx_next]
      WHERE id = v_match_ids[v_flat_idx];
    END LOOP;

    v_offset := v_offset + v_num_matches;
  END LOOP;

  -- Recalculate stage_name now that all rounds are present (trigger has timing issue during bulk insert)
  UPDATE public.partidos
  SET stage_name = public.calculate_stage_name(p_torneo_id, ronda)
  WHERE torneo_id = p_torneo_id AND categoria = v_categoria
    AND grupo = v_grupo_playoffs AND bracket_tipo = 'eliminacion_directa';

  RETURN QUERY SELECT v_categoria, v_grupo_playoffs, v_grupos_fuente, v_total, v_partidos;
END;
$$;

COMMENT ON FUNCTION public.generar_playoffs_eliminacion_directa_torneo(bigint, text, text)
IS 'Genera bracket completo (todas las rondas) con siguiente_partido_id. Rondas futuras tienen jugadores NULL (TBD).';


-- ============================================================
-- 2. Trigger: promueve al ganador al siguiente partido automaticamente
-- ============================================================

CREATE OR REPLACE FUNCTION public.promover_ganador_bracket()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.bracket_tipo = 'eliminacion_directa'
    AND NEW.estado = 'finalizado'
    AND NEW.ganador_id IS NOT NULL
    AND NEW.siguiente_partido_id IS NOT NULL
    AND (OLD.estado IS DISTINCT FROM 'finalizado' OR OLD.ganador_id IS NULL)
  THEN
    -- posicion_bracket impar → jugador1 del siguiente, par → jugador2
    IF NEW.posicion_bracket % 2 = 1 THEN
      UPDATE public.partidos SET jugador1_id = NEW.ganador_id WHERE id = NEW.siguiente_partido_id;
    ELSE
      UPDATE public.partidos SET jugador2_id = NEW.ganador_id WHERE id = NEW.siguiente_partido_id;
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
-- 3. Repair function for existing brackets (only round 1 was generated)
-- Creates SF/Final slots and promotes existing QF winners
-- Idempotent: safe to run multiple times
-- ============================================================

CREATE OR REPLACE FUNCTION public.reparar_bracket_existente(p_torneo_id bigint, p_categoria text)
RETURNS text AS $$
DECLARE
  v_r1_count integer;
  v_grupo_playoffs text;
  v_existing_r1 uuid[];
  v_total_rondas integer;
  v_match_ids uuid[];
  v_ronda integer;
  v_pos integer;
  v_num_matches integer;
  v_flat_idx integer;
  v_flat_idx_next integer;
  v_offset integer;
  v_offset_next integer;
  v_r1_rec RECORD;
  i integer;
BEGIN
  -- No-op if future rounds already exist
  IF EXISTS (
    SELECT 1 FROM public.partidos
    WHERE torneo_id = p_torneo_id AND categoria = p_categoria
      AND bracket_tipo = 'eliminacion_directa' AND ronda > 1
  ) THEN
    RETURN 'Ya existen rondas > 1, no se requiere reparacion.';
  END IF;

  -- Load round 1 metadata
  SELECT count(*), grupo, array_agg(id ORDER BY posicion_bracket)
  INTO v_r1_count, v_grupo_playoffs, v_existing_r1
  FROM public.partidos
  WHERE torneo_id = p_torneo_id AND categoria = p_categoria
    AND bracket_tipo = 'eliminacion_directa' AND ronda = 1
  GROUP BY grupo;

  IF v_r1_count IS NULL OR v_r1_count < 1 THEN
    RETURN 'No se encontraron partidos de ronda 1 para reparar.';
  END IF;
  IF (v_r1_count & (v_r1_count - 1)) <> 0 THEN
    RETURN format('Cantidad en ronda 1 (%s) no es potencia de 2.', v_r1_count);
  END IF;
  IF v_r1_count = 1 THEN
    RETURN 'Solo hay 1 partido de ronda 1 (es la Final), no se necesita reparacion.';
  END IF;

  -- total_rondas for r1_count matches: log2(r1_count) + 1
  -- e.g., 4 QF matches → log2(4)+1 = 3 total rounds
  v_total_rondas := log(2, v_r1_count)::integer + 1;

  -- Pre-generate UUIDs for future rounds (total future matches = r1_count - 1)
  v_match_ids := ARRAY[]::uuid[];
  FOR i IN 1..(v_r1_count - 1) LOOP
    v_match_ids := array_append(v_match_ids, gen_random_uuid());
  END LOOP;

  -- Insert future round matches (ronda 2..total_rondas)
  -- v_match_ids layout: round 2 = [1..r1/2], round 3 = [r1/2+1..r1/2+r1/4], ...
  v_offset := 0;
  FOR v_ronda IN 2..v_total_rondas LOOP
    -- matches in this round = r1_count / 2^(ronda-1)
    v_num_matches := v_r1_count / (2 ^ (v_ronda - 1));

    FOR v_pos IN 1..v_num_matches LOOP
      v_flat_idx := v_offset + v_pos;

      INSERT INTO public.partidos (
        id, torneo_id, categoria, grupo, jornada,
        jugador1_id, jugador2_id, estado,
        ronda, posicion_bracket, bracket_tipo
      ) VALUES (
        v_match_ids[v_flat_idx],
        p_torneo_id, p_categoria, v_grupo_playoffs,
        v_ronda,
        NULL, NULL, 'programado',
        v_ronda, v_pos, 'eliminacion_directa'
      );
    END LOOP;

    v_offset := v_offset + v_num_matches;
  END LOOP;

  -- Set siguiente_partido_id for round 1 → round 2
  -- Round 1, pos P → round 2, pos ceil(P/2) = v_match_ids[ceil(P/2)]
  FOR v_pos IN 1..v_r1_count LOOP
    v_flat_idx_next := ceil(v_pos::numeric / 2)::integer;
    UPDATE public.partidos
    SET siguiente_partido_id = v_match_ids[v_flat_idx_next]
    WHERE id = v_existing_r1[v_pos];
  END LOOP;

  -- Set siguiente_partido_id for rounds 2..(total_rondas-1) → next round
  v_offset := 0;
  FOR v_ronda IN 2..(v_total_rondas - 1) LOOP
    v_num_matches := v_r1_count / (2 ^ (v_ronda - 1));
    v_offset_next := v_offset + v_num_matches;

    FOR v_pos IN 1..v_num_matches LOOP
      v_flat_idx := v_offset + v_pos;
      v_flat_idx_next := v_offset_next + ceil(v_pos::numeric / 2)::integer;

      UPDATE public.partidos
      SET siguiente_partido_id = v_match_ids[v_flat_idx_next]
      WHERE id = v_match_ids[v_flat_idx];
    END LOOP;

    v_offset := v_offset + v_num_matches;
  END LOOP;

  -- Promote winners from already-completed round 1 matches
  FOR v_r1_rec IN (
    SELECT id, ganador_id, posicion_bracket, siguiente_partido_id
    FROM public.partidos
    WHERE torneo_id = p_torneo_id AND categoria = p_categoria
      AND bracket_tipo = 'eliminacion_directa' AND ronda = 1
      AND estado = 'finalizado' AND ganador_id IS NOT NULL
    ORDER BY posicion_bracket
  ) LOOP
    IF v_r1_rec.siguiente_partido_id IS NOT NULL THEN
      IF v_r1_rec.posicion_bracket % 2 = 1 THEN
        UPDATE public.partidos SET jugador1_id = v_r1_rec.ganador_id
        WHERE id = v_r1_rec.siguiente_partido_id;
      ELSE
        UPDATE public.partidos SET jugador2_id = v_r1_rec.ganador_id
        WHERE id = v_r1_rec.siguiente_partido_id;
      END IF;
    END IF;
  END LOOP;

  -- Recalculate stage_name now that all rounds are present
  UPDATE public.partidos
  SET stage_name = public.calculate_stage_name(torneo_id, ronda)
  WHERE torneo_id = p_torneo_id AND categoria = p_categoria
    AND bracket_tipo = 'eliminacion_directa' AND ronda IS NOT NULL;

  RETURN format(
    'Reparacion completada: %s rondas adicionales creadas (%s partidos nuevos), ganadores promovidos desde %s QF.',
    v_total_rondas - 1,
    v_r1_count - 1,
    v_r1_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.reparar_bracket_existente(bigint, text)
IS 'Repara brackets sin rondas futuras: crea SF/Final con slots TBD y promueve ganadores de QF existentes. Idempotente.';


-- ============================================================
-- 4. Fix calculate_stage_name: >= 4 → >= 3 for Cuartos de Final
--    (bug: 8-player bracket with 3 rounds shows round 1 as "Ronda 1" instead of "Cuartos de Final")
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_stage_name(p_torneo_id BIGINT, p_ronda INTEGER)
RETURNS TEXT AS $$
DECLARE
  v_total_rondas INTEGER;
BEGIN
  SELECT MAX(ronda) INTO v_total_rondas
  FROM public.partidos
  WHERE torneo_id = p_torneo_id
    AND bracket_tipo = 'eliminacion_directa'
    AND ronda IS NOT NULL;

  IF v_total_rondas IS NULL OR p_ronda IS NULL THEN
    RETURN NULL;
  END IF;

  CASE
    WHEN p_ronda = v_total_rondas THEN RETURN 'Final';
    WHEN p_ronda = v_total_rondas - 1 AND v_total_rondas >= 2 THEN RETURN 'Semifinal';
    WHEN p_ronda = v_total_rondas - 2 AND v_total_rondas >= 3 THEN RETURN 'Cuartos de Final';
    WHEN p_ronda = v_total_rondas - 3 AND v_total_rondas >= 4 THEN RETURN 'Octavos de Final';
    WHEN p_ronda = v_total_rondas - 4 AND v_total_rondas >= 5 THEN RETURN 'Dieciseisavos de Final';
    ELSE RETURN 'Ronda ' || p_ronda;
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recalculate stage_name for all existing bracket matches now that all rounds exist
UPDATE public.partidos
SET stage_name = public.calculate_stage_name(torneo_id, ronda)
WHERE bracket_tipo = 'eliminacion_directa' AND ronda IS NOT NULL;
