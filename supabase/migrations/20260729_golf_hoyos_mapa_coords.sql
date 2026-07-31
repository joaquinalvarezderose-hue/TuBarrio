-- ============================================================
-- Coordenadas del mapa interactivo de cada hoyo (tee/green/canvas
-- de Figma), para dibujar la linea tee->green sobre mapa_url.
--
-- Se guarda como jsonb en vez de columnas sueltas porque es un
-- dato de UI (no se filtra/agrega por SQL en ningun lado) y asi
-- el shape queda pegado a GolfHoleMapData del frontend
-- (components/golf/GolfHoleMap.tsx) sin duplicar columnas.
--
-- RLS: no hace falta politica nueva. hoyos_select_autenticado ya
-- permite leer todas las columnas, y hoyos_update_admin ya permite
-- que un admin actualice mapa_coords igual que mapa_url.
-- ============================================================

ALTER TABLE public.hoyos ADD COLUMN IF NOT EXISTS mapa_coords jsonb;

DROP FUNCTION IF EXISTS public._validar_mapa_coords(jsonb);
CREATE FUNCTION public._validar_mapa_coords(v jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT v IS NULL OR (
    jsonb_typeof(v -> 'canvas') = 'object'
    AND jsonb_typeof(v -> 'canvas' -> 'width') = 'number'
    AND jsonb_typeof(v -> 'canvas' -> 'height') = 'number'
    AND jsonb_typeof(v -> 'tee') = 'object'
    AND jsonb_typeof(v -> 'tee' -> 'x') = 'number'
    AND jsonb_typeof(v -> 'tee' -> 'y') = 'number'
    AND jsonb_typeof(v -> 'green') = 'object'
    AND jsonb_typeof(v -> 'green' -> 'x') = 'number'
    AND jsonb_typeof(v -> 'green' -> 'y') = 'number'
    AND jsonb_typeof(v -> 'distancia') = 'number'
  );
$$;

ALTER TABLE public.hoyos DROP CONSTRAINT IF EXISTS hoyos_mapa_coords_shape;
ALTER TABLE public.hoyos ADD CONSTRAINT hoyos_mapa_coords_shape
  CHECK (public._validar_mapa_coords(mapa_coords));

COMMENT ON COLUMN public.hoyos.mapa_coords IS
  'Coordenadas del mapa interactivo (tee/green/canvas/distancia) en el mismo shape que GolfHoleMapData del frontend. Null = sin overlay interactivo, solo se muestra mapa_url como imagen estatica.';
