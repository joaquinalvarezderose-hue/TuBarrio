-- Vista de ranking general por categoría
-- Lógica de puntos (independiente del sistema de torneos):
--   Victoria 2-0 → ganador +3 pts, perdedor +0 pts
--   Victoria 2-1 → ganador +2 pts, perdedor +1 pt
-- Fuente: torneo_partidos_historial (acumula todas las ediciones, grupos + playoffs)

CREATE OR REPLACE VIEW public.ranking_categorias_view AS
WITH match_points AS (
  -- Puntos para jugador1
  SELECT
    h.categoria,
    h.jugador1_perfil_id AS perfil_id,
    CASE
      WHEN h.sets_jugador1 = 2 AND h.sets_jugador2 = 0 THEN 3
      WHEN h.sets_jugador1 = 2 AND h.sets_jugador2 = 1 THEN 2
      WHEN h.sets_jugador1 = 1 AND h.sets_jugador2 = 2 THEN 1
      ELSE 0
    END AS puntos_ranking,
    CASE WHEN h.sets_jugador1 > h.sets_jugador2 THEN 1 ELSE 0 END AS victoria,
    CASE WHEN h.sets_jugador1 < h.sets_jugador2 THEN 1 ELSE 0 END AS derrota
  FROM public.torneo_partidos_historial h
  WHERE h.jugador1_perfil_id IS NOT NULL
    AND h.sets_jugador1 IS NOT NULL
    AND h.sets_jugador2 IS NOT NULL

  UNION ALL

  -- Puntos para jugador2 (simétrico)
  SELECT
    h.categoria,
    h.jugador2_perfil_id AS perfil_id,
    CASE
      WHEN h.sets_jugador2 = 2 AND h.sets_jugador1 = 0 THEN 3
      WHEN h.sets_jugador2 = 2 AND h.sets_jugador1 = 1 THEN 2
      WHEN h.sets_jugador2 = 1 AND h.sets_jugador1 = 2 THEN 1
      ELSE 0
    END AS puntos_ranking,
    CASE WHEN h.sets_jugador2 > h.sets_jugador1 THEN 1 ELSE 0 END AS victoria,
    CASE WHEN h.sets_jugador2 < h.sets_jugador1 THEN 1 ELSE 0 END AS derrota
  FROM public.torneo_partidos_historial h
  WHERE h.jugador2_perfil_id IS NOT NULL
    AND h.sets_jugador1 IS NOT NULL
    AND h.sets_jugador2 IS NOT NULL
),
aggregated AS (
  SELECT
    mp.categoria,
    mp.perfil_id,
    p.nombre_completo,
    COUNT(*)::int              AS partidos_jugados,
    SUM(mp.victoria)::int      AS victorias,
    SUM(mp.derrota)::int       AS derrotas,
    SUM(mp.puntos_ranking)::int AS puntos
  FROM match_points mp
  JOIN public.perfiles p ON p.id = mp.perfil_id
  WHERE mp.categoria IS NOT NULL
    AND mp.categoria NOT ILIKE 'no entrar%'
    AND p.nombre_completo NOT ILIKE 'prueba%'
  GROUP BY mp.categoria, mp.perfil_id, p.nombre_completo
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
  )::int AS posicion
FROM aggregated;

-- Solo authenticated: perfiles no tiene política SELECT para anon,
-- y el ranking solo tiene sentido para usuarios con sesión activa.
GRANT SELECT ON public.ranking_categorias_view TO authenticated;
