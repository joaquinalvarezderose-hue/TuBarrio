-- Contraparte de dobles para admin_forzar_resultado_partido (ver
-- 20260827_guard_admin_forzar_resultado_dobles.sql -- esa migracion documenta por
-- que hacia falta y por que no se podia simplemente reusar la funcion de singles).
-- Espejo exacto del patron ya usado en admin_marcar_wo_equipo (equipo1/equipo2,
-- representante = torneo_equipos.jugador1_id de cada pareja para el historial,
-- actualiza torneo_equipos en vez de torneo_jugadores), combinado con el parseo
-- de p_sets_json de admin_forzar_resultado_partido.
--
-- Nota: igual que la version de singles, no actualiza games_ganados/games_perdidos
-- (solo puntos/sets/partidos_jugados) -- se mantiene la paridad de comportamiento
-- con la funcion que reemplaza, no es una omision nueva de esta migracion.
CREATE OR REPLACE FUNCTION public.admin_forzar_resultado_partido_equipo(p_partido_id uuid, p_equipo_ganador_id uuid, p_sets_json jsonb, p_motivo text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_partido   public.partidos%ROWTYPE;
  v_equipo1   public.torneo_equipos%ROWTYPE;
  v_equipo2   public.torneo_equipos%ROWTYPE;
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
  v_ganador_perfil uuid;
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

  IF v_partido.equipo1_id IS NULL OR v_partido.equipo2_id IS NULL THEN
    RAISE EXCEPTION 'Este partido es de singles (usa jugador1_id/jugador2_id). Usa admin_forzar_resultado_partido en vez de esta funcion.';
  END IF;

  IF p_equipo_ganador_id NOT IN (v_partido.equipo1_id, v_partido.equipo2_id) THEN
    RAISE EXCEPTION 'El ganador debe ser uno de los dos equipos del partido.';
  END IF;

  SELECT * INTO v_equipo1 FROM public.torneo_equipos WHERE id = v_partido.equipo1_id;
  SELECT * INTO v_equipo2 FROM public.torneo_equipos WHERE id = v_partido.equipo2_id;

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

  -- Puntuacion plana: ganar = 3 pts, perder = 1 pt (igual a admin_forzar_resultado_partido
  -- y a _confirmar_resultado_equipo_core).
  IF p_equipo_ganador_id = v_partido.equipo1_id THEN
    v_pts_j1 := 3;
    v_pts_j2 := 1;
  ELSE
    v_pts_j2 := 3;
    v_pts_j1 := 1;
  END IF;

  v_ganador_perfil := CASE WHEN p_equipo_ganador_id = v_partido.equipo1_id THEN v_equipo1.jugador1_id ELSE v_equipo2.jugador1_id END;

  UPDATE public.torneo_propuestas_partido
  SET estado = 'confirmado', debe_confirmar_equipo_id = NULL, updated_at = now()
  WHERE partido_id = p_partido_id
    AND estado IN ('discrepancia', 'pendiente');

  UPDATE public.partidos
  SET estado            = 'finalizado',
      resultado         = v_resultado,
      equipo_ganador_id = p_equipo_ganador_id,
      es_wo             = false,
      sets_jugador1     = v_sets_j1,
      sets_jugador2     = v_sets_j2,
      set1_j1 = v_set1_j1, set1_j2 = v_set1_j2,
      set2_j1 = v_set2_j1, set2_j2 = v_set2_j2,
      set3_j1 = v_set3_j1, set3_j2 = v_set3_j2,
      updated_at        = now()
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
    SET jugador1_id        = v_equipo1.jugador1_id,
        jugador2_id        = v_equipo2.jugador1_id,
        ganador_id         = v_ganador_perfil,
        jugador1_perfil_id = v_equipo1.jugador1_id,
        jugador2_perfil_id = v_equipo2.jugador1_id,
        ganador_perfil_id  = v_ganador_perfil,
        equipo1_id         = v_partido.equipo1_id,
        equipo2_id         = v_partido.equipo2_id,
        equipo_ganador_id  = p_equipo_ganador_id,
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
      v_ganador_perfil,
      v_equipo1.jugador1_id,
      v_equipo2.jugador1_id,
      v_ganador_perfil,
      v_partido.equipo1_id, v_partido.equipo2_id, p_equipo_ganador_id,
      p_sets_json, v_sets_j1, v_sets_j2,
      v_pts_j1, v_pts_j2, false,
      auth.uid(), auth.uid(), now(),
      v_partido.stage_name, v_partido.ronda
    );
  END IF;

  IF COALESCE(v_partido.grupo, '') <> '' AND v_partido.bracket_tipo IS NULL THEN
    UPDATE public.torneo_equipos te
    SET
      puntos = COALESCE(te.puntos, 0)
        + CASE WHEN te.id = v_partido.equipo1_id THEN v_pts_j1 - v_old_pts_j1
               WHEN te.id = v_partido.equipo2_id THEN v_pts_j2 - v_old_pts_j2
               ELSE 0 END,
      sets_ganados = COALESCE(te.sets_ganados, 0)
        + CASE WHEN te.id = v_partido.equipo1_id THEN v_sets_j1 - v_old_sets_j1
               WHEN te.id = v_partido.equipo2_id THEN v_sets_j2 - v_old_sets_j2
               ELSE 0 END,
      sets_perdidos = COALESCE(te.sets_perdidos, 0)
        + CASE WHEN te.id = v_partido.equipo1_id THEN v_sets_j2 - v_old_sets_j2
               WHEN te.id = v_partido.equipo2_id THEN v_sets_j1 - v_old_sets_j1
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
    'OK: Partido %s forzado. Equipo ganador: %s. Resultado: %s. Historial: %s. Motivo: %s',
    p_partido_id,
    p_equipo_ganador_id,
    v_resultado,
    CASE WHEN v_ya_registrado THEN 'actualizado' ELSE 'insertado' END,
    COALESCE(p_motivo, 'sin motivo')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_forzar_resultado_partido_equipo(uuid, uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_forzar_resultado_partido_equipo(uuid, uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_forzar_resultado_partido_equipo(uuid, uuid, jsonb, text) TO authenticated;
