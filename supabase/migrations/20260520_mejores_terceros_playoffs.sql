-- Soporte para "mejores terceros" en playoffs.
-- Agrega columnas a torneo_configuracion, actualiza la validacion de configuracion
-- y la funcion de generacion de bracket para incluir a los mejores 3ros clasificados.
-- Fecha: 2026-05-20

-- ============================================================
-- 1. Nuevas columnas en torneo_configuracion
-- ============================================================

ALTER TABLE public.torneo_configuracion
  ADD COLUMN IF NOT EXISTS incluir_mejores_terceros boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cantidad_mejores_terceros integer CHECK (cantidad_mejores_terceros >= 1);

COMMENT ON COLUMN public.torneo_configuracion.incluir_mejores_terceros IS
  'Si true, incluye los mejores 3ros clasificados para completar el cuadro de playoffs a potencia de 2.';

COMMENT ON COLUMN public.torneo_configuracion.cantidad_mejores_terceros IS
  'Cantidad de mejores 3ros que clasifican a playoffs. Debe ser menor que numero_grupos.';

-- ============================================================
-- 2. Actualizar trigger de validacion de configuracion
-- ============================================================

CREATE OR REPLACE FUNCTION public.chk_grupos_clasificados_potencia_de_2()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_grupos            integer;
  v_clasificados      integer;
  v_mejores_terceros  integer;
  v_total             integer;
BEGIN
  IF NOT coalesce(NEW.crear_playoffs_eliminacion_directa, false) THEN
    RETURN NEW;
  END IF;

  -- Sin numero_grupos explicito no podemos validar en este momento
  IF NEW.numero_grupos IS NULL THEN
    RETURN NEW;
  END IF;

  v_grupos       := NEW.numero_grupos;
  v_clasificados := coalesce(NEW.clasificados_por_grupo, 2);

  IF coalesce(NEW.incluir_mejores_terceros, false) THEN

    IF NEW.cantidad_mejores_terceros IS NULL THEN
      RAISE EXCEPTION
        'Debe especificar cantidad_mejores_terceros cuando incluir_mejores_terceros = true.';
    END IF;

    IF NEW.cantidad_mejores_terceros >= v_grupos THEN
      RAISE EXCEPTION
        'cantidad_mejores_terceros (%) debe ser menor que numero_grupos (%). '
        'Solo puede haber un 3er puesto por grupo.',
        NEW.cantidad_mejores_terceros, v_grupos;
    END IF;

    v_mejores_terceros := NEW.cantidad_mejores_terceros;
    v_total            := (v_grupos * v_clasificados) + v_mejores_terceros;

    IF v_total <= 0 OR (v_total & (v_total - 1)) <> 0 THEN
      RAISE EXCEPTION
        'Configuracion invalida: (% grupos x % clasificados) + % mejores terceros = % jugadores en playoffs. '
        'El total debe ser potencia de 2 (2, 4, 8, 16, 32...). '
        'Ejemplo valido: (5 grupos x 2 clasificados) + 6 terceros = 16.',
        v_grupos, v_clasificados, v_mejores_terceros, v_total;
    END IF;

  ELSE

    v_total := v_grupos * v_clasificados;

    IF v_total <= 0 OR (v_total & (v_total - 1)) <> 0 THEN
      RAISE EXCEPTION
        'Configuracion invalida: % grupos x % clasificados = % jugadores en playoffs. '
        'El total debe ser potencia de 2 (2, 4, 8, 16, 32...). '
        'Ejemplos validos: 2x2=4, 4x2=8, 2x4=8, 8x2=16. '
        'Tambien podes activar incluir_mejores_terceros para completar el cuadro.',
        v_grupos, v_clasificados, v_total;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chk_grupos_clasificados_potencia_de_2 ON public.torneo_configuracion;
CREATE TRIGGER trg_chk_grupos_clasificados_potencia_de_2
  BEFORE INSERT OR UPDATE ON public.torneo_configuracion
  FOR EACH ROW
  EXECUTE FUNCTION public.chk_grupos_clasificados_potencia_de_2();

-- ============================================================
-- 3. Actualizar generar_playoffs_eliminacion_directa_torneo
--    para incluir mejores 3ros en el bracket
-- ============================================================

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
  -- 2. Mejores terceros (pos_grupo = clasificados_por_grupo + 1), seeded al final,
  --    ordenados por puntos/sets entre todos los grupos.
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
    count(*)::integer,
    count(DISTINCT s.grupo)::integer
  INTO v_seeded, v_total, v_grupos_fuente
  FROM seeded s;

  IF v_total < 2 THEN
    RAISE EXCEPTION 'No hay suficientes clasificados para playoffs (%).', v_total;
  END IF;
  IF (v_total & (v_total - 1)) <> 0 THEN
    RAISE EXCEPTION 'Los clasificados totales (%) deben ser potencia de 2 para armar cruces directos.', v_total;
  END IF;

  v_total_rondas   := log(2, v_total)::integer;
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
        -- Seed 1 vs Seed N, Seed 2 vs Seed N-1, etc.
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
