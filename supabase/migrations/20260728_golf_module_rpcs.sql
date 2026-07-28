-- ============================================================
-- Modulo de Torneos de Golf - RPCs
--
-- Reutiliza is_admin() / is_organizador() / puede_administrar_torneo()
-- ya existentes (no se tocan). No se modifica ninguna RPC de tenis.
-- ============================================================

-- ------------------------------------------------------------
-- 1. crear_cancha_con_hoyos: alta de cancha + sus hoyos en un
--    solo paso. Admin only.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_cancha_con_hoyos(
  p_nombre text,
  p_ubicacion text,
  p_hoyos jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cancha_id bigint;
  v_nombre text;
  v_cantidad integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permiso denegado: solo un admin puede dar de alta canchas.';
  END IF;

  v_nombre := NULLIF(TRIM(COALESCE(p_nombre, '')), '');
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'El nombre de la cancha es obligatorio.';
  END IF;

  SELECT COUNT(*) INTO v_cantidad FROM jsonb_array_elements(COALESCE(p_hoyos, '[]'::jsonb));
  IF v_cantidad = 0 THEN
    RAISE EXCEPTION 'Debe informar al menos un hoyo (numero_hoyo, par, indice_dificultad).';
  END IF;

  INSERT INTO public.canchas (nombre, ubicacion, cantidad_hoyos)
  VALUES (v_nombre, NULLIF(TRIM(COALESCE(p_ubicacion, '')), ''), v_cantidad)
  RETURNING id INTO v_cancha_id;

  INSERT INTO public.hoyos (cancha_id, numero_hoyo, par, yardas, indice_dificultad, mapa_url)
  SELECT
    v_cancha_id,
    (h ->> 'numero_hoyo')::integer,
    (h ->> 'par')::integer,
    NULLIF(h ->> 'yardas', '')::integer,
    (h ->> 'indice_dificultad')::integer,
    NULLIF(h ->> 'mapa_url', '')
  FROM jsonb_array_elements(p_hoyos) AS h;

  RETURN v_cancha_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_cancha_con_hoyos(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_cancha_con_hoyos(text, text, jsonb) TO authenticated;

-- ------------------------------------------------------------
-- 2. crear_torneo_golf: crea el torneo (deporte='golf') + su
--    configuracion/reglas. No toca torneo_configuracion (el
--    trigger existente crea igual una fila default ahi, inerte).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_torneo_golf(
  p_titulo text,
  p_subtitulo text DEFAULT NULL,
  p_fecha_inicio date DEFAULT NULL,
  p_fecha_fin date DEFAULT NULL,
  p_imagen_url text DEFAULT NULL,
  p_alias_pago text DEFAULT NULL,
  p_whatsapp_pago text DEFAULT NULL,
  p_cancha_id bigint DEFAULT NULL,
  p_sistema_handicap text DEFAULT NULL,
  p_criterio_desempate text DEFAULT NULL,
  p_reglas_texto text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_torneo_id bigint;
  v_titulo text;
BEGIN
  IF NOT (public.is_admin() OR public.is_organizador()) THEN
    RAISE EXCEPTION 'Permiso denegado: solo admin u organizador puede crear torneos.';
  END IF;

  v_titulo := NULLIF(TRIM(COALESCE(p_titulo, '')), '');
  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'El titulo es obligatorio.';
  END IF;

  IF p_cancha_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.canchas c WHERE c.id = p_cancha_id) THEN
    RAISE EXCEPTION 'Debe seleccionar una cancha valida.';
  END IF;

  INSERT INTO public.torneos (
    titulo, subtitulo, fecha_inicio, fecha_fin, imagen_url, deporte, activo, creado_por, alias_pago, whatsapp_pago
  )
  VALUES (
    v_titulo,
    COALESCE(NULLIF(TRIM(p_subtitulo), ''), v_titulo),
    p_fecha_inicio,
    p_fecha_fin,
    p_imagen_url,
    'golf',
    true,
    auth.uid(),
    p_alias_pago,
    p_whatsapp_pago
  )
  RETURNING id INTO v_torneo_id;

  INSERT INTO public.torneo_golf_config (torneo_id, cancha_id, sistema_handicap, criterio_desempate, reglas_texto)
  VALUES (
    v_torneo_id,
    p_cancha_id,
    COALESCE(NULLIF(TRIM(p_sistema_handicap), ''), 'Course Handicap (stroke index por hoyo)'),
    COALESCE(NULLIF(TRIM(p_criterio_desempate), ''), 'Menor score neto total. En caso de empate, countback de los ultimos 9 hoyos.'),
    p_reglas_texto
  );

  RETURN v_torneo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_torneo_golf(
  text, text, date, date, text, text, text, bigint, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_torneo_golf(
  text, text, date, date, text, text, text, bigint, text, text, text
) TO authenticated;

-- ------------------------------------------------------------
-- 3. actualizar_reglas_golf: el organizador edita sistema de
--    handicap / criterio de desempate / reglamento libre.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.actualizar_reglas_golf(
  p_torneo_id bigint,
  p_sistema_handicap text DEFAULT NULL,
  p_criterio_desempate text DEFAULT NULL,
  p_reglas_texto text DEFAULT NULL
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

  UPDATE public.torneo_golf_config
  SET sistema_handicap   = COALESCE(NULLIF(TRIM(p_sistema_handicap), ''), sistema_handicap),
      criterio_desempate = COALESCE(NULLIF(TRIM(p_criterio_desempate), ''), criterio_desempate),
      reglas_texto       = COALESCE(p_reglas_texto, reglas_texto),
      updated_at         = now()
  WHERE torneo_id = p_torneo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El torneo % no tiene configuracion de golf.', p_torneo_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_reglas_golf(bigint, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_reglas_golf(bigint, text, text, text) TO authenticated;

-- ------------------------------------------------------------
-- 4. asignar_tee_time: agrupa jugadores en un mismo flight
--    (cancha+fecha+hora_salida). Valida que cada jugador tenga
--    inscripcion pagado_aprobado en el torneo.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.asignar_tee_time(
  p_torneo_id bigint,
  p_cancha_id bigint,
  p_fecha date,
  p_hora_salida time,
  p_jugador_ids uuid[]
)
RETURNS SETOF public.rondas_golf
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jugador_id uuid;
  v_aprobado boolean;
BEGIN
  IF NOT public.puede_administrar_torneo(p_torneo_id) THEN
    RAISE EXCEPTION 'Permiso denegado: no administras este torneo.';
  END IF;

  IF p_jugador_ids IS NULL OR array_length(p_jugador_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Debe indicar al menos un jugador.';
  END IF;

  FOREACH v_jugador_id IN ARRAY p_jugador_ids LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.inscripciones_torneo i
      WHERE i.torneo_id = p_torneo_id
        AND i.perfil_id = v_jugador_id
        AND i.estado = 'pagado_aprobado'
    ) INTO v_aprobado;

    IF NOT v_aprobado THEN
      RAISE EXCEPTION 'El jugador % no tiene una inscripcion aprobada en este torneo.', v_jugador_id;
    END IF;

    INSERT INTO public.rondas_golf (torneo_id, jugador_id, cancha_id, fecha, hora_salida, estado)
    VALUES (p_torneo_id, v_jugador_id, p_cancha_id, p_fecha, p_hora_salida, 'programada')
    ON CONFLICT (torneo_id, jugador_id) DO UPDATE
      SET cancha_id   = EXCLUDED.cancha_id,
          fecha       = EXCLUDED.fecha,
          hora_salida = EXCLUDED.hora_salida,
          updated_at  = now();
  END LOOP;

  RETURN QUERY
  SELECT * FROM public.rondas_golf
  WHERE torneo_id = p_torneo_id AND jugador_id = ANY(p_jugador_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.asignar_tee_time(bigint, bigint, date, time, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asignar_tee_time(bigint, bigint, date, time, uuid[]) TO authenticated;

-- ------------------------------------------------------------
-- 5. calcular_golpes_netos: formula estandar de asignacion de
--    golpes por handicap.
--
--    golpes_base  = floor(handicap / 18)          (aplica a los 18 hoyos)
--    golpes_extra = 1 si indice_dificultad <= (handicap mod 18)
--    golpes_netos = golpes_brutos - (golpes_base + golpes_extra)
--
--    Verificado:
--      handicap 14, stroke index 6  -> base=0, resto=14, 6<=14  -> 1 golpe  (caso del pedido)
--      handicap 8,  stroke index 7  -> base=0, resto=8,  7<=8   -> 1 golpe
--      handicap 8,  stroke index 9  -> base=0, resto=8,  9<=8   -> 0 golpes
--      handicap 20, stroke index 2  -> base=1, resto=2,  2<=2   -> 2 golpes
--      handicap 28, stroke index 15 -> base=1, resto=10, 15<=10 -> 1 golpe
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_golpes_netos(
  p_golpes_brutos integer,
  p_handicap numeric,
  p_indice_dificultad integer
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_hcp integer;
  v_golpes_base integer;
  v_golpes_extra integer;
BEGIN
  v_hcp := ROUND(COALESCE(p_handicap, 0))::integer;
  v_golpes_base := FLOOR(v_hcp::numeric / 18)::integer;
  v_golpes_extra := CASE WHEN p_indice_dificultad <= (v_hcp - v_golpes_base * 18) THEN 1 ELSE 0 END;
  RETURN p_golpes_brutos - (v_golpes_base + v_golpes_extra);
END;
$$;

REVOKE ALL ON FUNCTION public.calcular_golpes_netos(integer, numeric, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calcular_golpes_netos(integer, numeric, integer) TO authenticated;

-- ------------------------------------------------------------
-- 6. cargar_hoyo_scorecard: el jugador o un companero de su
--    mismo flight carga el score bruto de un hoyo; el neto se
--    calcula automaticamente. Queda en estado 'pendiente' hasta
--    que otro miembro del flight lo confirme.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cargar_hoyo_scorecard(
  p_ronda_id uuid,
  p_hoyo_id bigint,
  p_golpes_brutos integer
)
RETURNS public.scorecard
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ronda public.rondas_golf%ROWTYPE;
  v_hoyo public.hoyos%ROWTYPE;
  v_jugador_handicap numeric;
  v_en_flight boolean;
  v_netos integer;
  v_row public.scorecard%ROWTYPE;
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Se requiere autenticacion.';
  END IF;

  IF p_golpes_brutos IS NULL OR p_golpes_brutos <= 0 THEN
    RAISE EXCEPTION 'Los golpes brutos deben ser un numero positivo.';
  END IF;

  SELECT * INTO v_ronda FROM public.rondas_golf WHERE id = p_ronda_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La ronda % no existe.', p_ronda_id;
  END IF;
  IF v_ronda.estado = 'finalizada' THEN
    RAISE EXCEPTION 'La ronda ya esta finalizada, no se pueden cargar mas hoyos.';
  END IF;

  SELECT * INTO v_hoyo FROM public.hoyos WHERE id = p_hoyo_id AND cancha_id = v_ronda.cancha_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El hoyo % no pertenece a la cancha de esta ronda.', p_hoyo_id;
  END IF;

  -- Quien llama (auth.uid(), nunca un parametro que el cliente pueda falsear)
  -- debe ser el jugador dueno de la ronda o un companero de su mismo flight
  -- (mismo torneo + cancha + fecha + hora de salida), o el organizador.
  SELECT EXISTS (
    SELECT 1 FROM public.rondas_golf r
    WHERE r.torneo_id = v_ronda.torneo_id
      AND r.cancha_id = v_ronda.cancha_id
      AND r.fecha = v_ronda.fecha
      AND r.hora_salida = v_ronda.hora_salida
      AND r.jugador_id = v_caller
  ) INTO v_en_flight;

  IF NOT v_en_flight AND NOT public.puede_administrar_torneo(v_ronda.torneo_id) THEN
    RAISE EXCEPTION 'Solo el jugador o un companero de su mismo tee time puede cargar este hoyo.';
  END IF;

  SELECT handicap INTO v_jugador_handicap FROM public.perfiles WHERE id = v_ronda.jugador_id;
  v_netos := public.calcular_golpes_netos(p_golpes_brutos, v_jugador_handicap, v_hoyo.indice_dificultad);

  INSERT INTO public.scorecard (ronda_id, hoyo_id, golpes_brutos, golpes_netos, estado, cargado_por, confirmado_por)
  VALUES (p_ronda_id, p_hoyo_id, p_golpes_brutos, v_netos, 'pendiente', v_caller, NULL)
  ON CONFLICT (ronda_id, hoyo_id) DO UPDATE
    SET golpes_brutos  = EXCLUDED.golpes_brutos,
        golpes_netos   = EXCLUDED.golpes_netos,
        estado         = 'pendiente',
        cargado_por    = EXCLUDED.cargado_por,
        confirmado_por = NULL,
        updated_at     = now()
  WHERE public.scorecard.estado <> 'confirmado'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Este hoyo ya fue confirmado. Para corregirlo, primero debe rechazarse.';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.cargar_hoyo_scorecard(uuid, bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cargar_hoyo_scorecard(uuid, bigint, integer) TO authenticated;

-- ------------------------------------------------------------
-- 7. confirmar_hoyo_scorecard: doble confirmacion cruzada.
--    Quien cargo el hoyo NUNCA puede confirmarlo (salvo el
--    organizador/admin, que puede corregir directo). Al
--    confirmar el ultimo hoyo, la ronda pasa a 'finalizada'.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirmar_hoyo_scorecard(
  p_scorecard_id uuid,
  p_accion text
)
RETURNS public.scorecard
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scorecard public.scorecard%ROWTYPE;
  v_ronda public.rondas_golf%ROWTYPE;
  v_en_flight boolean;
  v_puede_admin boolean;
  v_total_hoyos integer;
  v_confirmados integer;
  v_row public.scorecard%ROWTYPE;
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Se requiere autenticacion.';
  END IF;

  IF p_accion NOT IN ('confirmar', 'rechazar') THEN
    RAISE EXCEPTION 'Accion invalida: %. Debe ser confirmar o rechazar.', p_accion;
  END IF;

  SELECT * INTO v_scorecard FROM public.scorecard WHERE id = p_scorecard_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El registro de scorecard % no existe.', p_scorecard_id;
  END IF;
  IF v_scorecard.estado = 'confirmado' THEN
    RAISE EXCEPTION 'Este hoyo ya fue confirmado.';
  END IF;
  IF v_scorecard.cargado_por IS NULL THEN
    RAISE EXCEPTION 'Este hoyo todavia no tiene un score cargado.';
  END IF;

  SELECT * INTO v_ronda FROM public.rondas_golf WHERE id = v_scorecard.ronda_id;
  v_puede_admin := public.puede_administrar_torneo(v_ronda.torneo_id);

  -- Quien llama (auth.uid(), nunca un parametro que el cliente pueda
  -- falsear) debe ser companero de flight distinto de quien cargo el hoyo,
  -- o el organizador.
  SELECT EXISTS (
    SELECT 1 FROM public.rondas_golf r
    WHERE r.torneo_id = v_ronda.torneo_id
      AND r.cancha_id = v_ronda.cancha_id
      AND r.fecha = v_ronda.fecha
      AND r.hora_salida = v_ronda.hora_salida
      AND r.jugador_id = v_caller
  ) INTO v_en_flight;

  IF v_caller = v_scorecard.cargado_por AND NOT v_puede_admin THEN
    RAISE EXCEPTION 'Quien carga un score no puede confirmarlo: necesita la validacion de un companero de flight.';
  END IF;

  IF NOT v_en_flight AND NOT v_puede_admin THEN
    RAISE EXCEPTION 'Solo un companero de flight o el organizador puede confirmar este hoyo.';
  END IF;

  IF p_accion = 'rechazar' THEN
    UPDATE public.scorecard
    SET golpes_brutos  = NULL,
        golpes_netos   = NULL,
        estado         = 'pendiente',
        cargado_por    = NULL,
        confirmado_por = NULL,
        updated_at     = now()
    WHERE id = p_scorecard_id
    RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  UPDATE public.scorecard
  SET estado         = 'confirmado',
      confirmado_por = v_caller,
      updated_at     = now()
  WHERE id = p_scorecard_id
  RETURNING * INTO v_row;

  SELECT c.cantidad_hoyos INTO v_total_hoyos
  FROM public.canchas c WHERE c.id = v_ronda.cancha_id;

  SELECT COUNT(*) INTO v_confirmados
  FROM public.scorecard s
  WHERE s.ronda_id = v_ronda.id AND s.estado = 'confirmado';

  IF v_confirmados >= v_total_hoyos THEN
    UPDATE public.rondas_golf SET estado = 'finalizada', updated_at = now() WHERE id = v_ronda.id;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_hoyo_scorecard(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirmar_hoyo_scorecard(uuid, text) TO authenticated;

-- ------------------------------------------------------------
-- 8. obtener_leaderboard_golf: ranking stroke play (gana el
--    menor score neto total). Jugadores sin hoyos confirmados
--    quedan listados al final, sin posicion.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_leaderboard_golf(p_torneo_id bigint)
RETURNS TABLE (
  jugador_id uuid,
  nombre_completo text,
  handicap numeric,
  hoyos_confirmados integer,
  golpes_brutos_total integer,
  golpes_netos_total integer,
  posicion integer
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH agregado AS (
    SELECT
      r.jugador_id,
      COUNT(s.id) FILTER (WHERE s.estado = 'confirmado') AS hoyos_confirmados,
      SUM(s.golpes_brutos) FILTER (WHERE s.estado = 'confirmado') AS golpes_brutos_total,
      SUM(s.golpes_netos) FILTER (WHERE s.estado = 'confirmado') AS golpes_netos_total
    FROM public.rondas_golf r
    LEFT JOIN public.scorecard s ON s.ronda_id = r.id
    WHERE r.torneo_id = p_torneo_id
    GROUP BY r.jugador_id
  )
  SELECT
    a.jugador_id,
    p.nombre_completo,
    p.handicap,
    COALESCE(a.hoyos_confirmados, 0)::integer,
    COALESCE(a.golpes_brutos_total, 0)::integer,
    COALESCE(a.golpes_netos_total, 0)::integer,
    CASE WHEN COALESCE(a.hoyos_confirmados, 0) > 0
      THEN RANK() OVER (ORDER BY a.golpes_netos_total ASC)::integer
      ELSE NULL
    END AS posicion
  FROM agregado a
  JOIN public.perfiles p ON p.id = a.jugador_id
  ORDER BY (COALESCE(a.hoyos_confirmados, 0) > 0) DESC, a.golpes_netos_total ASC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.obtener_leaderboard_golf(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_leaderboard_golf(bigint) TO authenticated;

-- ------------------------------------------------------------
-- 9. iniciar_torneo_golf / finalizar_torneo_golf: lifecycle
--    minimo sobre torneo_estado (misma tabla y mismos valores de
--    estado que usa tenis: EN_CURSO / FINALIZADO), sin tocar
--    fixture ni bracket.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iniciar_torneo_golf(p_torneo_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.puede_administrar_torneo(p_torneo_id) THEN
    RAISE EXCEPTION 'Permiso denegado: no administras este torneo.';
  END IF;

  UPDATE public.torneo_estado
  SET estado = 'EN_CURSO', updated_at = now()
  WHERE torneo_id = p_torneo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El torneo % todavia no tiene inscriptos aprobados.', p_torneo_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.iniciar_torneo_golf(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iniciar_torneo_golf(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalizar_torneo_golf(p_torneo_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campeon uuid;
BEGIN
  IF NOT public.puede_administrar_torneo(p_torneo_id) THEN
    RAISE EXCEPTION 'Permiso denegado: no administras este torneo.';
  END IF;

  SELECT jugador_id INTO v_campeon
  FROM public.obtener_leaderboard_golf(p_torneo_id)
  WHERE posicion = 1
  LIMIT 1;

  UPDATE public.torneo_estado
  SET estado = 'FINALIZADO', campeon_perfil_id = v_campeon, updated_at = now()
  WHERE torneo_id = p_torneo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El torneo % no tiene fila en torneo_estado para finalizar.', p_torneo_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_torneo_golf(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_torneo_golf(bigint) TO authenticated;
