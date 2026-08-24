-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: v_admin_grupos_posiciones no incluia torneos de dobles
-- ─────────────────────────────────────────────────────────────────────────────
-- La vista original solo leia de torneo_jugadores (poblada por el sorteo de
-- singles, sortear_grupos_y_fixture_torneo). El sorteo de dobles
-- (sortear_grupos_y_fixture_equipos_torneo) arma los grupos en torneo_equipos
-- y nunca toca torneo_jugadores, asi que para cualquier torneo de dobles la
-- vista devolvia 0 filas. Eso rompe el selector "Vista Previa" de
-- AdminPanel.tsx y el selector de grupos de AdminPartidos.tsx (ambos solo
-- leen torneo_id/categoria/grupo de esta vista para poblar sus dropdowns),
-- aunque las parejas y el fixture real esten perfectos en torneo_equipos/
-- partidos. Mismo patron que el fix de ranking_categorias_view
-- (20260824_dobles_placeholder_y_fix_ranking.sql): se agrega un branch UNION
-- ALL que arma el ranking por equipo en vez de por jugador individual.
--
-- perfil_id para el branch de dobles queda como el id del equipo (uuid,
-- mismo tipo de columna) ya que no hay un jugador individual representativo;
-- ningun consumidor actual de la vista lee esa columna para dobles.

CREATE OR REPLACE VIEW public.v_admin_grupos_posiciones
WITH (security_invoker = true) AS
SELECT * FROM (
  SELECT
    t.id                                                            AS torneo_id,
    t.titulo                                                        AS torneo_titulo,
    tj.categoria,
    tj.grupo,
    te.estado                                                       AS estado_grupo,
    te.sorteo_realizado,
    RANK() OVER (
      PARTITION BY tj.torneo_id, tj.categoria, tj.grupo
      ORDER BY
        COALESCE(tj.puntos, 0)                                        DESC,
        COALESCE(tj.sets_ganados,0) - COALESCE(tj.sets_perdidos,0)   DESC,
        COALESCE(tj.sets_ganados, 0)                                  DESC
    )                                                               AS posicion,
    p.nombre_completo                                               AS jugador_nombre,
    p.whatsapp                                                      AS jugador_whatsapp,
    tj.perfil_id,
    COALESCE(tj.puntos, 0)                                          AS puntos,
    COALESCE(tj.partidos_jugados, 0)                                AS pj,
    COALESCE(tj.sets_ganados, 0)                                    AS sg,
    COALESCE(tj.sets_perdidos, 0)                                   AS sp,
    COALESCE(tj.sets_ganados,0) - COALESCE(tj.sets_perdidos,0)     AS dif_sets
  FROM public.torneo_jugadores tj
  JOIN  public.perfiles p  ON p.id = tj.perfil_id
  JOIN  public.torneos  t  ON t.id = tj.torneo_id
  LEFT JOIN public.torneo_estado te
    ON  te.torneo_id = tj.torneo_id
    AND te.categoria = tj.categoria
    AND te.grupo     = tj.grupo

  UNION ALL

  SELECT
    t.id                                                            AS torneo_id,
    t.titulo                                                        AS torneo_titulo,
    te2.categoria,
    te2.grupo,
    tes.estado                                                      AS estado_grupo,
    tes.sorteo_realizado,
    RANK() OVER (
      PARTITION BY te2.torneo_id, te2.categoria, te2.grupo
      ORDER BY
        COALESCE(te2.puntos, 0)                                        DESC,
        COALESCE(te2.sets_ganados,0) - COALESCE(te2.sets_perdidos,0)   DESC,
        COALESCE(te2.sets_ganados, 0)                                  DESC
    )                                                               AS posicion,
    (p1.nombre_completo || ' / ' || p2.nombre_completo)             AS jugador_nombre,
    NULL::text                                                      AS jugador_whatsapp,
    te2.id                                                          AS perfil_id,
    COALESCE(te2.puntos, 0)                                         AS puntos,
    COALESCE(te2.partidos_jugados, 0)                               AS pj,
    COALESCE(te2.sets_ganados, 0)                                   AS sg,
    COALESCE(te2.sets_perdidos, 0)                                  AS sp,
    COALESCE(te2.sets_ganados,0) - COALESCE(te2.sets_perdidos,0)   AS dif_sets
  FROM public.torneo_equipos te2
  JOIN  public.perfiles p1 ON p1.id = te2.jugador1_id
  JOIN  public.perfiles p2 ON p2.id = te2.jugador2_id
  JOIN  public.torneos  t  ON t.id  = te2.torneo_id
  LEFT JOIN public.torneo_estado tes
    ON  tes.torneo_id = te2.torneo_id
    AND tes.categoria = te2.categoria
    AND tes.grupo     = te2.grupo
  WHERE te2.grupo IS NOT NULL
) combined
ORDER BY torneo_id, categoria, grupo, posicion;

GRANT SELECT ON public.v_admin_grupos_posiciones TO authenticated;
