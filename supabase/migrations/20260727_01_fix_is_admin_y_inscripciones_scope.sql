-- ============================================================
-- FIX DE SEGURIDAD PREEXISTENTE (paso 0, independiente del rol organizador)
--
-- public.is_admin() trataba rol = 'organizador' como admin total:
--   coalesce(p.rol, '') in ('admin', 'organizador')
-- Como is_admin() gatea las policies de torneos, partidos, torneo_jugadores,
-- torneo_equipos, perfiles, etc., el dia que alguien tuviera rol='organizador'
-- obtendria admin global instantaneo sobre TODA la plataforma.
--
-- Nota: se verifico contra la base real (no solo el repo) que las policies
-- de inscripciones_torneo (inscripciones_select_own, inscripciones_admin_update)
-- ya usan is_admin() correctamente, sin equivalencia 'admin'/'organizador'
-- inline -- el acotamiento por torneo para esas dos policies se agrega
-- despues, en 20260727_07, sobre sus nombres reales.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.rol, '') = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
