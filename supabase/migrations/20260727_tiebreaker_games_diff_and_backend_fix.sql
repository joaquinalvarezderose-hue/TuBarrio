-- Migration: Alinea el desempate de fase de grupos entre frontend y backend,
--            y reemplaza el 5to criterio (promedio pts/partido) por diferencia de games.
-- Fecha: 2026-07-27
--
-- Contexto:
--  El frontend (utils/tournamentLogic.ts, screens/Standings.tsx, screens/Rules.tsx) ordena
--  la tabla de posiciones con: 1) Puntos  2) Diferencia de sets  3) Sets ganados
--  4) Head-to-head (resultado directo)  5) Promedio de puntos por partido.
--
--  Pero las funciones que realmente deciden quien clasifica a playoffs y como se siembra
--  el bracket (generar_playoffs_eliminacion_directa_torneo, jugador_clasifica_en_fase_grupos
--  y sus espejos de dobles equipo_clasifica_en_fase_grupos /
--  generar_playoffs_eliminacion_directa_equipos_torneo) solo ordenaban por
--  puntos -> sets_ganados -> partidos_jugados (menos) -> id, sin usar nunca la diferencia
--  de sets (aun teniendo la columna sets_perdidos disponible desde 20260513) ni el H2H.
--  Resultado: la tabla que ve el jugador podia mostrar un orden y el bracket real de
--  playoffs clasificar/sembrar con otro.
--
-- Cambios:
--  1. Columnas games_ganados / games_perdidos en torneo_jugadores y torneo_equipos + backfill
--     desde el historial (sumando los games de cada set en sets_json).
--  2. _confirmar_resultado_core / _confirmar_resultado_equipo_core: acumulan games ganados/perdidos
--     en cada confirmacion de resultado real (los W.O. no aportan games, como ya ocurria antes).
--  3. Las 4 funciones de ranking de fase de grupos ahora ordenan igual que el frontend:
--     puntos -> diferencia de sets -> sets ganados -> H2H (mini-tabla entre empatados)
--     -> diferencia de games -> id (desempate final deterministico, no visible en la UI).
--     El ranking de "mejores terceros" (comparacion entre grupos) no se toca: la UI ya
--     documenta que ahi solo aplican puntos / sets ganados / menos partidos jugados.

-- ============================================================
-- 1. Columnas de games ganados/perdidos
-- ============================================================

ALTER TABLE public.torneo_jugadores
  ADD COLUMN IF NOT EXISTS games_ganados INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS games_perdidos INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.torneo_equipos
  ADD COLUMN IF NOT EXISTS games_ganados INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS games_perdidos INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.torneo_jugadores.games_ganados IS
  'Games (juegos) ganados en todos los sets jugados. Usado como 5to criterio de desempate (diferencia de games).';
COMMENT ON COLUMN public.torneo_jugadores.games_perdidos IS
  'Games (juegos) cedidos al rival en todos los sets jugados. Usado como 5to criterio de desempate.';
COMMENT ON COLUMN public.torneo_equipos.games_ganados IS
  'Games (juegos) ganados en todos los sets jugados. Usado como 5to criterio de desempate (diferencia de games).';
COMMENT ON COLUMN public.torneo_equipos.games_perdidos IS
  'Games (juegos) cedidos al rival en todos los sets jugados. Usado como 5to criterio de desempate.';

-- ─── Backfill jugadores (singles) desde historial ───────────────────────────

UPDATE public.torneo_jugadores tj
SET games_ganados = COALESCE((
      SELECT SUM(
        CASE
          WHEN h.jugador1_perfil_id = tj.perfil_id THEN COALESCE((elem->>'p1')::integer, 0)
          WHEN h.jugador2_perfil_id = tj.perfil_id THEN COALESCE((elem->>'p2')::integer, 0)
          ELSE 0
        END
      )
      FROM public.torneo_partidos_historial h,
           LATERAL jsonb_array_elements(COALESCE(h.sets_json, '[]'::jsonb)) AS elem
      WHERE h.torneo_id = tj.torneo_id
        AND h.categoria = tj.categoria
        AND h.grupo = tj.grupo
        AND (h.jugador1_perfil_id = tj.perfil_id OR h.jugador2_perfil_id = tj.perfil_id)
    ), 0),
    games_perdidos = COALESCE((
      SELECT SUM(
        CASE
          WHEN h.jugador1_perfil_id = tj.perfil_id THEN COALESCE((elem->>'p2')::integer, 0)
          WHEN h.jugador2_perfil_id = tj.perfil_id THEN COALESCE((elem->>'p1')::integer, 0)
          ELSE 0
        END
      )
      FROM public.torneo_partidos_historial h,
           LATERAL jsonb_array_elements(COALESCE(h.sets_json, '[]'::jsonb)) AS elem
      WHERE h.torneo_id = tj.torneo_id
        AND h.categoria = tj.categoria
        AND h.grupo = tj.grupo
        AND (h.jugador1_perfil_id = tj.perfil_id OR h.jugador2_perfil_id = tj.perfil_id)
    ), 0);

-- ─── Backfill equipos (dobles) desde historial ──────────────────────────────

UPDATE public.torneo_equipos te
SET games_ganados = COALESCE((
      SELECT SUM(
        CASE
          WHEN h.equipo1_id = te.id THEN COALESCE((elem->>'p1')::integer, 0)
          WHEN h.equipo2_id = te.id THEN COALESCE((elem->>'p2')::integer, 0)
          ELSE 0
        END
      )
      FROM public.torneo_partidos_historial h,
           LATERAL jsonb_array_elements(COALESCE(h.sets_json, '[]'::jsonb)) AS elem
      WHERE h.torneo_id = te.torneo_id
        AND h.categoria = te.categoria
        AND h.grupo = te.grupo
        AND (h.equipo1_id = te.id OR h.equipo2_id = te.id)
    ), 0),
    games_perdidos = COALESCE((
      SELECT SUM(
        CASE
          WHEN h.equipo1_id = te.id THEN COALESCE((elem->>'p2')::integer, 0)
          WHEN h.equipo2_id = te.id THEN COALESCE((elem->>'p1')::integer, 0)
          ELSE 0
        END
      )
      FROM public.torneo_partidos_historial h,
           LATERAL jsonb_array_elements(COALESCE(h.sets_json, '[]'::jsonb)) AS elem
      WHERE h.torneo_id = te.torneo_id
        AND h.categoria = te.categoria
        AND h.grupo = te.grupo
        AND (h.equipo1_id = te.id OR h.equipo2_id = te.id)
    ), 0);


-- ============================================================
-- 2. _confirmar_resultado_core (singles): acumula games ganados/perdidos
--    Cuerpo identico a 20260718_fix_historial_jugador_ids_confirmar_core.sql,
--    solo se agregan v_games_j1/v_games_j2 y las columnas games_* en el UPDATE final.
-- ============================================================

CREATE OR REPLACE FUNCTION public._confirmar_resultado_core(
  p_partido_id uuid,
  p_automatico boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partido                public.partidos%rowtype;
  v_propuesta              public.torneo_propuestas_partido%rowtype;
  v_set_row                jsonb;
  v_sets                   jsonb;
  v_existing_historial_id  uuid;
  v_sets_j1                integer := 0;
  v_sets_j2                integer := 0;
  v_games_j1               integer := 0;
  v_games_j2               integer := 0;
  v_pts_j1                 integer := 0;
  v_pts_j2                 integer := 0;
  v_winner                 uuid;
  v_resultado               text;
  v_torneo_titulo          text;
BEGIN
  SELECT * INTO v_partido FROM public.partidos p WHERE p.id = p_partido_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'Partido no encontrado.';
  END IF;

  IF COALESCE(v_partido.estado, '') NOT IN ('esperando_validacion', 'finalizado') THEN
    RETURN 'El partido no esta esperando validacion.';
  END IF;

  SELECT * INTO v_propuesta FROM public.torneo_propuestas_partido tpp WHERE tpp.partido_id = p_partido_id FOR UPDATE;

  SELECT h.id INTO v_existing_historial_id FROM public.torneo_partidos_historial h WHERE h.partido_id = p_partido_id LIMIT 1;

  IF v_propuesta.id IS NOT NULL THEN
    v_sets := COALESCE(v_propuesta.sets_json_j1, v_propuesta.sets_json_j2);
  END IF;

  IF v_sets IS NULL AND v_partido.set1_j1 IS NOT NULL AND v_partido.set1_j2 IS NOT NULL AND v_partido.set2_j1 IS NOT NULL AND v_partido.set2_j2 IS NOT NULL THEN
    v_sets := jsonb_build_array(
      jsonb_build_object('p1', v_partido.set1_j1, 'p2', v_partido.set1_j2),
      jsonb_build_object('p1', v_partido.set2_j1, 'p2', v_partido.set2_j2),
      jsonb_build_object('p1', COALESCE(v_partido.set3_j1, 0), 'p2', COALESCE(v_partido.set3_j2, 0))
    );
  END IF;

  IF v_sets IS NULL THEN
    RETURN 'No hay un resultado propuesto para confirmar.';
  END IF;

  FOR v_set_row IN SELECT value FROM jsonb_array_elements(v_sets)
  LOOP
    v_games_j1 := v_games_j1 + COALESCE((v_set_row->>'p1')::integer, 0);
    v_games_j2 := v_games_j2 + COALESCE((v_set_row->>'p2')::integer, 0);
    IF COALESCE((v_set_row->>'p1')::integer, 0) > COALESCE((v_set_row->>'p2')::integer, 0) THEN
      v_sets_j1 := v_sets_j1 + 1;
    ELSIF COALESCE((v_set_row->>'p2')::integer, 0) > COALESCE((v_set_row->>'p1')::integer, 0) THEN
      v_sets_j2 := v_sets_j2 + 1;
    END IF;
  END LOOP;

  IF v_sets_j1 = v_sets_j2 THEN
    RETURN 'El marcador propuesto no define un ganador valido.';
  END IF;

  -- Puntuación plana: ganar = 3 pts, perder = 1 pt (independiente del marcador de sets)
  IF v_sets_j1 > v_sets_j2 THEN
    v_winner  := v_partido.jugador1_id;
    v_pts_j1  := 3;
    v_pts_j2  := 1;
  ELSE
    v_winner  := v_partido.jugador2_id;
    v_pts_j2  := 3;
    v_pts_j1  := 1;
  END IF;

  v_resultado := FORMAT('%s-%s', v_sets_j1, v_sets_j2);

  SELECT t.titulo INTO v_torneo_titulo FROM public.torneos t WHERE t.id = v_partido.torneo_id::bigint;

  IF v_existing_historial_id IS NULL THEN
    WITH hist AS (
      INSERT INTO public.torneo_partidos_historial (
        partido_id, torneo_id, torneo_titulo, categoria, grupo,
        jugador1_id, jugador2_id, ganador_id,
        jugador1_perfil_id, jugador2_perfil_id, ganador_perfil_id,
        sets_json, sets_jugador1, sets_jugador2, puntos_jugador1, puntos_jugador2,
        external_match_key, cargado_por_perfil_id, cargado_en,
        stage_name, ronda
      ) VALUES (
        v_partido.id,
        COALESCE(v_partido.torneo_id, 0)::integer,
        v_torneo_titulo,
        COALESCE(v_partido.categoria, ''),
        COALESCE(v_partido.grupo, ''),
        v_partido.jugador1_id,
        v_partido.jugador2_id,
        v_winner,
        v_partido.jugador1_id,
        v_partido.jugador2_id,
        v_winner,
        v_sets,
        v_sets_j1,
        v_sets_j2,
        v_pts_j1,
        v_pts_j2,
        v_propuesta.match_pair_key,
        v_propuesta.ultimo_cargado_por,
        now(),
        v_partido.stage_name,
        v_partido.ronda
      )
      RETURNING id
    )
    SELECT id INTO v_existing_historial_id FROM hist;
  END IF;

  UPDATE public.torneo_propuestas_partido
  SET estado = 'confirmado', debe_confirmar_por = NULL, updated_at = now(),
      confirmado_automaticamente = p_automatico
  WHERE id = v_propuesta.id;

  UPDATE public.partidos
  SET estado      = 'finalizado',
      resultado   = v_resultado,
      ganador_id  = v_winner,
      sets_jugador1 = v_sets_j1,
      sets_jugador2 = v_sets_j2,
      confirmado_automaticamente = p_automatico
  WHERE id = p_partido_id;

  IF v_partido.torneo_id IS NOT NULL AND COALESCE(v_partido.grupo, '') <> '' THEN
    UPDATE public.torneo_jugadores tj
    SET
      puntos = COALESCE(tj.puntos, 0) + CASE
        WHEN tj.perfil_id = v_partido.jugador1_id THEN v_pts_j1
        WHEN tj.perfil_id = v_partido.jugador2_id THEN v_pts_j2
        ELSE 0
      END,
      sets_ganados = COALESCE(tj.sets_ganados, 0) + CASE
        WHEN tj.perfil_id = v_partido.jugador1_id THEN v_sets_j1
        WHEN tj.perfil_id = v_partido.jugador2_id THEN v_sets_j2
        ELSE 0
      END,
      sets_perdidos = COALESCE(tj.sets_perdidos, 0) + CASE
        WHEN tj.perfil_id = v_partido.jugador1_id THEN v_sets_j2
        WHEN tj.perfil_id = v_partido.jugador2_id THEN v_sets_j1
        ELSE 0
      END,
      games_ganados = COALESCE(tj.games_ganados, 0) + CASE
        WHEN tj.perfil_id = v_partido.jugador1_id THEN v_games_j1
        WHEN tj.perfil_id = v_partido.jugador2_id THEN v_games_j2
        ELSE 0
      END,
      games_perdidos = COALESCE(tj.games_perdidos, 0) + CASE
        WHEN tj.perfil_id = v_partido.jugador1_id THEN v_games_j2
        WHEN tj.perfil_id = v_partido.jugador2_id THEN v_games_j1
        ELSE 0
      END,
      partidos_jugados = COALESCE(tj.partidos_jugados, 0) + CASE
        WHEN tj.perfil_id IN (v_partido.jugador1_id, v_partido.jugador2_id) THEN 1
        ELSE 0
      END
    WHERE tj.torneo_id = v_partido.torneo_id
      AND tj.categoria = v_partido.categoria
      AND tj.grupo     = v_partido.grupo
      AND tj.perfil_id IN (v_partido.jugador1_id, v_partido.jugador2_id);
  END IF;

  RETURN 'OK_CONFIRMADO';
END;
$$;


-- ============================================================
-- 3. _confirmar_resultado_equipo_core (dobles): acumula games ganados/perdidos
--    Cuerpo identico a 20260721_dobles_tournament_support.sql, solo se agregan
--    v_games_j1/v_games_j2 y las columnas games_* en el UPDATE final.
-- ============================================================

CREATE OR REPLACE FUNCTION public._confirmar_resultado_equipo_core(
  p_partido_id uuid,
  p_automatico boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partido public.partidos%rowtype;
  v_propuesta public.torneo_propuestas_partido%rowtype;
  v_set_row jsonb;
  v_sets jsonb;
  v_existing_historial_id uuid;
  v_sets_j1 integer := 0;
  v_sets_j2 integer := 0;
  v_games_j1 integer := 0;
  v_games_j2 integer := 0;
  v_pts_j1 integer := 0;
  v_pts_j2 integer := 0;
  v_winner_equipo uuid;
  v_resultado text;
  v_torneo_titulo text;
  v_equipo1 public.torneo_equipos%rowtype;
  v_equipo2 public.torneo_equipos%rowtype;
  v_ganador_perfil uuid;
BEGIN
  SELECT * INTO v_partido FROM public.partidos p WHERE p.id = p_partido_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'Partido no encontrado.';
  END IF;

  IF COALESCE(v_partido.estado, '') NOT IN ('esperando_validacion', 'finalizado') THEN
    RETURN 'El partido no esta esperando validacion.';
  END IF;

  IF v_partido.equipo1_id IS NULL OR v_partido.equipo2_id IS NULL THEN
    RETURN 'Este partido no tiene equipos de dobles asignados.';
  END IF;

  SELECT * INTO v_propuesta FROM public.torneo_propuestas_partido tpp WHERE tpp.partido_id = p_partido_id FOR UPDATE;

  SELECT h.id INTO v_existing_historial_id FROM public.torneo_partidos_historial h WHERE h.partido_id = p_partido_id LIMIT 1;

  IF v_propuesta.id IS NOT NULL THEN
    v_sets := COALESCE(v_propuesta.sets_json_j1, v_propuesta.sets_json_j2);
  END IF;

  IF v_sets IS NULL AND v_partido.set1_j1 IS NOT NULL AND v_partido.set1_j2 IS NOT NULL AND v_partido.set2_j1 IS NOT NULL AND v_partido.set2_j2 IS NOT NULL THEN
    v_sets := jsonb_build_array(
      jsonb_build_object('p1', v_partido.set1_j1, 'p2', v_partido.set1_j2),
      jsonb_build_object('p1', v_partido.set2_j1, 'p2', v_partido.set2_j2),
      jsonb_build_object('p1', COALESCE(v_partido.set3_j1, 0), 'p2', COALESCE(v_partido.set3_j2, 0))
    );
  END IF;

  IF v_sets IS NULL THEN
    RETURN 'No hay un resultado propuesto para confirmar.';
  END IF;

  FOR v_set_row IN SELECT value FROM jsonb_array_elements(v_sets)
  LOOP
    v_games_j1 := v_games_j1 + COALESCE((v_set_row->>'p1')::integer, 0);
    v_games_j2 := v_games_j2 + COALESCE((v_set_row->>'p2')::integer, 0);
    IF COALESCE((v_set_row->>'p1')::integer, 0) > COALESCE((v_set_row->>'p2')::integer, 0) THEN
      v_sets_j1 := v_sets_j1 + 1;
    ELSIF COALESCE((v_set_row->>'p2')::integer, 0) > COALESCE((v_set_row->>'p1')::integer, 0) THEN
      v_sets_j2 := v_sets_j2 + 1;
    END IF;
  END LOOP;

  IF v_sets_j1 = v_sets_j2 THEN
    RETURN 'El marcador propuesto no define un ganador valido.';
  END IF;

  IF v_sets_j1 > v_sets_j2 THEN
    v_winner_equipo := v_partido.equipo1_id;
    v_pts_j1 := 3;
    v_pts_j2 := 1;
  ELSE
    v_winner_equipo := v_partido.equipo2_id;
    v_pts_j2 := 3;
    v_pts_j1 := 1;
  END IF;

  v_resultado := FORMAT('%s-%s', v_sets_j1, v_sets_j2);

  SELECT t.titulo INTO v_torneo_titulo FROM public.torneos t WHERE t.id = v_partido.torneo_id::bigint;
  SELECT * INTO v_equipo1 FROM public.torneo_equipos WHERE id = v_partido.equipo1_id;
  SELECT * INTO v_equipo2 FROM public.torneo_equipos WHERE id = v_partido.equipo2_id;

  v_ganador_perfil := CASE WHEN v_winner_equipo = v_partido.equipo1_id THEN v_equipo1.jugador1_id ELSE v_equipo2.jugador1_id END;

  IF v_existing_historial_id IS NULL THEN
    WITH hist AS (
      INSERT INTO public.torneo_partidos_historial (
        partido_id, torneo_id, torneo_titulo, categoria, grupo,
        jugador1_id, jugador2_id, ganador_id,
        jugador1_perfil_id, jugador2_perfil_id, ganador_perfil_id,
        equipo1_id, equipo2_id, equipo_ganador_id,
        sets_json, sets_jugador1, sets_jugador2, puntos_jugador1, puntos_jugador2,
        external_match_key, cargado_por_perfil_id, cargado_en,
        stage_name, ronda
      ) VALUES (
        v_partido.id,
        COALESCE(v_partido.torneo_id, 0)::integer,
        v_torneo_titulo,
        COALESCE(v_partido.categoria, ''),
        COALESCE(v_partido.grupo, ''),
        v_equipo1.jugador1_id,
        v_equipo2.jugador1_id,
        v_ganador_perfil,
        v_equipo1.jugador1_id,
        v_equipo2.jugador1_id,
        v_ganador_perfil,
        v_partido.equipo1_id, v_partido.equipo2_id, v_winner_equipo,
        v_sets, v_sets_j1, v_sets_j2, v_pts_j1, v_pts_j2,
        v_propuesta.match_pair_key, v_propuesta.ultimo_cargado_por, now(),
        v_partido.stage_name, v_partido.ronda
      )
      RETURNING id
    )
    SELECT id INTO v_existing_historial_id FROM hist;
  END IF;

  UPDATE public.torneo_propuestas_partido
  SET estado = 'confirmado', debe_confirmar_equipo_id = NULL, updated_at = now(),
      confirmado_automaticamente = p_automatico
  WHERE id = v_propuesta.id;

  UPDATE public.partidos
  SET estado = 'finalizado',
      resultado = v_resultado,
      equipo_ganador_id = v_winner_equipo,
      sets_jugador1 = v_sets_j1,
      sets_jugador2 = v_sets_j2,
      confirmado_automaticamente = p_automatico
  WHERE id = p_partido_id;

  IF v_partido.torneo_id IS NOT NULL AND COALESCE(v_partido.grupo, '') <> '' THEN
    UPDATE public.torneo_equipos te
    SET
      puntos = COALESCE(te.puntos, 0) + CASE
        WHEN te.id = v_partido.equipo1_id THEN v_pts_j1
        WHEN te.id = v_partido.equipo2_id THEN v_pts_j2
        ELSE 0
      END,
      sets_ganados = COALESCE(te.sets_ganados, 0) + CASE
        WHEN te.id = v_partido.equipo1_id THEN v_sets_j1
        WHEN te.id = v_partido.equipo2_id THEN v_sets_j2
        ELSE 0
      END,
      sets_perdidos = COALESCE(te.sets_perdidos, 0) + CASE
        WHEN te.id = v_partido.equipo1_id THEN v_sets_j2
        WHEN te.id = v_partido.equipo2_id THEN v_sets_j1
        ELSE 0
      END,
      games_ganados = COALESCE(te.games_ganados, 0) + CASE
        WHEN te.id = v_partido.equipo1_id THEN v_games_j1
        WHEN te.id = v_partido.equipo2_id THEN v_games_j2
        ELSE 0
      END,
      games_perdidos = COALESCE(te.games_perdidos, 0) + CASE
        WHEN te.id = v_partido.equipo1_id THEN v_games_j2
        WHEN te.id = v_partido.equipo2_id THEN v_games_j1
        ELSE 0
      END,
      partidos_jugados = COALESCE(te.partidos_jugados, 0) + CASE
        WHEN te.id IN (v_partido.equipo1_id, v_partido.equipo2_id) THEN 1
        ELSE 0
      END,
      updated_at = now()
    WHERE te.torneo_id = v_partido.torneo_id
      AND te.categoria = v_partido.categoria
      AND te.grupo = v_partido.grupo
      AND te.id IN (v_partido.equipo1_id, v_partido.equipo2_id);
  END IF;

  RETURN 'OK_CONFIRMADO';
END;
$$;


-- ============================================================
-- 4. jugador_clasifica_en_fase_grupos (singles): ranking correcto
--    Cuerpo identico a 20260603_fix_estado_clasificacion_fase_grupos.sql, solo cambia
--    la CTE "ranking" (ahora expandida en base/h2h/ranking).
-- ============================================================

CREATE OR REPLACE FUNCTION public.jugador_clasifica_en_fase_grupos(
  p_torneo_id bigint,
  p_categoria text,
  p_perfil_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categoria                 text;
  v_grupo_base                text;
  v_grupo_base_id             uuid;
  v_clasificados_por_grupo    integer := 2;
  v_incluir_mejores_terceros  boolean := false;
  v_cantidad_mejores_terceros integer := 0;
  v_clasifica                 boolean := false;
BEGIN
  v_categoria := nullif(trim(coalesce(p_categoria, '')), '');
  IF v_categoria IS NULL THEN
    SELECT t.subtitulo INTO v_categoria FROM public.torneos t WHERE t.id = p_torneo_id LIMIT 1;
  END IF;
  v_categoria := coalesce(v_categoria, 'General');

  SELECT
    greatest(1, coalesce(tc.clasificados_por_grupo, 2)),
    coalesce(tc.incluir_mejores_terceros, false),
    coalesce(tc.cantidad_mejores_terceros, 0),
    tc.grupo_base_id
  INTO
    v_clasificados_por_grupo,
    v_incluir_mejores_terceros,
    v_cantidad_mejores_terceros,
    v_grupo_base_id
  FROM public.torneo_configuracion tc
  WHERE tc.torneo_id = p_torneo_id;

  SELECT grupo_codigo
  INTO v_grupo_base
  FROM public.resolver_grupo_base_torneo(p_torneo_id, v_categoria, NULL, v_grupo_base_id);

  IF v_grupo_base IS NULL THEN
    RETURN false;
  END IF;

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
    SELECT perfil_id
    FROM ranking
    WHERE pos_grupo <= v_clasificados_por_grupo
  ),
  terceros_rankeados AS (
    SELECT perfil_id,
           row_number() OVER (
             ORDER BY puntos DESC, sets_ganados DESC, partidos_jugados ASC, grupo ASC, perfil_id ASC
           ) AS rank_tercero
    FROM ranking
    WHERE pos_grupo = v_clasificados_por_grupo + 1
  ),
  mejores_terceros AS (
    SELECT perfil_id
    FROM terceros_rankeados
    WHERE v_incluir_mejores_terceros
      AND rank_tercero <= v_cantidad_mejores_terceros
  )
  SELECT EXISTS (
    SELECT 1 FROM clasificados      WHERE perfil_id = p_perfil_id
    UNION ALL
    SELECT 1 FROM mejores_terceros  WHERE perfil_id = p_perfil_id
  ) INTO v_clasifica;

  RETURN coalesce(v_clasifica, false);
END;
$$;


-- ============================================================
-- 5. generar_playoffs_eliminacion_directa_torneo (singles): ranking correcto
--    Cuerpo identico a 20260520_mejores_terceros_playoffs.sql, solo cambia
--    la CTE "ranking" (ahora expandida en base/h2h/ranking).
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


-- ============================================================
-- 6. equipo_clasifica_en_fase_grupos (dobles): ranking correcto
--    Cuerpo identico a 20260721_dobles_tournament_support.sql, solo cambia
--    la CTE "ranking" (ahora expandida en base/h2h/ranking).
-- ============================================================

CREATE OR REPLACE FUNCTION public.equipo_clasifica_en_fase_grupos(
  p_torneo_id bigint,
  p_categoria text,
  p_equipo_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_categoria text;
  v_grupo_base text;
  v_grupo_base_id uuid;
  v_clasificados_por_grupo integer := 2;
  v_incluir_mejores_terceros boolean := false;
  v_cantidad_mejores_terceros integer := 0;
  v_clasifica boolean := false;
BEGIN
  v_categoria := NULLIF(TRIM(COALESCE(p_categoria, '')), '');
  IF v_categoria IS NULL THEN
    SELECT t.subtitulo INTO v_categoria FROM public.torneos t WHERE t.id = p_torneo_id LIMIT 1;
  END IF;
  v_categoria := COALESCE(v_categoria, 'General');

  SELECT
    GREATEST(1, COALESCE(tc.clasificados_por_grupo, 2)),
    COALESCE(tc.incluir_mejores_terceros, false),
    COALESCE(tc.cantidad_mejores_terceros, 0),
    tc.grupo_base_id
  INTO
    v_clasificados_por_grupo, v_incluir_mejores_terceros, v_cantidad_mejores_terceros, v_grupo_base_id
  FROM public.torneo_configuracion tc
  WHERE tc.torneo_id = p_torneo_id;

  SELECT grupo_codigo
  INTO v_grupo_base
  FROM public.resolver_grupo_base_torneo(p_torneo_id, v_categoria, NULL, v_grupo_base_id);

  IF v_grupo_base IS NULL THEN
    RETURN false;
  END IF;

  WITH base AS (
    SELECT
      te.grupo,
      te.id,
      COALESCE(te.puntos, 0)                                         AS puntos,
      COALESCE(te.sets_ganados, 0)                                   AS sets_ganados,
      COALESCE(te.sets_ganados, 0) - COALESCE(te.sets_perdidos, 0)   AS diff_sets,
      COALESCE(te.games_ganados, 0) - COALESCE(te.games_perdidos, 0) AS diff_games,
      COALESCE(te.partidos_jugados, 0)                               AS partidos_jugados
    FROM public.torneo_equipos te
    WHERE te.torneo_id = p_torneo_id
      AND te.categoria = v_categoria
      AND (te.grupo = v_grupo_base OR starts_with(te.grupo, v_grupo_base || '_G'))
  ),
  h2h AS (
    SELECT
      b.id,
      (
        SELECT count(*)
        FROM public.torneo_partidos_historial h
        WHERE h.torneo_id = p_torneo_id
          AND h.categoria = v_categoria
          AND h.equipo_ganador_id = b.id
          AND EXISTS (
            SELECT 1 FROM base riv
            WHERE riv.grupo = b.grupo
              AND riv.id <> b.id
              AND riv.puntos = b.puntos
              AND riv.diff_sets = b.diff_sets
              AND riv.sets_ganados = b.sets_ganados
              AND (h.equipo1_id = riv.id OR h.equipo2_id = riv.id)
          )
      ) AS h2h_wins
    FROM base b
  ),
  ranking AS (
    SELECT
      b.grupo,
      b.id,
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
                 b.id ASC
      ) AS pos_grupo
    FROM base b
    JOIN h2h hh ON hh.id = b.id
  ),
  clasificados AS (
    SELECT id FROM ranking WHERE pos_grupo <= v_clasificados_por_grupo
  ),
  terceros_rankeados AS (
    SELECT id,
      row_number() OVER (
        ORDER BY puntos DESC, sets_ganados DESC, partidos_jugados ASC, grupo ASC, id ASC
      ) AS rank_tercero
    FROM ranking
    WHERE pos_grupo = v_clasificados_por_grupo + 1
  ),
  mejores_terceros AS (
    SELECT id FROM terceros_rankeados
    WHERE v_incluir_mejores_terceros AND rank_tercero <= v_cantidad_mejores_terceros
  )
  SELECT EXISTS (
    SELECT 1 FROM clasificados WHERE id = p_equipo_id
    UNION ALL
    SELECT 1 FROM mejores_terceros WHERE id = p_equipo_id
  ) INTO v_clasifica;

  RETURN COALESCE(v_clasifica, false);
END;
$$;


-- ============================================================
-- 7. generar_playoffs_eliminacion_directa_equipos_torneo (dobles): ranking correcto
--    Cuerpo identico a 20260721_dobles_tournament_support.sql, solo cambia
--    la CTE "ranking" (ahora expandida en base/h2h/ranking).
-- ============================================================

CREATE OR REPLACE FUNCTION public.generar_playoffs_eliminacion_directa_equipos_torneo(
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_categoria text;
  v_grupo_base text;
  v_grupo_base_id uuid;
  v_modalidad text;
  v_clasificados_por_grupo integer := 2;
  v_habilitar_playoffs boolean := false;
  v_incluir_mejores_terceros boolean := false;
  v_cantidad_mejores_terceros integer := 0;
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
  v_e1 uuid;
  v_e2 uuid;
  v_grupos_no_finalizados integer;
  i integer;
BEGIN
  v_categoria := NULLIF(TRIM(COALESCE(p_categoria, '')), '');
  IF v_categoria IS NULL THEN
    SELECT t.subtitulo INTO v_categoria FROM public.torneos t WHERE t.id = p_torneo_id LIMIT 1;
  END IF;
  v_categoria := COALESCE(v_categoria, 'General');

  SELECT
    GREATEST(1, COALESCE(tc.clasificados_por_grupo, 2)),
    COALESCE(tc.crear_playoffs_eliminacion_directa, false),
    COALESCE(tc.incluir_mejores_terceros, false),
    COALESCE(tc.cantidad_mejores_terceros, 0),
    tc.grupo_base_id,
    tc.modalidad
  INTO
    v_clasificados_por_grupo, v_habilitar_playoffs, v_incluir_mejores_terceros,
    v_cantidad_mejores_terceros, v_grupo_base_id, v_modalidad
  FROM public.torneo_configuracion tc
  WHERE tc.torneo_id = p_torneo_id;

  IF v_modalidad IS DISTINCT FROM 'dobles' THEN
    RAISE EXCEPTION 'Este torneo no esta configurado como modalidad dobles.';
  END IF;

  SELECT grupo_id, grupo_codigo
  INTO v_grupo_base_id, v_grupo_base
  FROM public.resolver_grupo_base_torneo(p_torneo_id, v_categoria, p_grupo_base, v_grupo_base_id);

  IF NOT v_habilitar_playoffs THEN
    RAISE EXCEPTION 'Playoffs por eliminacion directa no habilitado en torneo_configuracion para torneo %.', p_torneo_id;
  END IF;

  SELECT COUNT(*) INTO v_grupos_no_finalizados
  FROM public.torneo_estado
  WHERE torneo_id = p_torneo_id
    AND categoria = v_categoria
    AND grupo NOT LIKE '%_PLAYOFFS'
    AND TRIM(estado) <> 'FINALIZADO';

  IF v_grupos_no_finalizados > 0 THEN
    RAISE EXCEPTION 'No se pueden generar playoffs: % grupo(s) aun no han finalizado todos sus partidos.', v_grupos_no_finalizados;
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

  WITH base AS (
    SELECT
      te.grupo,
      te.id,
      COALESCE(te.puntos, 0)                                         AS puntos,
      COALESCE(te.sets_ganados, 0)                                   AS sets_ganados,
      COALESCE(te.sets_ganados, 0) - COALESCE(te.sets_perdidos, 0)   AS diff_sets,
      COALESCE(te.games_ganados, 0) - COALESCE(te.games_perdidos, 0) AS diff_games,
      COALESCE(te.partidos_jugados, 0)                               AS partidos_jugados
    FROM public.torneo_equipos te
    WHERE te.torneo_id = p_torneo_id
      AND te.categoria = v_categoria
      AND (te.grupo = v_grupo_base OR starts_with(te.grupo, v_grupo_base || '_G'))
  ),
  h2h AS (
    SELECT
      b.id,
      (
        SELECT count(*)
        FROM public.torneo_partidos_historial h
        WHERE h.torneo_id = p_torneo_id
          AND h.categoria = v_categoria
          AND h.equipo_ganador_id = b.id
          AND EXISTS (
            SELECT 1 FROM base riv
            WHERE riv.grupo = b.grupo
              AND riv.id <> b.id
              AND riv.puntos = b.puntos
              AND riv.diff_sets = b.diff_sets
              AND riv.sets_ganados = b.sets_ganados
              AND (h.equipo1_id = riv.id OR h.equipo2_id = riv.id)
          )
      ) AS h2h_wins
    FROM base b
  ),
  ranking AS (
    SELECT
      b.grupo,
      b.id,
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
                 b.id ASC
      ) AS pos_grupo
    FROM base b
    JOIN h2h hh ON hh.id = b.id
  ),
  clasificados AS (
    SELECT grupo, id, puntos, sets_ganados, partidos_jugados, pos_grupo, false AS es_mejor_tercero
    FROM ranking
    WHERE pos_grupo <= v_clasificados_por_grupo
  ),
  terceros_rankeados AS (
    SELECT grupo, id, puntos, sets_ganados, partidos_jugados, pos_grupo,
      row_number() OVER (
        ORDER BY puntos DESC, sets_ganados DESC, partidos_jugados ASC, grupo ASC, id ASC
      ) AS rank_tercero
    FROM ranking
    WHERE pos_grupo = v_clasificados_por_grupo + 1
  ),
  mejores_terceros AS (
    SELECT grupo, id, puntos, sets_ganados, partidos_jugados, pos_grupo, true AS es_mejor_tercero
    FROM terceros_rankeados
    WHERE v_incluir_mejores_terceros AND rank_tercero <= v_cantidad_mejores_terceros
  ),
  todos AS (
    SELECT * FROM clasificados
    UNION ALL
    SELECT * FROM mejores_terceros
  ),
  seeded AS (
    SELECT *,
      row_number() OVER (
        ORDER BY es_mejor_tercero ASC, pos_grupo ASC, puntos DESC,
                 sets_ganados DESC, partidos_jugados ASC, grupo ASC, id ASC
      ) AS seed
    FROM todos
  )
  SELECT
    array_agg(s.id ORDER BY s.seed),
    count(*)::integer,
    count(DISTINCT s.grupo)::integer
  INTO v_seeded, v_total, v_grupos_fuente
  FROM seeded s;

  IF v_total < 2 THEN
    RAISE EXCEPTION 'No hay suficientes equipos clasificados para playoffs (%).', v_total;
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
        v_e1 := v_seeded[2 * v_pos - 1];
        v_e2 := v_seeded[v_total - (2 * v_pos - 1) + 1];
      ELSE
        v_e1 := NULL;
        v_e2 := NULL;
      END IF;
      INSERT INTO public.partidos (
        id, torneo_id, categoria, grupo, jornada,
        equipo1_id, equipo2_id, estado,
        ronda, posicion_bracket, bracket_tipo
      ) VALUES (
        v_match_ids[v_flat_idx], p_torneo_id, v_categoria, v_grupo_playoffs, v_ronda,
        v_e1, v_e2, 'programado', v_ronda, v_pos, 'eliminacion_directa'
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

  UPDATE public.partidos
  SET stage_name = public.calculate_stage_name(p_torneo_id, ronda)
  WHERE torneo_id = p_torneo_id AND categoria = v_categoria
    AND grupo = v_grupo_playoffs AND bracket_tipo = 'eliminacion_directa';

  RETURN QUERY SELECT v_categoria, v_grupo_playoffs, v_grupos_fuente, v_total, v_partidos;
END;
$$;
