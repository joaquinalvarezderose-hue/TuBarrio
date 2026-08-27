-- ============================================================
-- Ranking por categoria: agregar datos de sets/games/H2H para que
-- el desempate en empate de puntos pueda replicar el mismo criterio
-- que la Tabla de Posiciones real (pts -> dif sets -> sets ganados ->
-- H2H -> dif games, ver utils/tournamentLogic.ts::sortByTiebreak).
--
-- ranking_categorias_view es un acumulado cross-torneo por categoria
-- (no esta particionado por torneo_id/grupo), asi que el H2H no puede
-- resolverse con una window function simple sobre pares -- se expone
-- "enfrentamientos" (jsonb por jugador con {oponente_perfil_id, gano}
-- de cada partido) para que el frontend arme el lookup de H2H y
-- ordene, igual patron que ya usa Standings.tsx. La columna "posicion"
-- calculada aca queda como fallback, no es mas la fuente de verdad.
-- ============================================================

CREATE OR REPLACE VIEW public.ranking_categorias_view AS
WITH resolved_matches AS (
  SELECT
    h.categoria,
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
  GROUP BY mp.categoria, mp.perfil_id
),
per_player_h2h AS (
  SELECT
    mp.categoria,
    mp.perfil_id,
    jsonb_agg(jsonb_build_object('oponente_perfil_id', opp, 'gano', mp.gano)) AS enfrentamientos
  FROM match_points mp
  CROSS JOIN LATERAL unnest(mp.oponente_ids) AS opp
  WHERE opp IS NOT NULL
  GROUP BY mp.categoria, mp.perfil_id
),
aggregated AS (
  SELECT
    t.categoria,
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
  LEFT JOIN per_player_h2h h ON h.categoria = t.categoria AND h.perfil_id = t.perfil_id
  WHERE p.nombre_completo NOT ILIKE 'prueba%'
)
SELECT
  categoria,
  perfil_id,
  nombre_completo,
  partidos_jugados,
  victorias,
  derrotas,
  puntos,
  ROW_NUMBER() OVER (
    PARTITION BY categoria
    ORDER BY puntos DESC, victorias DESC, partidos_jugados ASC
  )::int AS posicion,
  sets_ganados,
  sets_perdidos,
  games_ganados,
  games_perdidos,
  enfrentamientos
FROM aggregated;

GRANT SELECT ON public.ranking_categorias_view TO authenticated;
