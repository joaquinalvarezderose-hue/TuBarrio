-- Permite ocultar torneos de prueba del selector del Panel Admin sin borrarlos
-- ni tocar su visibilidad para jugadores (Tournaments.tsx no usa esta columna).
ALTER TABLE public.torneos
  ADD COLUMN IF NOT EXISTS mostrar_en_panel_admin boolean NOT NULL DEFAULT true;

UPDATE public.torneos
SET mostrar_en_panel_admin = false
WHERE id IN (2, 18, 19, 23, 26, 28);
