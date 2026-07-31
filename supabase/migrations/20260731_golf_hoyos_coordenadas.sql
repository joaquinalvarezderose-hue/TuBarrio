-- ------------------------------------------------------------
-- Coordenadas de tee y green por hoyo, para el mapa satelital
-- interactivo (Leaflet + range rings). Nullable: un hoyo sin
-- coordenadas cargadas sigue mostrando el fallback de imagen
-- estatica (mapa_url) o el placeholder, sin romper nada.
--
-- Sin cambios de RLS ni de RPCs: la policy "hoyos_update_admin"
-- (20260728_golf_module_rls.sql) ya permite UPDATE directo por
-- admin, mismo patron que ya usa GolfCanchaForm.tsx para mapa_url.
-- ------------------------------------------------------------

ALTER TABLE public.hoyos
  ADD COLUMN IF NOT EXISTS tee_lat double precision,
  ADD COLUMN IF NOT EXISTS tee_lng double precision,
  ADD COLUMN IF NOT EXISTS green_lat double precision,
  ADD COLUMN IF NOT EXISTS green_lng double precision;

COMMENT ON COLUMN public.hoyos.tee_lat IS 'Latitud del tee. Junto con tee_lng/green_lat/green_lng habilita el mapa satelital interactivo del hoyo (fallback: mapa_url).';
COMMENT ON COLUMN public.hoyos.tee_lng IS 'Longitud del tee.';
COMMENT ON COLUMN public.hoyos.green_lat IS 'Latitud del green (pin de referencia para range rings y distancia).';
COMMENT ON COLUMN public.hoyos.green_lng IS 'Longitud del green.';
