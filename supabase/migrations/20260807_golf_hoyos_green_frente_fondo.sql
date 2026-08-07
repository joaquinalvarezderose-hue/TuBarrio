-- ------------------------------------------------------------
-- Coordenadas de frente y fondo del green, ademas del centro
-- (green_lat/green_lng ya existente), para mostrar en el mapa
-- satelital las 3 distancias estandar de golf (frente/centro/fondo)
-- en vez de una sola distancia al green. Nullable: un hoyo sin
-- estos 2 puntos sigue mostrando solo la distancia al centro
-- (comportamiento actual, sin romper nada).
--
-- Sin cambios de RLS: la policy "hoyos_update_admin"
-- (20260728_golf_module_rls.sql) ya permite UPDATE de cualquier
-- columna por admin, mismo patron que tee_lat/green_lat.
-- ------------------------------------------------------------

ALTER TABLE public.hoyos
  ADD COLUMN IF NOT EXISTS green_front_lat double precision,
  ADD COLUMN IF NOT EXISTS green_front_lng double precision,
  ADD COLUMN IF NOT EXISTS green_back_lat double precision,
  ADD COLUMN IF NOT EXISTS green_back_lng double precision;

COMMENT ON COLUMN public.hoyos.green_lat IS 'Latitud del centro del green (pin de referencia para range rings y distancia). Requerido junto con tee_lat/tee_lng para el mapa satelital interactivo.';
COMMENT ON COLUMN public.hoyos.green_lng IS 'Longitud del centro del green.';
COMMENT ON COLUMN public.hoyos.green_front_lat IS 'Latitud del frente del green (borde mas cercano al tee). Opcional: habilita la distancia "frente" en el mapa satelital.';
COMMENT ON COLUMN public.hoyos.green_front_lng IS 'Longitud del frente del green.';
COMMENT ON COLUMN public.hoyos.green_back_lat IS 'Latitud del fondo del green (borde mas lejano al tee). Opcional: habilita la distancia "fondo" en el mapa satelital.';
COMMENT ON COLUMN public.hoyos.green_back_lng IS 'Longitud del fondo del green.';
