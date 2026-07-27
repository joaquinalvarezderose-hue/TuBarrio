-- ============================================================
-- Unico camino sancionado para otorgar/revocar el rol organizador.
-- Admin-only. Hardcodeada para setear EXCLUSIVAMENTE 'organizador' o
-- revertir a 'jugador' -- nunca acepta 'admin' como destino, para que
-- ni un bug de UI pueda usarla para crear administradores nuevos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.asignar_rol_organizador(
  p_perfil_id uuid,
  p_activar boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permiso denegado: solo admin puede asignar el rol organizador.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.perfiles WHERE id = p_perfil_id) THEN
    RAISE EXCEPTION 'Perfil no encontrado: %', p_perfil_id;
  END IF;

  -- No tocar perfiles que ya son admin: esta funcion nunca debe poder
  -- degradar (ni, mucho menos, otorgar) el rol admin.
  IF EXISTS (
    SELECT 1 FROM public.perfiles WHERE id = p_perfil_id AND COALESCE(rol, '') = 'admin'
  ) THEN
    RAISE EXCEPTION 'No se puede modificar el rol de un admin desde esta funcion.';
  END IF;

  UPDATE public.perfiles
  SET rol = CASE WHEN p_activar THEN 'organizador' ELSE 'jugador' END
  WHERE id = p_perfil_id;
END;
$$;

REVOKE ALL ON FUNCTION public.asignar_rol_organizador(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asignar_rol_organizador(uuid, boolean) TO authenticated;
