-- ============================================================
-- torneos.precio_expensas / torneos.precio_transferencia
--
-- Antes, la pantalla de pago (Payment.tsx) tenia estos montos
-- hardcodeados ($5.000 expensas / $45.000 a transferir). Ahora
-- son una fila mas de torneos, editables por admin/organizador
-- via crear_torneo / actualizar_configuracion_torneo.
--
-- (Ya aplicado en Supabase remoto en 4 pasos incrementales el
-- 2026-07-28: torneos_montos_pago, torneos_montos_pago_rpcs,
-- torneos_rename_precio_columns_v2/v3. Este archivo documenta
-- el estado final coherente para quien lea el repo.)
-- ============================================================

ALTER TABLE public.torneos
  ADD COLUMN IF NOT EXISTS precio_expensas numeric(10,2) NOT NULL DEFAULT 5000 CHECK (precio_expensas >= 0),
  ADD COLUMN IF NOT EXISTS precio_transferencia numeric(10,2) NOT NULL DEFAULT 45000 CHECK (precio_transferencia >= 0);

DROP FUNCTION IF EXISTS public.crear_torneo(
  text, text, date, date, text, text, integer, integer, integer, integer, integer, boolean, boolean, integer
);
DROP FUNCTION IF EXISTS public.crear_torneo(
  text, text, date, date, text, text, integer, integer, integer, integer, integer, boolean, boolean, integer, numeric, numeric
);

CREATE OR REPLACE FUNCTION public.crear_torneo(
  p_titulo text,
  p_subtitulo text DEFAULT NULL,
  p_fecha_inicio date DEFAULT NULL,
  p_fecha_fin date DEFAULT NULL,
  p_imagen_url text DEFAULT NULL,
  p_modalidad text DEFAULT 'singles',
  p_max_participantes_por_grupo integer DEFAULT 4,
  p_min_participantes_por_grupo integer DEFAULT 2,
  p_numero_grupos integer DEFAULT NULL,
  p_max_participantes_total integer DEFAULT NULL,
  p_clasificados_por_grupo integer DEFAULT 2,
  p_crear_playoffs_eliminacion_directa boolean DEFAULT false,
  p_incluir_mejores_terceros boolean DEFAULT false,
  p_cantidad_mejores_terceros integer DEFAULT NULL,
  p_precio_expensas numeric DEFAULT 5000,
  p_precio_transferencia numeric DEFAULT 45000
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_torneo_id bigint;
  v_titulo    text;
BEGIN
  IF NOT (public.is_admin() OR public.is_organizador()) THEN
    RAISE EXCEPTION 'Permiso denegado: solo admin u organizador puede crear torneos.';
  END IF;

  v_titulo := NULLIF(TRIM(COALESCE(p_titulo, '')), '');
  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'El titulo es obligatorio.';
  END IF;

  IF p_modalidad NOT IN ('singles', 'dobles') THEN
    RAISE EXCEPTION 'Modalidad invalida: %. Debe ser singles o dobles.', p_modalidad;
  END IF;

  IF COALESCE(p_precio_expensas, 0) < 0 OR COALESCE(p_precio_transferencia, 0) < 0 THEN
    RAISE EXCEPTION 'Los montos no pueden ser negativos.';
  END IF;

  INSERT INTO public.torneos (
    titulo, subtitulo, fecha_inicio, fecha_fin, imagen_url, activo, creado_por,
    precio_expensas, precio_transferencia
  )
  VALUES (
    v_titulo,
    COALESCE(NULLIF(TRIM(p_subtitulo), ''), v_titulo),
    p_fecha_inicio,
    p_fecha_fin,
    p_imagen_url,
    true,
    auth.uid(),
    COALESCE(p_precio_expensas, 5000),
    COALESCE(p_precio_transferencia, 45000)
  )
  RETURNING id INTO v_torneo_id;

  -- trg_create_torneo_configuracion_on_insert ya inserto la fila default
  -- en torneo_configuracion; la completamos con los valores elegidos.
  UPDATE public.torneo_configuracion
  SET modalidad                           = p_modalidad,
      max_participantes_por_grupo         = GREATEST(2, COALESCE(p_max_participantes_por_grupo, 4)),
      min_participantes_por_grupo         = p_min_participantes_por_grupo,
      numero_grupos                       = p_numero_grupos,
      max_participantes_total             = p_max_participantes_total,
      clasificados_por_grupo              = GREATEST(1, COALESCE(p_clasificados_por_grupo, 2)),
      crear_playoffs_eliminacion_directa  = COALESCE(p_crear_playoffs_eliminacion_directa, false),
      incluir_mejores_terceros            = COALESCE(p_incluir_mejores_terceros, false),
      cantidad_mejores_terceros           = p_cantidad_mejores_terceros,
      updated_at                          = now()
  WHERE torneo_id = v_torneo_id;

  RETURN v_torneo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_torneo(
  text, text, date, date, text, text, integer, integer, integer, integer, integer, boolean, boolean, integer, numeric, numeric
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crear_torneo(
  text, text, date, date, text, text, integer, integer, integer, integer, integer, boolean, boolean, integer, numeric, numeric
) FROM anon;
GRANT EXECUTE ON FUNCTION public.crear_torneo(
  text, text, date, date, text, text, integer, integer, integer, integer, integer, boolean, boolean, integer, numeric, numeric
) TO authenticated;


DROP FUNCTION IF EXISTS public.actualizar_configuracion_torneo(
  bigint, text, text, date, date, text, integer, integer, integer, integer, integer, boolean, boolean, integer
);
DROP FUNCTION IF EXISTS public.actualizar_configuracion_torneo(
  bigint, text, text, date, date, text, integer, integer, integer, integer, integer, boolean, boolean, integer, numeric, numeric
);

CREATE OR REPLACE FUNCTION public.actualizar_configuracion_torneo(
  p_torneo_id bigint,
  p_titulo text DEFAULT NULL,
  p_subtitulo text DEFAULT NULL,
  p_fecha_inicio date DEFAULT NULL,
  p_fecha_fin date DEFAULT NULL,
  p_imagen_url text DEFAULT NULL,
  p_max_participantes_por_grupo integer DEFAULT NULL,
  p_min_participantes_por_grupo integer DEFAULT NULL,
  p_numero_grupos integer DEFAULT NULL,
  p_max_participantes_total integer DEFAULT NULL,
  p_clasificados_por_grupo integer DEFAULT NULL,
  p_crear_playoffs_eliminacion_directa boolean DEFAULT NULL,
  p_incluir_mejores_terceros boolean DEFAULT NULL,
  p_cantidad_mejores_terceros integer DEFAULT NULL,
  p_precio_expensas numeric DEFAULT NULL,
  p_precio_transferencia numeric DEFAULT NULL
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

  IF p_precio_expensas IS NOT NULL AND p_precio_expensas < 0 THEN
    RAISE EXCEPTION 'El monto de expensas no puede ser negativo.';
  END IF;
  IF p_precio_transferencia IS NOT NULL AND p_precio_transferencia < 0 THEN
    RAISE EXCEPTION 'El monto a transferir no puede ser negativo.';
  END IF;

  UPDATE public.torneos
  SET titulo                = COALESCE(NULLIF(TRIM(p_titulo), ''), titulo),
      subtitulo             = COALESCE(NULLIF(TRIM(p_subtitulo), ''), subtitulo),
      fecha_inicio          = COALESCE(p_fecha_inicio, fecha_inicio),
      fecha_fin             = COALESCE(p_fecha_fin, fecha_fin),
      imagen_url            = COALESCE(p_imagen_url, imagen_url),
      precio_expensas       = COALESCE(p_precio_expensas, precio_expensas),
      precio_transferencia  = COALESCE(p_precio_transferencia, precio_transferencia),
      updated_at            = now()
  WHERE id = p_torneo_id;

  UPDATE public.torneo_configuracion
  SET max_participantes_por_grupo        = COALESCE(p_max_participantes_por_grupo, max_participantes_por_grupo),
      min_participantes_por_grupo        = COALESCE(p_min_participantes_por_grupo, min_participantes_por_grupo),
      numero_grupos                      = COALESCE(p_numero_grupos, numero_grupos),
      max_participantes_total            = COALESCE(p_max_participantes_total, max_participantes_total),
      clasificados_por_grupo             = COALESCE(p_clasificados_por_grupo, clasificados_por_grupo),
      crear_playoffs_eliminacion_directa = COALESCE(p_crear_playoffs_eliminacion_directa, crear_playoffs_eliminacion_directa),
      incluir_mejores_terceros           = COALESCE(p_incluir_mejores_terceros, incluir_mejores_terceros),
      cantidad_mejores_terceros          = COALESCE(p_cantidad_mejores_terceros, cantidad_mejores_terceros),
      updated_at                         = now()
  WHERE torneo_id = p_torneo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_configuracion_torneo(
  bigint, text, text, date, date, text, integer, integer, integer, integer, integer, boolean, boolean, integer, numeric, numeric
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.actualizar_configuracion_torneo(
  bigint, text, text, date, date, text, integer, integer, integer, integer, integer, boolean, boolean, integer, numeric, numeric
) FROM anon;
GRANT EXECUTE ON FUNCTION public.actualizar_configuracion_torneo(
  bigint, text, text, date, date, text, integer, integer, integer, integer, integer, boolean, boolean, integer, numeric, numeric
) TO authenticated;
