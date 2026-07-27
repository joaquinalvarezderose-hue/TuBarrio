-- ============================================================
-- RPCs de administracion de torneo para admin/organizador.
--
-- No existe hoy ningun flujo de creacion de torneos desde el frontend
-- (se crean pegando SQL a mano). crear_torneo() es la primera via
-- oficial, y la unica que setea creado_por correctamente.
--
-- torneos.activo (via archivar_torneo) sigue siendo el mecanismo real
-- de archivado/ocultamiento ya usado por Tournaments.tsx. Un
-- organizador nunca obtiene DELETE sobre torneos (permission
-- inalterada, solo admin) -- archivar_torneo es el unico camino para
-- "dar de baja" un torneo propio.
-- ============================================================

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
  p_cantidad_mejores_terceros integer DEFAULT NULL
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

  INSERT INTO public.torneos (titulo, subtitulo, fecha_inicio, fecha_fin, imagen_url, activo, creado_por)
  VALUES (
    v_titulo,
    COALESCE(NULLIF(TRIM(p_subtitulo), ''), v_titulo),
    p_fecha_inicio,
    p_fecha_fin,
    p_imagen_url,
    true,
    auth.uid()
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
  text, text, date, date, text, text, integer, integer, integer, integer, integer, boolean, boolean, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_torneo(
  text, text, date, date, text, text, integer, integer, integer, integer, integer, boolean, boolean, integer
) TO authenticated;


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
  p_cantidad_mejores_terceros integer DEFAULT NULL
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

  UPDATE public.torneos
  SET titulo        = COALESCE(NULLIF(TRIM(p_titulo), ''), titulo),
      subtitulo     = COALESCE(NULLIF(TRIM(p_subtitulo), ''), subtitulo),
      fecha_inicio  = COALESCE(p_fecha_inicio, fecha_inicio),
      fecha_fin     = COALESCE(p_fecha_fin, fecha_fin),
      imagen_url    = COALESCE(p_imagen_url, imagen_url),
      updated_at    = now()
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
  bigint, text, text, date, date, text, integer, integer, integer, integer, integer, boolean, boolean, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_configuracion_torneo(
  bigint, text, text, date, date, text, integer, integer, integer, integer, integer, boolean, boolean, integer
) TO authenticated;


CREATE OR REPLACE FUNCTION public.archivar_torneo(
  p_torneo_id bigint,
  p_activo boolean,
  p_cancelado boolean DEFAULT NULL
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

  UPDATE public.torneos
  SET activo     = COALESCE(p_activo, activo),
      cancelado  = COALESCE(p_cancelado, cancelado),
      updated_at = now()
  WHERE id = p_torneo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.archivar_torneo(bigint, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archivar_torneo(bigint, boolean, boolean) TO authenticated;
