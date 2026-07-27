-- ============================================================
-- Ownership de torneos: base para el scoping por-torneo del rol
-- organizador. creado_por se setea automaticamente en crear_torneo()
-- (20260727_05) y define de que torneos es dueno un organizador.
--
-- Los 5 torneos legacy quedan con creado_por = NULL: no tienen
-- organizador dueno, solo admin puede administrarlos (comportamiento
-- identico al actual, sin cambios).
--
-- `cancelado` (junto con el `activo` ya existente desde
-- 20260504_add_activo_to_torneos.sql, que ya es el mecanismo real de
-- archivado usado por Tournaments.tsx) permite distinguir "archivado"
-- de "cancelado" sin introducir un tercer concepto de "estado" que
-- colisionaria semanticamente con torneo_estado.estado (que trackea
-- otra cosa, por torneo+categoria+grupo).
-- ============================================================

ALTER TABLE public.torneos
  ADD COLUMN IF NOT EXISTS creado_por uuid REFERENCES public.perfiles(id),
  ADD COLUMN IF NOT EXISTS cancelado boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_torneos_creado_por ON public.torneos (creado_por);

-- Defensa en profundidad: ni un admin desde la UI ni un organizador
-- deben poder "transferir" un torneo cambiando creado_por directamente
-- via UPDATE (la policy RLS de torneos, extendida en 20260727_07, evalua
-- ownership contra el estado persistido, no contra el valor nuevo dentro
-- del mismo UPDATE, asi que este trigger es la unica barrera real contra
-- ese cambio de columna especifico).
CREATE OR REPLACE FUNCTION public.prevent_torneo_ownership_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.creado_por IS DISTINCT FROM OLD.creado_por AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado para cambiar el creador de un torneo.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_torneos_ownership_lockdown ON public.torneos;
CREATE TRIGGER trg_torneos_ownership_lockdown
  BEFORE UPDATE ON public.torneos
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_torneo_ownership_transfer();
