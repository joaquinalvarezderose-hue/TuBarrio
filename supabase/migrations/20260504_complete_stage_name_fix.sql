-- ============================================================
-- Complete stage_name implementation - All in one migration
-- ============================================================

-- Add stage_name column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'partidos' 
        AND column_name = 'stage_name'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.partidos ADD COLUMN stage_name TEXT;
    END IF;
END $$;

-- Create function to calculate stage name
CREATE OR REPLACE FUNCTION public.calculate_stage_name(p_torneo_id BIGINT, p_ronda INTEGER)
RETURNS TEXT AS $$
DECLARE
    v_total_rondas INTEGER;
BEGIN
    -- Get total rounds for this tournament
    SELECT MAX(ronda) INTO v_total_rondas
    FROM public.partidos
    WHERE torneo_id = p_torneo_id
      AND bracket_tipo = 'eliminacion_directa'
      AND ronda IS NOT NULL;
    
    -- Calculate stage based on round position
    IF v_total_rondas IS NULL OR p_ronda IS NULL THEN
        RETURN NULL;
    END IF;
    
    CASE 
        WHEN p_ronda = v_total_rondas THEN RETURN 'Final';
        WHEN p_ronda = v_total_rondas - 1 AND v_total_rondas >= 3 THEN RETURN 'Semifinal';
        WHEN p_ronda = v_total_rondas - 2 AND v_total_rondas >= 4 THEN RETURN 'Cuartos de Final';
        WHEN p_ronda = v_total_rondas - 3 AND v_total_rondas >= 5 THEN RETURN 'Octavos de Final';
        WHEN p_ronda = v_total_rondas - 4 AND v_total_rondas >= 6 THEN RETURN 'Dieciseisavos de Final';
        ELSE RETURN 'Ronda ' || p_ronda;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger and function if they exist
DROP FUNCTION IF EXISTS public.update_stage_name_for_partidos() CASCADE;
DROP TRIGGER IF EXISTS trigger_update_stage_name ON public.partidos;

-- Create trigger function
CREATE OR REPLACE FUNCTION public.update_stage_name_for_partidos()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update for bracket matches
    IF NEW.bracket_tipo = 'eliminacion_directa' AND NEW.ronda IS NOT NULL THEN
        NEW.stage_name := public.calculate_stage_name(NEW.torneo_id, NEW.ronda);
    ELSE
        NEW.stage_name := NULL;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trigger_update_stage_name
  BEFORE INSERT OR UPDATE ON public.partidos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_stage_name_for_partidos();

-- Update existing partidos
UPDATE public.partidos 
SET stage_name = public.calculate_stage_name(torneo_id, ronda)
WHERE bracket_tipo = 'eliminacion_directa' 
  AND ronda IS NOT NULL;

-- Update RLS policies
DROP POLICY IF EXISTS "partidos_select_autenticado" ON public.partidos;
CREATE POLICY "partidos_select_autenticado"
  ON public.partidos
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "partidos_select_admin" ON public.partidos;
CREATE POLICY "partidos_select_admin"
  ON public.partidos
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Grant explicit permission
GRANT SELECT (stage_name) ON public.partidos TO authenticated;

-- Set functions to SECURITY DEFINER
ALTER FUNCTION public.update_stage_name_for_partidos() SECURITY DEFINER;
ALTER FUNCTION public.calculate_stage_name(BIGINT, INTEGER) SECURITY DEFINER;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_partidos_stage_name ON public.partidos(stage_name) WHERE stage_name IS NOT NULL;

-- Test the function
DO $$
BEGIN
  PERFORM public.calculate_stage_name(torneo_id, ronda)
  FROM public.partidos
  WHERE bracket_tipo = 'eliminacion_directa'
  LIMIT 1;
  
  RAISE NOTICE 'Stage name implementation completed successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Stage name test failed: %', SQLERRM;
END $$;
