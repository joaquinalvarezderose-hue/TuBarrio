-- ============================================================
-- torneos.genero + ranking_categorias_view por categoria+genero+modalidad
--
-- Motivo: ranking_categorias_view agrupaba SOLO por el texto libre
-- "categoria" (ej. "Segunda"), sin distinguir genero ni modalidad. Eso
-- generaba tabs ambiguos en la pantalla de Ranking (ej. "Segunda
-- Categoria" podia referirse tanto a un torneo de singles caballeros
-- como a uno de dobles damas) y, peor, si dos torneos distintos
-- llegaban a compartir el mismo texto de categoria sus puntos se
-- sumarian juntos silenciosamente. Ya pasa hoy con los torneos de
-- prueba 19 (singles) y 23 (dobles), que comparten categoria =
-- "General" y por lo tanto mezclan sus partidos en un solo bucket.
--
-- No existia ningun campo estructurado de genero (ni en torneos ni en
-- torneo_configuracion): vivia solo como texto libre dentro del
-- titulo/subtitulo. Se agrega torneos.genero como fuente de verdad,
-- se backfillea por patron de texto sobre los torneos existentes, y de
-- ahora en mas se pide explicitamente al crear/editar un torneo.
-- ============================================================

ALTER TABLE public.torneos
  ADD COLUMN IF NOT EXISTS genero text;

UPDATE public.torneos
SET genero = CASE
  WHEN titulo ILIKE '%dama%' OR subtitulo ILIKE '%dama%' OR titulo ILIKE '%femenin%' OR subtitulo ILIKE '%femenin%' THEN 'femenino'
  WHEN titulo ILIKE '%caballero%' OR subtitulo ILIKE '%caballero%' OR titulo ILIKE '%masculin%' OR subtitulo ILIKE '%masculin%' THEN 'masculino'
  ELSE 'mixto'
END
WHERE genero IS NULL;

ALTER TABLE public.torneos
  ALTER COLUMN genero SET DEFAULT 'mixto';
ALTER TABLE public.torneos
  ALTER COLUMN genero SET NOT NULL;
ALTER TABLE public.torneos
  DROP CONSTRAINT IF EXISTS torneos_genero_check;
ALTER TABLE public.torneos
  ADD CONSTRAINT torneos_genero_check CHECK (genero IN ('masculino', 'femenino', 'mixto'));

-- ------------------------------------------------------------
-- crear_torneo: agregar p_genero (18avo parametro, con default)
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.crear_torneo(
  text, text, date, date, text, text, integer, integer, integer, integer, integer, boolean, boolean, integer, numeric, numeric, text
);

CREATE OR REPLACE FUNCTION public.crear_torneo(
  p_titulo text,
  p_subtitulo text DEFAULT NULL,
  p_fecha_inicio date DEFAULT NULL,
  p_fecha_fin date DEFAULT NULL,
  p_imagen_url text DEFAULT NULL,
  p_modalidad text DEFAULT 'singles',
  p_max_participantes_por_grupo integer DEFAULT 4,
  p_min_participantes_por_grupo integer DEFAULT 2,
  p_numero_grupos integer DEFAULT NULL,
  p_max_participantes_total integer DEFAULT NULL,
  p_clasificados_por_grupo integer DEFAULT 2,
  p_crear_playoffs_eliminacion_directa boolean DEFAULT false,
  p_incluir_mejores_terceros boolean DEFAULT false,
  p_cantidad_mejores_terceros integer DEFAULT NULL,
  p_precio_expensas numeric DEFAULT 5000,
  p_precio_transferencia numeric DEFAULT 45000,
  p_premios text DEFAULT 'Del 1° al 4°',
  p_genero text DEFAULT 'mixto'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_torneo_id bigint;
  v_titulo    text;
BEGIN
  IF NOT (public.is_admin() OR public.is_organizador()) THEN
    RAISE EXCEPTION 'Permiso denegado: solo admin u organizador puede crear torneos.';
  END IF;

  v_titulo := NULLIF(TRIM(COALESCE(p_titulo, '')), '');
  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'El titulo es obligatorio.';
  END IF;

  IF p_modalidad NOT IN ('singles', 'dobles') THEN
    RAISE EXCEPTION 'Modalidad invalida: %. Debe ser singles o dobles.', p_modalidad;
  END IF;

  IF COALESCE(p_genero, 'mixto') NOT IN ('masculino', 'femenino', 'mixto') THEN
    RAISE EXCEPTION 'Genero invalido: %. Debe ser masculino, femenino o mixto.', p_genero;
  END IF;

  IF COALESCE(p_precio_expensas, 0) < 0 OR COALESCE(p_precio_transferencia, 0) < 0 THEN
    RAISE EXCEPTION 'Los montos no pueden ser negativos.';
  END IF;

  INSERT INTO public.torneos (
    titulo, subtitulo, fecha_inicio, fecha_fin, imagen_url, activo, creado_por,
    precio_expensas, precio_transferencia, premios, genero
  )
  VALUES (
    v_titulo,
    COALESCE(NULLIF(TRIM(p_subtitulo), ''), v_titulo),
    p_fecha_inicio,
    p_fecha_fin,
    p_imagen_url,
    true,
    auth.uid(),
    COALESCE(p_precio_expensas, 5000),
    COALESCE(p_precio_transferencia, 45000),
    COALESCE(NULLIF(TRIM(p_premios), ''), 'Del 1° al 4°'),
    COALESCE(p_genero, 'mixto')
  )
  RETURNING id INTO v_torneo_id;

  -- trg_create_torneo_configuracion_on_insert ya inserto la fila default
  -- en torneo_configuracion; la completamos con los valores elegidos.
  UPDATE public.torneo_configuracion
  SET modalidad                           = p_modalidad,
      max_participantes_por_grupo         = GREATEST(2, COALESCE(p_max_participantes_por_grupo, 4)),
      min_participantes_por_grupo         = p_min_participantes_por_grupo,
      numero_grupos                       = p_numero_grupos,
      max_participantes_total             = p_max_participantes_total,
      clasificados_por_grupo              = GREATEST(1, COALESCE(p_clasificados_por_grupo, 2)),
      crear_playoffs_eliminacion_directa  = COALESCE(p_crear_playoffs_eliminacion_directa, false),
      incluir_mejores_terceros            = COALESCE(p_incluir_mejores_terceros, false),
      cantidad_mejores_terceros           = p_cantidad_mejores_terceros,
      updated_at                          = now()
  WHERE torneo_id = v_torneo_id;

  RETURN v_torneo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_torneo(
  text, text, date, date, text, text, integer, integer, integer, integer, integer, boolean, boolean, integer, numeric, numeric, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crear_torneo(
  text, text, date, date, text, text, integer, integer, integer, integer, integer, boolean, boolean, integer, numeric, numeric, text, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.crear_torneo(
  text, text, date, date, text, text, integer, integer, integer, integer, integer, boolean, boolean, integer, numeric, numeric, text, text
) TO authenticated;

-- ------------------------------------------------------------
-- actualizar_configuracion_torneo: agregar p_genero (18avo parametro)
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.actualizar_configuracion_torneo(
  bigint, text, text, date, date, text, integer, integer, integer, integer, integer, boolean, boolean, integer, numeric, numeric, text
);

CREATE OR REPLACE FUNCTION public.actualizar_configuracion_torneo(
  p_torneo_id bigint,
  p_titulo text DEFAULT NULL,
  p_subtitulo text DEFAULT NULL,
  p_fecha_inicio date DEFAULT NULL,
  p_fecha_fin date DEFAULT NULL,
  p_imagen_url text DEFAULT NULL,
  p_max_participantes_por_grupo integer DEFAULT NULL,
  p_min_participantes_por_grupo integer DEFAULT NULL,
  p_numero_grupos integer DEFAULT NULL,
  p_max_participantes_total integer DEFAULT NULL,
  p_clasificados_por_grupo integer DEFAULT NULL,
  p_crear_playoffs_eliminacion_directa boolean DEFAULT NULL,
  p_incluir_mejores_terceros boolean DEFAULT NULL,
  p_cantidad_mejores_terceros integer DEFAULT NULL,
  p_precio_expensas numeric DEFAULT NULL,
  p_precio_transferencia numeric DEFAULT NULL,
  p_premios text DEFAULT NULL,
  p_genero text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.puede_administrar_torneo(p_torneo_id) THEN
    RAISE EXCEPTION 'Permiso denegado: no administras este torneo.';
  END IF;

  IF p_precio_expensas IS NOT NULL AND p_precio_expensas < 0 THEN
    RAISE EXCEPTION 'El monto de expensas no puede ser negativo.';
  END IF;
  IF p_precio_transferencia IS NOT NULL AND p_precio_transferencia < 0 THEN
    RAISE EXCEPTION 'El monto a transferir no puede ser negativo.';
  END IF;
  IF p_genero IS NOT NULL AND p_genero NOT IN ('masculino', 'femenino', 'mixto') THEN
    RAISE EXCEPTION 'Genero invalido: %. Debe ser masculino, femenino o mixto.', p_genero;
  END IF;

  UPDATE public.torneos
  SET titulo                = COALESCE(NULLIF(TRIM(p_titulo), ''), titulo),
      subtitulo             = COALESCE(NULLIF(TRIM(p_subtitulo), ''), subtitulo),
      fecha_inicio          = COALESCE(p_fecha_inicio, fecha_inicio),
      fecha_fin             = COALESCE(p_fecha_fin, fecha_fin),
      imagen_url            = COALESCE(p_imagen_url, imagen_url),
      precio_expensas       = COALESCE(p_precio_expensas, precio_expensas),
      precio_transferencia  = COALESCE(p_precio_transferencia, precio_transferencia),
      premios               = COALESCE(NULLIF(TRIM(p_premios), ''), premios),
      genero                = COALESCE(p_genero, genero),
      updated_at            = now()
  WHERE id = p_torneo_id;

  UPDATE public.torneo_configuracion
  SET max_participantes_por_grupo        = COALESCE(p_max_participantes_por_grupo, max_participantes_por_grupo),
      min_participantes_por_grupo        = COALESCE(p_min_participantes_por_grupo, min_participantes_por_grupo),
      numero_grupos                      = COALESCE(p_numero_grupos, numero_grupos),
      max_participantes_total            = COALESCE(p_max_participantes_total, max_participantes_total),
      clasificados_por_grupo             = COALESCE(p_clasificados_por_grupo, clasificados_por_grupo),
      crear_playoffs_eliminacion_directa = COALESCE(p_crear_playoffs_eliminacion_directa, crear_playoffs_eliminacion_directa),
      incluir_mejores_terceros           = COALESCE(p_incluir_mejores_terceros, incluir_mejores_terceros),
      cantidad_mejores_terceros          = COALESCE(p_cantidad_mejores_terceros, cantidad_mejores_terceros),
      updated_at                         = now()
  WHERE torneo_id = p_torneo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_configuracion_torneo(
  bigint, text, text, date, date, text, integer, integer, integer, integer, integer, boolean, boolean, integer, numeric, numeric, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.actualizar_configuracion_torneo(
  bigint, text, text, date, date, text, integer, integer, integer, integer, integer, boolean, boolean, integer, numeric, numeric, text, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.actualizar_configuracion_torneo(
  bigint, text, text, date, date, text, integer, integer, integer, integer, integer, boolean, boolean, integer, numeric, numeric, text, text
) TO authenticated;

-- ------------------------------------------------------------
-- ranking_categorias_view: agrupar por categoria + genero + modalidad
-- en vez de categoria sola, y exponer ambos campos para la UI.
-- ------------------------------------------------------------

DROP VIEW IF EXISTS public.ranking_categorias_view;

CREATE VIEW public.ranking_categorias_view AS
WITH resolved_matches AS (
  SELECT
    h.categoria,
    t.genero,
    CASE WHEN h.equipo1_id IS NULL THEN 'singles' ELSE 'dobles' END AS modalidad,
    CASE
      WHEN h.equipo1_id IS NULL THEN ARRAY[h.jugador1_perfil_id]
      ELSE ARRAY[te1.jugador1_id, te1.jugador2_id]
    END AS lado1_ids,
    CASE
      WHEN h.equipo2_id IS NULL THEN ARRAY[h.jugador2_perfil_id]
      ELSE ARRAY[te2.jugador1_id, te2.jugador2_id]
    END AS lado2_ids,
    h.sets_jugador1,
    h.sets_jugador2,
    COALESCE((
      SELECT SUM((s.value->>'p1')::int)
      FROM jsonb_array_elements(h.sets_json) WITH ORDINALITY AS s(value, ord)
      WHERE s.ord <= 2
    ), 0) AS games_lado1,
    COALESCE((
      SELECT SUM((s.value->>'p2')::int)
      FROM jsonb_array_elements(h.sets_json) WITH ORDINALITY AS s(value, ord)
      WHERE s.ord <= 2
    ), 0) AS games_lado2
  FROM public.torneo_partidos_historial h
  JOIN public.torneos t ON t.id = h.torneo_id
  LEFT JOIN public.torneo_equipos te1 ON te1.id = h.equipo1_id
  LEFT JOIN public.torneo_equipos te2 ON te2.id = h.equipo2_id
  WHERE h.categoria IS NOT NULL
    AND h.categoria NOT ILIKE 'no entrar%'
    AND h.sets_jugador1 IS NOT NULL
    AND h.sets_jugador2 IS NOT NULL
),
match_points AS (
  -- Perspectiva lado1 (uno o dos jugadores si es dobles)
  SELECT
    rm.categoria,
    rm.genero,
    rm.modalidad,
    p_id AS perfil_id,
    CASE
      WHEN rm.sets_jugador1 = 2 AND rm.sets_jugador2 = 0 THEN 3
      WHEN rm.sets_jugador1 = 2 AND rm.sets_jugador2 = 1 THEN 2
      WHEN rm.sets_jugador1 = 1 AND rm.sets_jugador2 = 2 THEN 1
      ELSE 0
    END AS puntos_ranking,
    (rm.sets_jugador1 > rm.sets_jugador2)::int AS victoria,
    (rm.sets_jugador1 < rm.sets_jugador2)::int AS derrota,
    rm.sets_jugador1 AS sets_ganados,
    rm.sets_jugador2 AS sets_perdidos,
    rm.games_lado1 AS games_ganados,
    rm.games_lado2 AS games_perdidos,
    rm.lado2_ids AS oponente_ids,
    (rm.sets_jugador1 > rm.sets_jugador2) AS gano
  FROM resolved_matches rm, unnest(rm.lado1_ids) AS p_id
  WHERE p_id IS NOT NULL

  UNION ALL

  -- Perspectiva lado2
  SELECT
    rm.categoria,
    rm.genero,
    rm.modalidad,
    p_id AS perfil_id,
    CASE
      WHEN rm.sets_jugador2 = 2 AND rm.sets_jugador1 = 0 THEN 3
      WHEN rm.sets_jugador2 = 2 AND rm.sets_jugador1 = 1 THEN 2
      WHEN rm.sets_jugador2 = 1 AND rm.sets_jugador1 = 2 THEN 1
      ELSE 0
    END AS puntos_ranking,
    (rm.sets_jugador2 > rm.sets_jugador1)::int AS victoria,
    (rm.sets_jugador2 < rm.sets_jugador1)::int AS derrota,
    rm.sets_jugador2 AS sets_ganados,
    rm.sets_jugador1 AS sets_perdidos,
    rm.games_lado2 AS games_ganados,
    rm.games_lado1 AS games_perdidos,
    rm.lado1_ids AS oponente_ids,
    (rm.sets_jugador2 > rm.sets_jugador1) AS gano
  FROM resolved_matches rm, unnest(rm.lado2_ids) AS p_id
  WHERE p_id IS NOT NULL
),
per_player_totals AS (
  SELECT
    mp.categoria,
    mp.genero,
    mp.modalidad,
    mp.perfil_id,
    COUNT(*)::int               AS partidos_jugados,
    SUM(mp.victoria)::int       AS victorias,
    SUM(mp.derrota)::int        AS derrotas,
    SUM(mp.puntos_ranking)::int AS puntos,
    SUM(mp.sets_ganados)::int   AS sets_ganados,
    SUM(mp.sets_perdidos)::int  AS sets_perdidos,
    SUM(mp.games_ganados)::int  AS games_ganados,
    SUM(mp.games_perdidos)::int AS games_perdidos
  FROM match_points mp
  GROUP BY mp.categoria, mp.genero, mp.modalidad, mp.perfil_id
),
per_player_h2h AS (
  SELECT
    mp.categoria,
    mp.genero,
    mp.modalidad,
    mp.perfil_id,
    jsonb_agg(jsonb_build_object('oponente_perfil_id', opp, 'gano', mp.gano)) AS enfrentamientos
  FROM match_points mp
  CROSS JOIN LATERAL unnest(mp.oponente_ids) AS opp
  WHERE opp IS NOT NULL
  GROUP BY mp.categoria, mp.genero, mp.modalidad, mp.perfil_id
),
aggregated AS (
  SELECT
    t.categoria,
    t.genero,
    t.modalidad,
    t.perfil_id,
    p.nombre_completo,
    t.partidos_jugados,
    t.victorias,
    t.derrotas,
    t.puntos,
    t.sets_ganados,
    t.sets_perdidos,
    t.games_ganados,
    t.games_perdidos,
    COALESCE(h.enfrentamientos, '[]'::jsonb) AS enfrentamientos
  FROM per_player_totals t
  JOIN public.perfiles p ON p.id = t.perfil_id
  LEFT JOIN per_player_h2h h
    ON h.categoria = t.categoria AND h.genero = t.genero AND h.modalidad = t.modalidad AND h.perfil_id = t.perfil_id
  WHERE p.nombre_completo NOT ILIKE 'prueba%'
)
SELECT
  categoria,
  genero,
  modalidad,
  perfil_id,
  nombre_completo,
  partidos_jugados,
  victorias,
  derrotas,
  puntos,
  ROW_NUMBER() OVER (
    PARTITION BY categoria, genero, modalidad
    ORDER BY puntos DESC, victorias DESC, partidos_jugados ASC
  )::int AS posicion,
  sets_ganados,
  sets_perdidos,
  games_ganados,
  games_perdidos,
  enfrentamientos
FROM aggregated;

GRANT SELECT ON public.ranking_categorias_view TO authenticated;
