-- Fix escape string issue in generar_playoffs_eliminacion_directa_torneo function
-- The issue is with escape '\' which causes "invalid escape string" error

-- We need to replace the escape sequence with a single backslash or use a different approach
-- The pattern '_G%' with ESCAPE '\' is meant to match literal '_G' (underscore followed by G)
-- We'll use starts_with() or a different LIKE pattern instead

-- Drop existing function to allow return type change (column renamed from categoria to out_categoria)
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
  v_idx integer;
  v_j1 uuid;
  v_j2 uuid;
BEGIN
  v_categoria := nullif(trim(coalesce(p_categoria, '')), '');
  IF v_categoria IS NULL THEN
    SELECT t.subtitulo
      INTO v_categoria
    FROM public.torneos t
    WHERE t.id = p_torneo_id
    LIMIT 1;
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
  FROM public.resolver_grupo_base_torneo(
    p_torneo_id,
    v_categoria,
    p_grupo_base,
    v_grupo_base_id
  );

  IF NOT v_habilitar_playoffs THEN
    RAISE EXCEPTION 'Playoffs por eliminacion directa no habilitado en torneo_configuracion para torneo %.', p_torneo_id;
  END IF;

  -- Check if playoffs already exist (FIXED: removed problematic escape sequence)
  SELECT EXISTS (
    SELECT 1 FROM public.partidos p
    WHERE p.torneo_id = p_torneo_id
      AND p.categoria = v_categoria
      AND p.grupo LIKE (v_grupo_base || '_PLAYOFFS')
  ) INTO v_has_existing;

  IF v_has_existing THEN
    RAISE EXCEPTION 'El playoffs % ya tiene partidos cargados. Limpialos antes de regenerar.', v_grupo_playoffs;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.torneo_partidos_historial h
    WHERE h.torneo_id = p_torneo_id
      AND h.categoria = v_categoria
      AND h.grupo LIKE (v_grupo_base || '_PLAYOFFS')
  ) INTO v_has_existing;

  IF v_has_existing THEN
    RAISE EXCEPTION 'El playoffs % ya tiene historial cargado. Limpialo antes de regenerar.', v_grupo_playoffs;
  END IF;

  -- FIXED: Use starts_with() instead of LIKE with escape sequence
  WITH ranking AS (
    SELECT
      tj.grupo,
      tj.perfil_id,
      coalesce(tj.puntos, 0) AS puntos,
      coalesce(tj.sets_ganados, 0) AS sets_ganados,
      coalesce(tj.partidos_jugados, 0) AS partidos_jugados,
      row_number() OVER (
        PARTITION BY tj.grupo
        ORDER BY
          coalesce(tj.puntos, 0) DESC,
          coalesce(tj.sets_ganados, 0) DESC,
          coalesce(tj.partidos_jugados, 0) ASC,
          tj.perfil_id ASC
      ) AS pos_grupo
    FROM public.torneo_jugadores tj
    WHERE tj.torneo_id = p_torneo_id
      AND tj.categoria = v_categoria
      AND (
        tj.grupo = v_grupo_base
        OR starts_with(tj.grupo, v_grupo_base || '_G')
      )
  ),
  clasificados AS (
    SELECT *
    FROM ranking
    WHERE pos_grupo <= v_clasificados_por_grupo
  ),
  seeded AS (
    SELECT
      c.*,
      row_number() OVER (
        ORDER BY
          c.pos_grupo ASC,
          c.puntos DESC,
          c.sets_ganados DESC,
          c.partidos_jugados ASC,
          c.grupo ASC,
          c.perfil_id ASC
      ) AS seed
    FROM clasificados c
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

  v_grupo_playoffs := format('%s_PLAYOFFS', v_grupo_base);
  v_grupo_playoffs_id := public.upsert_torneo_grupo(
    p_torneo_id,
    v_categoria,
    v_grupo_playoffs,
    'Playoffs',
    'PLAYOFFS',
    1,
    v_grupo_base_id,
    false
  );

  -- Delete existing record to avoid conflict, then insert fresh
  DELETE FROM public.torneo_estado
  WHERE torneo_estado.torneo_id = p_torneo_id
    AND torneo_estado.categoria = v_categoria
    AND torneo_estado.grupo = v_grupo_playoffs;

  INSERT INTO public.torneo_estado (
    torneo_id, categoria, grupo, estado, max_participantes, current_participantes
  ) VALUES (
    p_torneo_id,
    v_categoria,
    v_grupo_playoffs,
    'LOCKED',
    v_total,
    v_total
  );

  v_idx := 1;
  WHILE v_idx <= v_total LOOP
    v_j1 := v_seeded[v_idx];
    v_j2 := v_seeded[v_total - v_idx + 1];
    
    INSERT INTO public.partidos (
      id,
      torneo_id,
      categoria,
      grupo,
      jornada,
      jugador1_id,
      jugador2_id,
      estado,
      ronda,
      posicion_bracket,
      bracket_tipo
    ) VALUES (
      gen_random_uuid(),
      p_torneo_id,
      v_categoria,
      v_grupo_playoffs,
      1,
      v_j1,
      v_j2,
      'programado',
      1, -- Always start at ronda 1 (first round)
      ceil(v_idx::numeric / 2)::integer,
      'eliminacion_directa'
    );
    
    v_partidos := v_partidos + 1;
    v_idx := v_idx + 2;
  END LOOP;

  RETURN QUERY
  SELECT v_categoria, v_grupo_playoffs, v_grupos_fuente, v_total, v_partidos;
END;
$$;
