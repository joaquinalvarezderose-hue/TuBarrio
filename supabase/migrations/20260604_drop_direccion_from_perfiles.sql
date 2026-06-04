-- Drop and rebuild the view that references the direccion column
DROP VIEW IF EXISTS public.perfiles_publicos;

ALTER TABLE public.perfiles DROP COLUMN IF EXISTS direccion;

-- Rebuild perfiles_publicos without direccion (home address details are private)
CREATE VIEW public.perfiles_publicos
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.nombre_completo,
  CASE
    WHEN public.is_admin() OR p.id = auth.uid() THEN p.email
    ELSE NULL
  END AS email,
  CASE
    WHEN public.is_admin() OR p.id = auth.uid() THEN p.whatsapp
    WHEN EXISTS (
      SELECT 1 FROM public.partidos m
      WHERE (m.jugador1_id = p.id AND m.jugador2_id = auth.uid())
         OR (m.jugador2_id = p.id AND m.jugador1_id = auth.uid())
    ) THEN p.whatsapp
    ELSE NULL
  END AS whatsapp,
  p.rol,
  p.created_at
FROM public.perfiles p;

GRANT SELECT ON public.perfiles_publicos TO authenticated;
