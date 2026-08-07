-- ------------------------------------------------------------
-- Coordenadas de la bandera (posicion del pin del dia), separadas
-- de green_lat/lng (centro fijo de referencia del green). A
-- diferencia de tee/green/frente/fondo, que son geometria fija de
-- la cancha, la bandera se mueve de ronda en ronda y el admin la
-- actualiza cuando corresponda. Nullable: sin bandera cargada, el
-- mapa sigue mostrando tee/green como hasta ahora.
-- ------------------------------------------------------------

ALTER TABLE public.hoyos
  ADD COLUMN IF NOT EXISTS flag_lat double precision,
  ADD COLUMN IF NOT EXISTS flag_lng double precision;

COMMENT ON COLUMN public.hoyos.flag_lat IS 'Latitud de la bandera (posicion del pin del dia dentro del green). Opcional y editable por ronda, a diferencia de green_lat que es el centro fijo de referencia.';
COMMENT ON COLUMN public.hoyos.flag_lng IS 'Longitud de la bandera.';
