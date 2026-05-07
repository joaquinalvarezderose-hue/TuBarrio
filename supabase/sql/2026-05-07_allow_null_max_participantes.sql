-- ============================================================
-- Modificar torneo_estado para permitir max_participantes NULL
-- NULL = sin límite máximo, valor numérico = límite máximo
-- ============================================================

-- Permitir NULL en max_participantes
ALTER TABLE public.torneo_estado
ALTER COLUMN max_participantes DROP NOT NULL;

-- Actualizar registros existentes que tengan max_participantes = 0 o muy bajo
-- para que sean NULL (sin límite)
UPDATE public.torneo_estado
SET max_participantes = NULL
WHERE max_participantes <= 0 OR max_participantes IS NULL;