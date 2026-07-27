-- ============================================================
-- FIX DE SEGURIDAD PREEXISTENTE: auto-escalacion de privilegios.
--
-- La policy "perfiles_update_own_or_admin" permite a cualquier usuario
-- autenticado actualizar su propia fila sin restriccion de columna:
--   using (id = auth.uid() OR is_admin())
-- Hoy, cualquier usuario logueado puede hacer
--   UPDATE perfiles SET rol = 'admin' WHERE id = auth.uid()
-- via supabase-js directo, y la policy lo deja pasar.
--
-- Este trigger bloquea cualquier cambio a la columna `rol` que no sea
-- ejecutado por un admin real. A partir de aca, la unica forma de
-- cambiar `rol` es a traves del RPC admin-only asignar_rol_organizador
-- (20260727_06), que corre SECURITY DEFINER pero preserva auth.uid()
-- del admin que lo invoco, asi que sigue pasando este gate.
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.rol IS DISTINCT FROM OLD.rol AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado para cambiar el rol de un perfil.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_perfiles_rol_lockdown ON public.perfiles;
CREATE TRIGGER trg_perfiles_rol_lockdown
  BEFORE UPDATE ON public.perfiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_role_escalation();
