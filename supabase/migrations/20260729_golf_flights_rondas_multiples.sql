-- ============================================================
-- Golf: sorteo aleatorio de flights (reemplaza asignacion manual
-- de tee time por el organizador) + soporte de rondas multiples
-- acumulables + confirmacion de tarjeta completa (no por hoyo).
--
-- Motivacion: los jugadores coordinan el horario de salida entre
-- ellos (whatsapp), no lo asigna el organizador. Lo que si necesita
-- el organizador es agrupar a los inscriptos en flights (grupos de
-- juego) de forma aleatoria, igual que el sorteo de partidos en los
-- otros deportes. Ademas, confirmar hoyo por hoyo mientras se juega
-- es una traba: ahora se carga toda la tarjeta y un companero de
-- flight confirma (o rechaza) la ronda completa al final.
-- ============================================================

-- ── 1. Configuracion: cantidad de rondas y tamano de flight ──────
ALTER TABLE public.torneo_golf_config
  ADD COLUMN IF NOT EXISTS cantidad_rondas integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tamano_flight integer NOT NULL DEFAULT 4;

ALTER TABLE public.torneo_golf_config
  DROP CONSTRAINT IF EXISTS torneo_golf_config_cantidad_rondas_check;
ALTER TABLE public.torneo_golf_config
  ADD CONSTRAINT torneo_golf_config_cantidad_rondas_check CHECK (cantidad_rondas BETWEEN 1 AND 10);

ALTER TABLE public.torneo_golf_config
  DROP CONSTRAINT IF EXISTS torneo_golf_config_tamano_flight_check;
ALTER TABLE public.torneo_golf_config
  ADD CONSTRAINT torneo_golf_config_tamano_flight_check CHECK (tamano_flight BETWEEN 2 AND 6);

-- ── 2. rondas_golf: numero_ronda + flight_numero en vez de       ──
--       fecha/hora_salida fijadas por el organizador.
ALTER TABLE public.rondas_golf
  ADD COLUMN IF NOT EXISTS numero_ronda integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS flight_numero integer;

ALTER TABLE public.rondas_golf ALTER COLUMN fecha DROP NOT NULL;
ALTER TABLE public.rondas_golf ALTER COLUMN hora_salida DROP NOT NULL;

ALTER TABLE public.rondas_golf
  DROP CONSTRAINT IF EXISTS rondas_golf_torneo_id_jugador_id_key;
ALTER TABLE public.rondas_golf
  ADD CONSTRAINT rondas_golf_torneo_id_jugador_id_numero_ronda_key UNIQUE (torneo_id, jugador_id, numero_ronda);

-- ── 3. Ya no hay asignacion manual de tee time. ──────────────────
DROP FUNCTION IF EXISTS public.asignar_tee_time(bigint, bigint, date, time, uuid[]);

-- ── 4. sortear_flights_golf: agrupa aleatoriamente a los         ──
--       inscriptos aprobados en flights, para una ronda dada.
--       Bloquea el re-sorteo si ya hay scores cargados en esa
--       ronda (para no pisar juego en curso).
CREATE OR REPLACE FUNCTION public.sortear_flights_golf(
  p_torneo_id bigint,
  p_numero_ronda integer DEFAULT 1
)
RETURNS TABLE (
  numero_ronda integer,
  flights_creados integer,
  jugadores_sorteados integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cancha_id bigint;
  v_tamano_flight integer;
  v_jugadores uuid[];
  v_total integer := 0;
  v_flights integer := 0;
  v_has_progress boolean := false;
  v_i integer;
  v_j integer;
  v_tmp uuid;
  v_idx integer;
BEGIN
  IF NOT public.puede_administrar_torneo(p_torneo_id) THEN
    RAISE EXCEPTION 'Permiso denegado: no administras este torneo.';
  END IF;

  IF p_numero_ronda IS NULL OR p_numero_ronda < 1 THEN
    RAISE EXCEPTION 'Numero de ronda invalido.';
  END IF;

  SELECT tgc.cancha_id, COALESCE(tgc.tamano_flight, 4)
  INTO v_cancha_id, v_tamano_flight
  FROM public.torneo_golf_config tgc
  WHERE tgc.torneo_id = p_torneo_id;

  IF v_cancha_id IS NULL THEN
    RAISE EXCEPTION 'El torneo % no tiene una cancha configurada.', p_torneo_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.rondas_golf r
    JOIN public.scorecard s ON s.ronda_id = r.id
    WHERE r.torneo_id = p_torneo_id
      AND r.numero_ronda = p_numero_ronda
      AND s.cargado_por IS NOT NULL
  ) INTO v_has_progress;

  IF v_has_progress THEN
    RAISE EXCEPTION 'Ya hay scores cargados para la ronda %. No se puede re-sortear sin resetearlos antes.', p_numero_ronda;
  END IF;

  SELECT array_agg(DISTINCT i.perfil_id ORDER BY i.perfil_id)
  INTO v_jugadores
  FROM public.inscripciones_torneo i
  WHERE i.torneo_id = p_torneo_id
    AND i.estado = 'pagado_aprobado';

  v_total := COALESCE(array_length(v_jugadores, 1), 0);
  IF v_total < 1 THEN
    RAISE EXCEPTION 'No hay inscriptos con pago aprobado para sortear flights.';
  END IF;

  IF v_total > 1 THEN
    FOR v_i IN REVERSE v_total..2 LOOP
      v_j := 1 + floor(random() * v_i)::int;
      v_tmp := v_jugadores[v_j];
      v_jugadores[v_j] := v_jugadores[v_i];
      v_jugadores[v_i] := v_tmp;
    END LOOP;
  END IF;

  DELETE FROM public.rondas_golf r
  WHERE r.torneo_id = p_torneo_id AND r.numero_ronda = p_numero_ronda;

  FOR v_idx IN 1..v_total LOOP
    INSERT INTO public.rondas_golf (torneo_id, jugador_id, cancha_id, numero_ronda, flight_numero, estado)
    VALUES (
      p_torneo_id,
      v_jugadores[v_idx],
      v_cancha_id,
      p_numero_ronda,
      CEIL(v_idx::numeric / v_tamano_flight::numeric)::integer,
      'programada'
    );
  END LOOP;

  v_flights := CEIL(v_total::numeric / v_tamano_flight::numeric)::integer;

  RETURN QUERY SELECT p_numero_ronda, v_flights, v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.sortear_flights_golf(bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sortear_flights_golf(bigint, integer) TO authenticated;

-- ── 5. cargar_hoyo_scorecard: el companero de flight ahora se     ──
--       determina por numero_ronda + flight_numero.
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
  -- (mismo torneo + numero_ronda + flight_numero), o el organizador.
  SELECT EXISTS (
    SELECT 1 FROM public.rondas_golf r
    WHERE r.torneo_id = v_ronda.torneo_id
      AND r.numero_ronda = v_ronda.numero_ronda
      AND r.flight_numero = v_ronda.flight_numero
      AND r.flight_numero IS NOT NULL
      AND r.jugador_id = v_caller
  ) INTO v_en_flight;

  IF NOT v_en_flight AND NOT public.puede_administrar_torneo(v_ronda.torneo_id) THEN
    RAISE EXCEPTION 'Solo el jugador o un companero de su mismo flight puede cargar este hoyo.';
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
    RAISE EXCEPTION 'Este hoyo ya fue confirmado. Para corregirlo, primero debe rechazarse la tarjeta completa.';
  END IF;

  RETURN v_row;
END;
$$;

-- ── 6. confirmar_scorecard_ronda: reemplaza la confirmacion       ──
--       hoyo por hoyo. Exige que los 18 hoyos ya tengan golpes
--       cargados; confirma o rechaza toda la tarjeta de una vez.
--       Quien juega la ronda nunca puede confirmar/rechazar su
--       propia tarjeta (salvo el organizador).
CREATE OR REPLACE FUNCTION public.confirmar_scorecard_ronda(
  p_ronda_id uuid,
  p_accion text
)
RETURNS public.rondas_golf
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ronda public.rondas_golf%ROWTYPE;
  v_en_flight boolean;
  v_puede_admin boolean;
  v_total_hoyos integer;
  v_cargados integer;
  v_caller uuid := auth.uid();
  v_row public.rondas_golf%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Se requiere autenticacion.';
  END IF;

  IF p_accion NOT IN ('confirmar', 'rechazar') THEN
    RAISE EXCEPTION 'Accion invalida: %. Debe ser confirmar o rechazar.', p_accion;
  END IF;

  SELECT * INTO v_ronda FROM public.rondas_golf WHERE id = p_ronda_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La ronda % no existe.', p_ronda_id;
  END IF;
  IF v_ronda.estado = 'finalizada' THEN
    RAISE EXCEPTION 'Esta ronda ya fue finalizada.';
  END IF;

  v_puede_admin := public.puede_administrar_torneo(v_ronda.torneo_id);

  SELECT EXISTS (
    SELECT 1 FROM public.rondas_golf r
    WHERE r.torneo_id = v_ronda.torneo_id
      AND r.numero_ronda = v_ronda.numero_ronda
      AND r.flight_numero = v_ronda.flight_numero
      AND r.flight_numero IS NOT NULL
      AND r.jugador_id = v_caller
  ) INTO v_en_flight;

  IF v_caller = v_ronda.jugador_id AND NOT v_puede_admin THEN
    RAISE EXCEPTION 'Quien juega la ronda no puede confirmar su propia tarjeta: necesita la validacion de un companero de flight.';
  END IF;

  IF NOT v_en_flight AND NOT v_puede_admin THEN
    RAISE EXCEPTION 'Solo un companero de flight o el organizador puede confirmar esta tarjeta.';
  END IF;

  SELECT c.cantidad_hoyos INTO v_total_hoyos
  FROM public.canchas c WHERE c.id = v_ronda.cancha_id;

  SELECT COUNT(*) INTO v_cargados
  FROM public.scorecard s
  WHERE s.ronda_id = v_ronda.id AND s.golpes_brutos IS NOT NULL;

  IF p_accion = 'confirmar' AND v_cargados < v_total_hoyos THEN
    RAISE EXCEPTION 'Todavia faltan cargar % de % hoyos.', (v_total_hoyos - v_cargados), v_total_hoyos;
  END IF;

  IF p_accion = 'rechazar' THEN
    UPDATE public.scorecard
    SET golpes_brutos  = NULL,
        golpes_netos   = NULL,
        estado         = 'pendiente',
        cargado_por    = NULL,
        confirmado_por = NULL,
        updated_at     = now()
    WHERE ronda_id = v_ronda.id;

    UPDATE public.rondas_golf SET estado = 'programada', updated_at = now()
    WHERE id = v_ronda.id
    RETURNING * INTO v_row;

    RETURN v_row;
  END IF;

  UPDATE public.scorecard
  SET estado = 'confirmado', confirmado_por = v_caller, updated_at = now()
  WHERE ronda_id = v_ronda.id;

  UPDATE public.rondas_golf SET estado = 'finalizada', updated_at = now()
  WHERE id = v_ronda.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_scorecard_ronda(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirmar_scorecard_ronda(uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.confirmar_hoyo_scorecard(uuid, text);

-- ── 7. crear_torneo_golf / actualizar_reglas_golf: exponer         ──
--       cantidad_rondas y tamano_flight (parametros nuevos al
--       final, con default, no rompe llamadas existentes).
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
  p_reglas_texto text DEFAULT NULL,
  p_cantidad_rondas integer DEFAULT 1,
  p_tamano_flight integer DEFAULT 4
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

  INSERT INTO public.torneo_golf_config (
    torneo_id, cancha_id, sistema_handicap, criterio_desempate, reglas_texto, cantidad_rondas, tamano_flight
  )
  VALUES (
    v_torneo_id,
    p_cancha_id,
    COALESCE(NULLIF(TRIM(p_sistema_handicap), ''), 'Course Handicap (stroke index por hoyo)'),
    COALESCE(NULLIF(TRIM(p_criterio_desempate), ''), 'Menor score neto total. En caso de empate, countback de los ultimos 9 hoyos.'),
    p_reglas_texto,
    GREATEST(1, COALESCE(p_cantidad_rondas, 1)),
    LEAST(GREATEST(2, COALESCE(p_tamano_flight, 4)), 6)
  );

  RETURN v_torneo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_torneo_golf(
  text, text, date, date, text, text, text, bigint, text, text, text, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_torneo_golf(
  text, text, date, date, text, text, text, bigint, text, text, text, integer, integer
) TO authenticated;

CREATE OR REPLACE FUNCTION public.actualizar_reglas_golf(
  p_torneo_id bigint,
  p_sistema_handicap text DEFAULT NULL,
  p_criterio_desempate text DEFAULT NULL,
  p_reglas_texto text DEFAULT NULL,
  p_cantidad_rondas integer DEFAULT NULL,
  p_tamano_flight integer DEFAULT NULL
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
      cantidad_rondas    = COALESCE(p_cantidad_rondas, cantidad_rondas),
      tamano_flight      = COALESCE(p_tamano_flight, tamano_flight),
      updated_at         = now()
  WHERE torneo_id = p_torneo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El torneo % no tiene configuracion de golf.', p_torneo_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_reglas_golf(bigint, text, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_reglas_golf(bigint, text, text, text, integer, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.actualizar_reglas_golf(bigint, text, text, text);
