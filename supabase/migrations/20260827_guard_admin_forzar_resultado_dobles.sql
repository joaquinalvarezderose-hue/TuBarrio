-- admin_forzar_resultado_partido nunca tuvo soporte de dobles (a diferencia de sus
-- funciones hermanas admin_marcar_wo/admin_marcar_doble_wo, que SI tienen el guard
-- "IF v_partido.jugador1_id IS NULL OR v_partido.jugador2_id IS NULL THEN RAISE
-- EXCEPTION"). Sin ese guard, si esta funcion se llamara alguna vez sobre un partido
-- de dobles (jugador1_id/jugador2_id siempre NULL ahi), el chequeo
-- "p_ganador_id NOT IN (v_partido.jugador1_id, v_partido.jugador2_id)" evalua a NULL
-- (no TRUE) en vez de disparar la excepcion, y la funcion seguia de largo: siempre le
-- daba los 3 puntos al "jugador2" (porque p_ganador_id = v_partido.jugador1_id tambien
-- es NULL), nunca actualizaba torneo_equipos (solo torneo_jugadores), y el historial
-- quedaba con jugador1_id/jugador2_id NULL y sin equipo1_id/equipo2_id/equipo_ganador_id.
-- Hoy no es explotable desde la UI (AdminPartidos.tsx calcula el ganador a partir de
-- jugador1_id/jugador2_id, que da NULL en dobles y bloquea el boton en el cliente),
-- pero la funcion en si no tenia ninguna proteccion server-side: cualquier admin
-- podria invocarla directo via RPC sobre un partido de dobles y corromper el resultado
-- en silencio. Se agrega el mismo guard que ya usan admin_marcar_wo/admin_marcar_doble_wo.
-- Todavia no existe un "admin_forzar_resultado_partido_equipo" (a diferencia de
-- admin_marcar_wo_equipo/admin_marcar_doble_wo_equipo) -- pendiente si se necesita
-- forzar resultados en partidos de dobles.
CREATE OR REPLACE FUNCTION public.admin_forzar_resultado_partido(p_partido_id uuid, p_ganador_id uuid, p_sets_json jsonb, p_motivo text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_partido   public.partidos%ROWTYPE;
  v_set_row   jsonb;
  v_sets_j1   integer := 0;
  v_sets_j2   integer := 0;
  v_pts_j1    integer := 0;
  v_pts_j2    integer := 0;
  v_resultado text;
  v_titulo    text;
  v_set1_j1   integer; v_set1_j2 integer;
  v_set2_j1   integer; v_set2_j2 integer;
  v_set3_j1   integer; v_set3_j2 integer;
  v_idx       integer := 0;
  v_existing       record;
  v_ya_registrado  boolean := false;
  v_old_pts_j1     integer := 0;
  v_old_pts_j2     integer := 0;
  v_old_sets_j1    integer := 0;
  v_old_sets_j2    integer := 0;
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
    RAISE EXCEPTION 'Este partido es de dobles (usa equipos, no jugadores individuales). "Forzar Resultado" todavia no soporta partidos de dobles -- usa "Marcar W.O." o contacta a soporte.';
  END IF;

  IF p_ganador_id NOT IN (v_partido.jugador1_id, v_partido.jugador2_id) THEN
    RAISE EXCEPTION 'El ganador debe ser uno de los dos jugadores del partido.';
  END IF;

  FOR v_set_row IN SELECT value FROM jsonb_array_elements(p_sets_json) LOOP
    v_idx := v_idx + 1;
    IF COALESCE((v_set_row->>'p1')::integer, 0) > COALESCE((v_set_row->>'p2')::integer, 0) THEN
      v_sets_j1 := v_sets_j1 + 1;
    ELSIF COALESCE((v_set_row->>'p2')::integer, 0) > COALESCE((v_set_row->>'p1')::integer, 0) THEN
      v_sets_j2 := v_sets_j2 + 1;
    END IF;
    IF    v_idx = 1 THEN
      v_set1_j1 := (v_set_row->>'p1')::integer; v_set1_j2 := (v_set_row->>'p2')::integer;
    ELSIF v_idx = 2 THEN
      v_set2_j1 := (v_set_row->>'p1')::integer; v_set2_j2 := (v_set_row->>'p2')::integer;
    ELSIF v_idx = 3 THEN
      v_set3_j1 := (v_set_row->>'p1')::integer; v_set3_j2 := (v_set_row->>'p2')::integer;
    END IF;
  END LOOP;

  v_resultado := FORMAT('%s-%s', v_sets_j1, v_sets_j2);

  -- Puntuacion plana: ganar = 3 pts, perder = 1 pt (independiente del marcador de sets)
  -- Igual a validar_resultado_seguro (20260603_fix_scoring_flat_pts_y_sets_perdidos.sql)
  IF p_ganador_id = v_partido.jugador1_id THEN
    v_pts_j1 := 3;
    v_pts_j2 := 1;
  ELSE
    v_pts_j2 := 3;
    v_pts_j1 := 1;
  END IF;

  UPDATE public.torneo_propuestas_partido
  SET estado = 'confirmado', debe_confirmar_por = NULL, updated_at = now()
  WHERE partido_id = p_partido_id
    AND estado IN ('discrepancia', 'pendiente');

  UPDATE public.partidos
  SET estado        = 'finalizado',
      resultado     = v_resultado,
      ganador_id    = p_ganador_id,
      es_wo         = false,
      sets_jugador1 = v_sets_j1,
      sets_jugador2 = v_sets_j2,
      set1_j1 = v_set1_j1, set1_j2 = v_set1_j2,
      set2_j1 = v_set2_j1, set2_j2 = v_set2_j2,
      set3_j1 = v_set3_j1, set3_j2 = v_set3_j2,
      updated_at    = now()
  WHERE id = p_partido_id;

  SELECT titulo INTO v_titulo FROM public.torneos WHERE id = v_partido.torneo_id;

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

    UPDATE public.torneo_partidos_historial
    SET jugador1_id        = v_partido.jugador1_id,
        jugador2_id        = v_partido.jugador2_id,
        ganador_id         = p_ganador_id,
        jugador1_perfil_id = v_partido.jugador1_id,
        jugador2_perfil_id = v_partido.jugador2_id,
        ganador_perfil_id  = p_ganador_id,
        sets_json          = p_sets_json,
        sets_jugador1      = v_sets_j1,
        sets_jugador2      = v_sets_j2,
        puntos_jugador1    = v_pts_j1,
        puntos_jugador2    = v_pts_j2,
        es_wo              = false,
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
      p_ganador_id,
      v_partido.jugador1_id,
      v_partido.jugador2_id,
      p_ganador_id,
      p_sets_json,
      v_sets_j1, v_sets_j2,
      v_pts_j1,  v_pts_j2, false,
      auth.uid(), auth.uid(), now(),
      v_partido.stage_name,
      v_partido.ronda
    );
  END IF;

  IF COALESCE(v_partido.grupo, '') <> '' AND v_partido.bracket_tipo IS NULL THEN
    UPDATE public.torneo_jugadores tj
    SET
      puntos = COALESCE(tj.puntos, 0)
        + CASE WHEN tj.perfil_id = v_partido.jugador1_id THEN v_pts_j1 - v_old_pts_j1
               WHEN tj.perfil_id = v_partido.jugador2_id THEN v_pts_j2 - v_old_pts_j2
               ELSE 0 END,
      sets_ganados = COALESCE(tj.sets_ganados, 0)
        + CASE WHEN tj.perfil_id = v_partido.jugador1_id THEN v_sets_j1 - v_old_sets_j1
               WHEN tj.perfil_id = v_partido.jugador2_id THEN v_sets_j2 - v_old_sets_j2
               ELSE 0 END,
      sets_perdidos = COALESCE(tj.sets_perdidos, 0)
        + CASE WHEN tj.perfil_id = v_partido.jugador1_id THEN v_sets_j2 - v_old_sets_j2
               WHEN tj.perfil_id = v_partido.jugador2_id THEN v_sets_j1 - v_old_sets_j1
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
    'OK: Partido %s forzado. Ganador: %s. Resultado: %s. Historial: %s. Motivo: %s',
    p_partido_id,
    p_ganador_id,
    v_resultado,
    CASE WHEN v_ya_registrado THEN 'actualizado' ELSE 'insertado' END,
    COALESCE(p_motivo, 'sin motivo')
  );
END;
$function$
