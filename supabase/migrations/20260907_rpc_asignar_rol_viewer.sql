-- ============================================================
-- Rol "viewer": puede ver el Panel Admin (rankings, tablas, etc.)
-- pero no puede ejecutar ninguna accion. Como puede_administrar_torneo()
-- solo reconoce 'admin' y 'organizador', un perfil con rol='viewer' nunca
-- pasa ningun gate de mutacion (RLS ni RPC), aunque hubiera un bug de UI.
--
-- Unico camino sancionado para otorgar/revocar este rol. Admin-only.
-- Hardcodeada para setear EXCLUSIVAMENTE 'viewer' o revertir a 'jugador'
-- -- nunca toca perfiles que ya son admin u organizador, para no pisar
-- por accidente un rol con permisos de gestion real.
-- ============================================================

CREATE OR REPLACE FUNCTION public.asignar_rol_viewer(
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
    RAISE EXCEPTION 'Permiso denegado: solo admin puede asignar el rol viewer.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.perfiles WHERE id = p_perfil_id) THEN
    RAISE EXCEPTION 'Perfil no encontrado: %', p_perfil_id;
  END IF;

  -- No tocar perfiles que ya son admin u organizador: esta funcion nunca
  -- debe poder otorgar admin ni degradar a alguien con permisos de gestion.
  IF EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE id = p_perfil_id AND COALESCE(rol, '') IN ('admin', 'organizador')
  ) THEN
    RAISE EXCEPTION 'No se puede modificar el rol de un admin u organizador desde esta funcion.';
  END IF;

  UPDATE public.perfiles
  SET rol = CASE WHEN p_activar THEN 'viewer' ELSE 'jugador' END
  WHERE id = p_perfil_id;
END;
$$;

REVOKE ALL ON FUNCTION public.asignar_rol_viewer(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.asignar_rol_viewer(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.asignar_rol_viewer(uuid, boolean) TO authenticated;
