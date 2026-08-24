-- Fix: generar_playoffs_eliminacion_directa_torneo armaba los cruces de primera ronda
-- ordenando "primeros" y "segundos" por puntaje de forma independiente y cruzandolos con
-- la formula clasica de bracket (seed 1 vs seed N). Eso NO garantiza rival de otro grupo:
-- si el orden por puntaje de segundos coincidia con el de sus propios primeros, terminaban
-- enfrentados 1ero y 2do del MISMO grupo (bug reportado y confirmado en torneos 8, 9 y 10).
--
-- Esta version arma los cruces de ronda 1 emparejando cada clasificado de la mitad superior
-- (mejores por posicion de grupo) con el mejor candidato disponible de la mitad inferior que
-- sea de un grupo DISTINTO, preservando el criterio "mejor vs mas debil" siempre que sea posible.
-- Fecha: 2026-08-24

CREATE OR REPLACE FUNCTION public.generar_playoffs_eliminacion_directa_torneo(
  p_torneo_id  bigint,
  p_categoria  text    DEFAULT NULL::text,
  p_grupo_base text    DEFAULT NULL::text
)
RETURNS TABLE(
  out_categoria        text,
  grupo_playoffs       text,
  grupos_fuente        integer,
  clasificados_totales integer,
  partidos_creados     integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_categoria                 text;
  v_grupo_base                text;
  v_grupo_base_id             uuid;
  v_clasificados_por_grupo    integer := 2;
  v_habilitar_playoffs        boolean := false;
  v_incluir_mejores_terceros  boolean := false;
  v_cantidad_mejores_terceros integer := 0;
  v_grupo_playoffs            text;
  v_grupo_playoffs_id         uuid;
  v_total                     integer := 0;
  v_grupos_fuente             integer := 0;
  v_partidos                  integer := 0;
  v_has_existing              boolean := false;
  v_seeded                    uuid[];
  v_seeded_grupo               text[];
  v_half                       integer;
  v_used                       boolean[];
  v_r1_j1                      uuid[];
  v_r1_j2                      uuid[];
  v_top_grupo                  text;
  v_found                      boolean;
  v_idx                        integer;
  v_total_rondas              integer;
  v_match_ids                 uuid[];
  v_ronda                     integer;
  v_pos                       integer;
  v_num_matches               integer;
  v_flat_idx                  integer;
  v_flat_idx_next             integer;
  v_offset                    integer;
  v_offset_next               integer;
  v_j1                        uuid;
  v_j2                        uuid;
  v_grupos_no_finalizados     integer;
  i                           integer;
BEGIN
  v_categoria := nullif(trim(coalesce(p_categoria, '')), '');
  IF v_categoria IS NULL THEN
    SELECT t.subtitulo INTO v_categoria FROM public.torneos t WHERE t.id = p_torneo_id LIMIT 1;
  END IF;
  v_categoria := coalesce(v_categoria, 'General');

  SELECT
    greatest(1, coalesce(tc.clasificados_por_grupo, 2)),
    coalesce(tc.crear_playoffs_eliminacion_directa, false),
    coalesce(tc.incluir_mejores_terceros, false),
    coalesce(tc.cantidad_mejores_terceros, 0),
    tc.grupo_base_id
  INTO
    v_clasificados_por_grupo,
    v_habilitar_playoffs,
    v_incluir_mejores_terceros,
    v_cantidad_mejores_terceros,
    v_grupo_base_id
  FROM public.torneo_configuracion tc
  WHERE tc.torneo_id = p_torneo_id;

  SELECT grupo_id, grupo_codigo
  INTO v_grupo_base_id, v_grupo_base
  FROM public.resolver_grupo_base_torneo(p_torneo_id, v_categoria, p_grupo_base, v_grupo_base_id);

  IF NOT v_habilitar_playoffs THEN
    RAISE EXCEPTION 'Playoffs por eliminacion directa no habilitado en torneo_configuracion para torneo %.', p_torneo_id;
  END IF;

  -- Guard: todos los grupos de fase de grupo deben estar FINALIZADO
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

  -- Construir el bracket:
  -- 1. Clasificados regulares (pos_grupo <= clasificados_por_grupo), seeded primero.
  --    pos_grupo se calcula con: puntos -> dif. sets -> sets ganados -> H2H -> dif. games -> id.
  -- 2. Mejores terceros (pos_grupo = clasificados_por_grupo + 1), seeded al final,
  --    ordenados por puntos/sets entre todos los grupos (criterio propio, entre grupos).
  WITH base AS (
    SELECT
      tj.grupo,
      tj.perfil_id,
      coalesce(tj.puntos, 0)                                         AS puntos,
      coalesce(tj.sets_ganados, 0)                                   AS sets_ganados,
      coalesce(tj.sets_ganados, 0) - coalesce(tj.sets_perdidos, 0)   AS diff_sets,
      coalesce(tj.games_ganados, 0) - coalesce(tj.games_perdidos, 0) AS diff_games,
      coalesce(tj.partidos_jugados, 0)                               AS partidos_jugados
    FROM public.torneo_jugadores tj
    WHERE tj.torneo_id = p_torneo_id
      AND tj.categoria = v_categoria
      AND (tj.grupo = v_grupo_base OR starts_with(tj.grupo, v_grupo_base || '_G'))
  ),
  h2h AS (
    SELECT
      b.perfil_id,
      (
        SELECT count(*)
        FROM public.torneo_partidos_historial h
        WHERE h.torneo_id = p_torneo_id
          AND h.categoria = v_categoria
          AND h.ganador_perfil_id = b.perfil_id
          AND EXISTS (
            SELECT 1 FROM base riv
            WHERE riv.grupo = b.grupo
              AND riv.perfil_id <> b.perfil_id
              AND riv.puntos = b.puntos
              AND riv.diff_sets = b.diff_sets
              AND riv.sets_ganados = b.sets_ganados
              AND (h.jugador1_perfil_id = riv.perfil_id OR h.jugador2_perfil_id = riv.perfil_id)
          )
      ) AS h2h_wins
    FROM base b
  ),
  ranking AS (
    SELECT
      b.grupo,
      b.perfil_id,
      b.puntos,
      b.sets_ganados,
      b.partidos_jugados,
      row_number() OVER (
        PARTITION BY b.grupo
        ORDER BY b.puntos DESC,
                 b.diff_sets DESC,
                 b.sets_ganados DESC,
                 hh.h2h_wins DESC,
                 b.diff_games DESC,
                 b.perfil_id ASC
      ) AS pos_grupo
    FROM base b
    JOIN h2h hh ON hh.perfil_id = b.perfil_id
  ),
  clasificados AS (
    SELECT grupo, perfil_id, puntos, sets_ganados, partidos_jugados, pos_grupo,
           false AS es_mejor_tercero
    FROM ranking
    WHERE pos_grupo <= v_clasificados_por_grupo
  ),
  terceros_rankeados AS (
    SELECT grupo, perfil_id, puntos, sets_ganados, partidos_jugados, pos_grupo,
           row_number() OVER (
             ORDER BY puntos DESC, sets_ganados DESC, partidos_jugados ASC, grupo ASC, perfil_id ASC
           ) AS rank_tercero
    FROM ranking
    WHERE pos_grupo = v_clasificados_por_grupo + 1
  ),
  mejores_terceros AS (
    SELECT grupo, perfil_id, puntos, sets_ganados, partidos_jugados, pos_grupo,
           true AS es_mejor_tercero
    FROM terceros_rankeados
    WHERE v_incluir_mejores_terceros
      AND rank_tercero <= v_cantidad_mejores_terceros
  ),
  todos AS (
    SELECT * FROM clasificados
    UNION ALL
    SELECT * FROM mejores_terceros
  ),
  seeded AS (
    SELECT *,
      row_number() OVER (
        ORDER BY
          es_mejor_tercero ASC,    -- clasificados regulares primero
          pos_grupo ASC,           -- 1eros antes que 2dos antes que 3eros
          puntos DESC,
          sets_ganados DESC,
          partidos_jugados ASC,
          grupo ASC,
          perfil_id ASC
      ) AS seed
    FROM todos
  )
  SELECT
    array_agg(s.perfil_id ORDER BY s.seed),
    array_agg(s.grupo ORDER BY s.seed),
    count(*)::integer,
    count(DISTINCT s.grupo)::integer
  INTO v_seeded, v_seeded_grupo, v_total, v_grupos_fuente
  FROM seeded s;

  IF v_total < 2 THEN
    RAISE EXCEPTION 'No hay suficientes clasificados para playoffs (%).', v_total;
  END IF;
  IF (v_total & (v_total - 1)) <> 0 THEN
    RAISE EXCEPTION 'Los clasificados totales (%) deben ser potencia de 2 para armar cruces directos.', v_total;
  END IF;

  v_total_rondas   := log(2, v_total)::integer;
  v_grupo_playoffs := format('%s_PLAYOFFS', v_grupo_base);

  -- Armar cruces de ronda 1 evitando que dos clasificados del mismo grupo se enfrenten.
  -- La mitad superior (seeds 1..v_half, los mejores por posicion de grupo) se empareja con
  -- el mejor candidato disponible de la mitad inferior (recorrida de mas debil a mas fuerte,
  -- para preservar "mejor vs mas debil") cuyo grupo de origen sea distinto.
  v_half   := v_total / 2;
  v_r1_j1  := ARRAY[]::uuid[];
  v_r1_j2  := ARRAY[]::uuid[];
  v_used   := ARRAY(SELECT false FROM generate_series(1, v_total));

  FOR v_pos IN 1..v_half LOOP
    v_r1_j1    := array_append(v_r1_j1, v_seeded[v_pos]);
    v_top_grupo := v_seeded_grupo[v_pos];
    v_found     := false;

    FOR v_idx IN REVERSE v_total..(v_half + 1) LOOP
      IF NOT v_used[v_idx] AND v_seeded_grupo[v_idx] IS DISTINCT FROM v_top_grupo THEN
        v_used[v_idx] := true;
        v_r1_j2 := array_append(v_r1_j2, v_seeded[v_idx]);
        v_found := true;
        EXIT;
      END IF;
    END LOOP;

    IF NOT v_found THEN
      -- No habia candidato de otro grupo disponible (grupos muy desparejos): tomar el mas debil libre.
      FOR v_idx IN REVERSE v_total..(v_half + 1) LOOP
        IF NOT v_used[v_idx] THEN
          v_used[v_idx] := true;
          v_r1_j2 := array_append(v_r1_j2, v_seeded[v_idx]);
          EXIT;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  v_grupo_playoffs_id := public.upsert_torneo_grupo(
    p_torneo_id, v_categoria, v_grupo_playoffs, 'Playoffs', 'PLAYOFFS', 1, v_grupo_base_id, false
  );

  DELETE FROM public.torneo_estado
  WHERE torneo_id = p_torneo_id AND categoria = v_categoria AND grupo = v_grupo_playoffs;

  INSERT INTO public.torneo_estado (torneo_id, categoria, grupo, estado, current_participantes)
  VALUES (p_torneo_id, v_categoria, v_grupo_playoffs, 'LOCKED', v_total);

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
        v_j1 := v_r1_j1[v_pos];
        v_j2 := v_r1_j2[v_pos];
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

  -- Enlazar siguiente_partido_id entre rondas
  v_offset := 0;
  FOR v_ronda IN 1..(v_total_rondas - 1) LOOP
    v_num_matches   := v_total / (2 ^ v_ronda);
    v_offset_next   := v_offset + v_num_matches;
    FOR v_pos IN 1..v_num_matches LOOP
      v_flat_idx      := v_offset + v_pos;
      v_flat_idx_next := v_offset_next + ceil(v_pos::numeric / 2)::integer;
      UPDATE public.partidos SET siguiente_partido_id = v_match_ids[v_flat_idx_next]
      WHERE id = v_match_ids[v_flat_idx];
    END LOOP;
    v_offset := v_offset + v_num_matches;
  END LOOP;

  UPDATE public.partidos
  SET stage_name = public.calculate_stage_name(p_torneo_id, ronda)
  WHERE torneo_id = p_torneo_id AND categoria = v_categoria
    AND grupo = v_grupo_playoffs AND bracket_tipo = 'eliminacion_directa';

  RETURN QUERY SELECT v_categoria, v_grupo_playoffs, v_grupos_fuente, v_total, v_partidos;
END;
$function$;

COMMENT ON FUNCTION public.generar_playoffs_eliminacion_directa_torneo(bigint, text, text)
IS 'Toma los mejores N por grupo (configurable) y arma cruces de playoffs en eliminacion directa (jornada 1), garantizando que la ronda 1 empareje siempre jugadores de grupos distintos.';
