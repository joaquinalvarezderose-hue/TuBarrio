-- Migration: Doble W.O. -- cuando NINGUNO de los dos lados de un partido puede
--            jugar (no solo uno), hoy no hay forma de marcarlo: admin_marcar_wo /
--            admin_marcar_wo_equipo obligan a elegir un ganador, lo cual es
--            injusto si en realidad los dos faltaron.
-- Fecha: 2026-08-24
--
-- Reglas acordadas con el usuario:
--  1. Solo aplica a partidos de fase de grupos (bracket_tipo IS NULL). En
--     eliminacion directa alguien tiene que avanzar de ronda, asi que el doble
--     W.O. se rechaza ahi -- se sigue usando W.O. simple o forzar resultado.
--  2. Ambos lados quedan 0-0 en sets y puntos (no se favorece ni perjudica a
--     nadie mas alla de contar el partido como jugado, para que no quede
--     pendiente para siempre).
--
-- Espejo de admin_marcar_wo / admin_marcar_wo_equipo (20260727_10 /
-- 20260727_08), pero sin p_ganador_id: ganador_id queda NULL, es_wo = true,
-- resultado = 'Doble W.O.'.

-- ============================================================
-- 1. admin_marcar_doble_wo (singles)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_marcar_doble_wo(p_partido_id uuid, p_motivo text DEFAULT NULL)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_partido        public.partidos%ROWTYPE;
  v_titulo         text;
  v_existing       record;
  v_old_pts_j1     integer := 0;
  v_old_pts_j2     integer := 0;
  v_old_sets_j1    integer := 0;
  v_old_sets_j2    integer := 0;
  v_ya_registrado  boolean := false;
BEGIN
  SELECT * INTO v_partido
  FROM public.partidos
  WHERE id = p_partido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partido no encontrado: %', p_partido_id;
  END IF;

  IF NOT public.puede_administrar_torneo(v_partido.torneo_id) THEN
    RAISE EXCEPTION 'Permiso denegado: no administras este torneo.';
  END IF;

  IF v_partido.jugador1_id IS NULL OR v_partido.jugador2_id IS NULL THEN
    RAISE EXCEPTION 'El partido no tiene ambos jugadores asignados.';
  END IF;

  IF v_partido.bracket_tipo IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede marcar doble W.O. en un partido de eliminacion directa: alguien debe avanzar de ronda. Use W.O. simple o forzar resultado.';
  END IF;

  -- 1. Resolver cualquier propuesta activa
  UPDATE public.torneo_propuestas_partido
  SET estado = 'confirmado', debe_confirmar_por = NULL, updated_at = now()
  WHERE partido_id = p_partido_id
    AND estado IN ('discrepancia', 'pendiente');

  -- 2. Buscar fila previa en historial (soporte para sobrescribir un resultado ya cargado)
  SELECT id, puntos_jugador1, puntos_jugador2, sets_jugador1, sets_jugador2
  INTO v_existing
  FROM public.torneo_partidos_historial
  WHERE partido_id = p_partido_id
  LIMIT 1;

  v_ya_registrado := FOUND;
  IF v_ya_registrado THEN
    v_old_pts_j1  := COALESCE(v_existing.puntos_jugador1, 0);
    v_old_pts_j2  := COALESCE(v_existing.puntos_jugador2, 0);
    v_old_sets_j1 := COALESCE(v_existing.sets_jugador1, 0);
    v_old_sets_j2 := COALESCE(v_existing.sets_jugador2, 0);
  END IF;

  SELECT titulo INTO v_titulo FROM public.torneos WHERE id = v_partido.torneo_id::bigint;

  IF v_ya_registrado THEN
    UPDATE public.torneo_partidos_historial
    SET jugador1_perfil_id = v_partido.jugador1_id,
        jugador2_perfil_id = v_partido.jugador2_id,
        ganador_perfil_id  = NULL,
        jugador1_id        = v_partido.jugador1_id,
        jugador2_id        = v_partido.jugador2_id,
        ganador_id         = NULL,
        sets_json          = NULL,
        sets_jugador1      = 0,
        sets_jugador2      = 0,
        puntos_jugador1    = 0,
        puntos_jugador2    = 0,
        es_wo              = true,
        cargado_por_perfil_id = auth.uid(),
        registrado_por     = auth.uid(),
        cargado_en         = now()
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO public.torneo_partidos_historial (
      partido_id, torneo_id, torneo_titulo, categoria, grupo,
      jugador1_id, jugador2_id, ganador_id,
      jugador1_perfil_id, jugador2_perfil_id, ganador_perfil_id,
      sets_json, sets_jugador1, sets_jugador2,
      puntos_jugador1, puntos_jugador2, es_wo,
      cargado_por_perfil_id, registrado_por, cargado_en,
      stage_name, ronda
    ) VALUES (
      v_partido.id,
      v_partido.torneo_id::integer,
      v_titulo,
      COALESCE(v_partido.categoria, ''),
      COALESCE(v_partido.grupo, ''),
      v_partido.jugador1_id,
      v_partido.jugador2_id,
      NULL,
      v_partido.jugador1_id,
      v_partido.jugador2_id,
      NULL,
      NULL,
      0, 0,
      0, 0, true,
      auth.uid(), auth.uid(), now(),
      v_partido.stage_name,
      v_partido.ronda
    );
  END IF;

  -- 3. Actualizar el partido. No dispara promocion de bracket (ganador_id
  --    queda NULL y bracket_tipo ya se rechazo arriba).
  UPDATE public.partidos
  SET estado        = 'finalizado',
      resultado     = 'Doble W.O.',
      ganador_id    = NULL,
      es_wo         = true,
      sets_jugador1 = 0,
      sets_jugador2 = 0,
      set1_j1 = NULL, set1_j2 = NULL,
      set2_j1 = NULL, set2_j2 = NULL,
      set3_j1 = NULL, set3_j2 = NULL,
      updated_at    = now()
  WHERE id = p_partido_id;

  -- 4. Actualizar torneo_jugadores: delta de puntos/sets es 0, pero cuenta
  --    como partido jugado (asi no queda pendiente para siempre).
  IF COALESCE(v_partido.grupo, '') <> '' AND v_partido.bracket_tipo IS NULL THEN
    UPDATE public.torneo_jugadores tj
    SET
      puntos = COALESCE(tj.puntos, 0)
        + CASE WHEN tj.perfil_id = v_partido.jugador1_id THEN 0 - v_old_pts_j1
               WHEN tj.perfil_id = v_partido.jugador2_id THEN 0 - v_old_pts_j2
               ELSE 0 END,
      sets_ganados = COALESCE(tj.sets_ganados, 0)
        + CASE WHEN tj.perfil_id = v_partido.jugador1_id THEN 0 - v_old_sets_j1
               WHEN tj.perfil_id = v_partido.jugador2_id THEN 0 - v_old_sets_j2
               ELSE 0 END,
      sets_perdidos = COALESCE(tj.sets_perdidos, 0)
        + CASE WHEN tj.perfil_id = v_partido.jugador1_id THEN 0 - v_old_sets_j2
               WHEN tj.perfil_id = v_partido.jugador2_id THEN 0 - v_old_sets_j1
               ELSE 0 END,
      partidos_jugados = COALESCE(tj.partidos_jugados, 0)
        + CASE WHEN NOT v_ya_registrado AND tj.perfil_id IN (v_partido.jugador1_id, v_partido.jugador2_id) THEN 1
               ELSE 0 END
    WHERE tj.torneo_id = v_partido.torneo_id
      AND tj.categoria = v_partido.categoria
      AND tj.grupo     = v_partido.grupo
      AND tj.perfil_id IN (v_partido.jugador1_id, v_partido.jugador2_id);
  END IF;

  RETURN FORMAT(
    'OK: Partido %s marcado como Doble W.O. (nadie suma puntos). Historial: %s. Motivo: %s',
    p_partido_id,
    CASE WHEN v_ya_registrado THEN 'actualizado' ELSE 'insertado' END,
    COALESCE(p_motivo, 'sin motivo')
  );
END;
$function$
;

REVOKE ALL ON FUNCTION public.admin_marcar_doble_wo(uuid, text) FROM anon;

-- ============================================================
-- 2. admin_marcar_doble_wo_equipo (dobles)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_marcar_doble_wo_equipo(p_partido_id uuid, p_motivo text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partido public.partidos%rowtype;
  v_titulo text;
  v_existing record;
  v_old_pts_j1 integer := 0;
  v_old_pts_j2 integer := 0;
  v_old_sets_j1 integer := 0;
  v_old_sets_j2 integer := 0;
  v_ya_registrado boolean := false;
  v_equipo1 public.torneo_equipos%rowtype;
  v_equipo2 public.torneo_equipos%rowtype;
BEGIN
  SELECT * INTO v_partido FROM public.partidos WHERE id = p_partido_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partido no encontrado: %', p_partido_id;
  END IF;

  IF NOT public.puede_administrar_torneo(v_partido.torneo_id) THEN
    RAISE EXCEPTION 'Permiso denegado: no administras este torneo.';
  END IF;

  IF v_partido.equipo1_id IS NULL OR v_partido.equipo2_id IS NULL THEN
    RAISE EXCEPTION 'El partido no tiene ambos equipos asignados.';
  END IF;

  IF v_partido.bracket_tipo IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede marcar doble W.O. en un partido de eliminacion directa: algun equipo debe avanzar de ronda. Use W.O. simple o forzar resultado.';
  END IF;

  SELECT * INTO v_equipo1 FROM public.torneo_equipos WHERE id = v_partido.equipo1_id;
  SELECT * INTO v_equipo2 FROM public.torneo_equipos WHERE id = v_partido.equipo2_id;

  UPDATE public.torneo_propuestas_partido
  SET estado = 'confirmado', debe_confirmar_equipo_id = NULL, updated_at = now()
  WHERE partido_id = p_partido_id
    AND estado IN ('discrepancia', 'pendiente');

  SELECT id, puntos_jugador1, puntos_jugador2, sets_jugador1, sets_jugador2
  INTO v_existing
  FROM public.torneo_partidos_historial
  WHERE partido_id = p_partido_id
  LIMIT 1;

  v_ya_registrado := FOUND;
  IF v_ya_registrado THEN
    v_old_pts_j1 := COALESCE(v_existing.puntos_jugador1, 0);
    v_old_pts_j2 := COALESCE(v_existing.puntos_jugador2, 0);
    v_old_sets_j1 := COALESCE(v_existing.sets_jugador1, 0);
    v_old_sets_j2 := COALESCE(v_existing.sets_jugador2, 0);
  END IF;

  SELECT titulo INTO v_titulo FROM public.torneos WHERE id = v_partido.torneo_id::bigint;

  IF v_ya_registrado THEN
    UPDATE public.torneo_partidos_historial
    SET jugador1_perfil_id = v_equipo1.jugador1_id,
        jugador2_perfil_id = v_equipo2.jugador1_id,
        ganador_perfil_id = NULL,
        jugador1_id = v_equipo1.jugador1_id,
        jugador2_id = v_equipo2.jugador1_id,
        ganador_id = NULL,
        equipo1_id = v_partido.equipo1_id,
        equipo2_id = v_partido.equipo2_id,
        equipo_ganador_id = NULL,
        sets_json = NULL,
        sets_jugador1 = 0,
        sets_jugador2 = 0,
        puntos_jugador1 = 0,
        puntos_jugador2 = 0,
        es_wo = true,
        cargado_por_perfil_id = auth.uid(),
        registrado_por = auth.uid(),
        cargado_en = now()
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO public.torneo_partidos_historial (
      partido_id, torneo_id, torneo_titulo, categoria, grupo,
      jugador1_id, jugador2_id, ganador_id,
      jugador1_perfil_id, jugador2_perfil_id, ganador_perfil_id,
      equipo1_id, equipo2_id, equipo_ganador_id,
      sets_json, sets_jugador1, sets_jugador2,
      puntos_jugador1, puntos_jugador2, es_wo,
      cargado_por_perfil_id, registrado_por, cargado_en,
      stage_name, ronda
    ) VALUES (
      v_partido.id,
      v_partido.torneo_id::integer,
      v_titulo,
      COALESCE(v_partido.categoria, ''),
      COALESCE(v_partido.grupo, ''),
      v_equipo1.jugador1_id,
      v_equipo2.jugador1_id,
      NULL,
      v_equipo1.jugador1_id,
      v_equipo2.jugador1_id,
      NULL,
      v_partido.equipo1_id, v_partido.equipo2_id, NULL,
      NULL, 0, 0,
      0, 0, true,
      auth.uid(), auth.uid(), now(),
      v_partido.stage_name, v_partido.ronda
    );
  END IF;

  UPDATE public.partidos
  SET estado = 'finalizado',
      resultado = 'Doble W.O.',
      equipo_ganador_id = NULL,
      es_wo = true,
      sets_jugador1 = 0,
      sets_jugador2 = 0,
      set1_j1 = NULL, set1_j2 = NULL,
      set2_j1 = NULL, set2_j2 = NULL,
      set3_j1 = NULL, set3_j2 = NULL,
      updated_at = now()
  WHERE id = p_partido_id;

  IF COALESCE(v_partido.grupo, '') <> '' AND v_partido.bracket_tipo IS NULL THEN
    UPDATE public.torneo_equipos te
    SET
      puntos = COALESCE(te.puntos, 0)
        + CASE WHEN te.id = v_partido.equipo1_id THEN 0 - v_old_pts_j1
               WHEN te.id = v_partido.equipo2_id THEN 0 - v_old_pts_j2
               ELSE 0 END,
      sets_ganados = COALESCE(te.sets_ganados, 0)
        + CASE WHEN te.id = v_partido.equipo1_id THEN 0 - v_old_sets_j1
               WHEN te.id = v_partido.equipo2_id THEN 0 - v_old_sets_j2
               ELSE 0 END,
      sets_perdidos = COALESCE(te.sets_perdidos, 0)
        + CASE WHEN te.id = v_partido.equipo1_id THEN 0 - v_old_sets_j2
               WHEN te.id = v_partido.equipo2_id THEN 0 - v_old_sets_j1
               ELSE 0 END,
      partidos_jugados = COALESCE(te.partidos_jugados, 0)
        + CASE WHEN NOT v_ya_registrado AND te.id IN (v_partido.equipo1_id, v_partido.equipo2_id) THEN 1
               ELSE 0 END,
      updated_at = now()
    WHERE te.torneo_id = v_partido.torneo_id
      AND te.categoria = v_partido.categoria
      AND te.grupo = v_partido.grupo
      AND te.id IN (v_partido.equipo1_id, v_partido.equipo2_id);
  END IF;

  RETURN FORMAT(
    'OK: Partido %s marcado como Doble W.O. (ningun equipo suma puntos). Historial: %s. Motivo: %s',
    p_partido_id,
    CASE WHEN v_ya_registrado THEN 'actualizado' ELSE 'insertado' END,
    COALESCE(p_motivo, 'sin motivo')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_marcar_doble_wo_equipo(uuid, text) FROM anon;
