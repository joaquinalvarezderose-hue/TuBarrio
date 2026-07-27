-- ============================================================
-- Helpers de autorizacion para el rol "organizador".
--
-- is_organizador(): mismo patron que is_admin(), chequea rol='organizador'.
--
-- puede_administrar_torneo(p_torneo_id): funcion unica de la que dependen
-- TODAS las policies RLS y RPCs de administracion de torneo (20260727_07
-- y 20260727_08). Mantener la logica de "quien puede tocar este torneo"
-- en un solo lugar auditable, en vez de repetirla inline en cada policy.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_organizador()
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
      AND COALESCE(p.rol, '') = 'organizador'
  );
$$;

REVOKE ALL ON FUNCTION public.is_organizador() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_organizador() TO authenticated;

-- true si sos admin, o si sos organizador y sos el creado_por de ESE torneo.
CREATE OR REPLACE FUNCTION public.puede_administrar_torneo(p_torneo_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR (
      public.is_organizador()
      AND EXISTS (
        SELECT 1 FROM public.torneos t
        WHERE t.id = p_torneo_id AND t.creado_por = auth.uid()
      )
    );
$$;

REVOKE ALL ON FUNCTION public.puede_administrar_torneo(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_administrar_torneo(bigint) TO authenticated;
