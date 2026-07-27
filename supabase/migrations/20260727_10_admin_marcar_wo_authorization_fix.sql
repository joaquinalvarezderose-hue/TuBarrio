-- ============================================================
-- FIX DE SEGURIDAD PREEXISTENTE: admin_marcar_wo (version singles del
-- W.O., usada en screens/AdminPartidos.tsx) es un RPC SECURITY DEFINER
-- que no estaba versionado en ningun archivo de migracion del repo
-- (vivia solo en la base). Su gate era `IF NOT public.is_admin()`
-- puro, sin considerar organizadores.
--
-- Cuerpo verificado contra pg_get_functiondef() en produccion antes de
-- reemplazar (mismo cuidado que 20260727_08): se reproduce identico,
-- moviendo el chequeo a despues de resolver v_partido.torneo_id y
-- reemplazando is_admin() por puede_administrar_torneo(torneo_id),
-- igual que su espejo admin_marcar_wo_equipo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_marcar_wo(p_partido_id uuid, p_ganador_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_partido        public.partidos%ROWTYPE;
  v_sets_j1        integer;
  v_sets_j2        integer;
  v_pts_j1         integer;
  v_pts_j2         integer;
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

  IF p_ganador_id NOT IN (v_partido.jugador1_id, v_partido.jugador2_id) THEN
    RAISE EXCEPTION 'El ganador debe ser uno de los dos jugadores del partido.';
  END IF;

  IF p_ganador_id = v_partido.jugador1_id THEN
    v_sets_j1 := 2; v_sets_j2 := 0;
    v_pts_j1  := 3; v_pts_j2  := 0;
  ELSE
    v_sets_j1 := 0; v_sets_j2 := 2;
    v_pts_j1  := 0; v_pts_j2  := 3;
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
        ganador_perfil_id  = p_ganador_id,
        jugador1_id        = v_partido.jugador1_id,
        jugador2_id        = v_partido.jugador2_id,
        ganador_id         = p_ganador_id,
        sets_json          = NULL,
        sets_jugador1      = v_sets_j1,
        sets_jugador2      = v_sets_j2,
        puntos_jugador1    = v_pts_j1,
        puntos_jugador2    = v_pts_j2,
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
      p_ganador_id,
      v_partido.jugador1_id,
      v_partido.jugador2_id,
      p_ganador_id,
      NULL,
      v_sets_j1, v_sets_j2,
      v_pts_j1, v_pts_j2, true,
      auth.uid(), auth.uid(), now(),
      v_partido.stage_name,
      v_partido.ronda
    );
  END IF;

  -- 3. Actualizar el partido (dispara trigger_promover_ganador_bracket si es de bracket)
  UPDATE public.partidos
  SET estado        = 'finalizado',
      resultado     = 'W.O.',
      ganador_id    = p_ganador_id,
      es_wo         = true,
      sets_jugador1 = v_sets_j1,
      sets_jugador2 = v_sets_j2,
      set1_j1 = NULL, set1_j2 = NULL,
      set2_j1 = NULL, set2_j2 = NULL,
      set3_j1 = NULL, set3_j2 = NULL,
      updated_at    = now()
  WHERE id = p_partido_id;

  -- 4. Actualizar torneo_jugadores por delta (seguro tanto para alta nueva como para sobrescritura)
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
    'OK: Partido %s marcado como W.O. Ganador: %s. Historial: %s.',
    p_partido_id,
    p_ganador_id,
    CASE WHEN v_ya_registrado THEN 'actualizado' ELSE 'insertado' END
  );
END;
$function$
;

-- admin_marcar_wo nunca tuvo REVOKE explicito de `anon` (a diferencia de
-- sus pares admin_forzar_resultado_partido/admin_resetear_disputa/
-- admin_marcar_wo_equipo) -- confirmado con has_function_privilege()
-- contra la base real. No era explotable (el gate interno igual
-- bloquea a anon), pero se cierra por consistencia/defensa en profundidad.
REVOKE ALL ON FUNCTION public.admin_marcar_wo(uuid, uuid) FROM anon;
