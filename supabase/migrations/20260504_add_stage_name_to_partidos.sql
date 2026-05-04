-- ============================================================
-- Add stage_name column to partidos table
-- ============================================================

-- Add stage_name column to store the tournament stage (Final, Semifinal, etc.)
ALTER TABLE public.partidos 
ADD COLUMN stage_name TEXT;

-- Create function to automatically update stage_name when bracket matches are created/updated
CREATE OR REPLACE FUNCTION public.update_stage_name_for_partidos()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update for bracket matches
  IF NEW.bracket_tipo = 'eliminacion_directa' AND NEW.ronda IS NOT NULL THEN
    -- Get total rounds for this tournament
    DECLARE
      v_total_rondas INTEGER;
      v_stage_name TEXT;
    BEGIN
      SELECT MAX(ronda) INTO v_total_rondas
      FROM public.partidos
      WHERE torneo_id = NEW.torneo_id
        AND bracket_tipo = 'eliminacion_directa';
      
      -- Calculate stage based on round position
      IF v_total_rondas IS NOT NULL THEN
        CASE 
          -- Final: highest round number
          WHEN NEW.ronda = v_total_rondas THEN
            v_stage_name := 'Final';
          -- Semifinal: second highest round (for tournaments with 3+ rounds)
          WHEN NEW.ronda = v_total_rondas - 1 AND v_total_rondas >= 3 THEN
            v_stage_name := 'Semifinal';
          -- Quarter-finals: third highest round (for tournaments with 4+ rounds)
          WHEN NEW.ronda = v_total_rondas - 2 AND v_total_rondas >= 4 THEN
            v_stage_name := 'Cuartos de Final';
          -- Round of 16: fourth highest round (for tournaments with 5+ rounds)
          WHEN NEW.ronda = v_total_rondas - 3 AND v_total_rondas >= 5 THEN
            v_stage_name := 'Octavos de Final';
          -- Round of 32: fifth highest round (for tournaments with 6+ rounds)
          WHEN NEW.ronda = v_total_rondas - 4 AND v_total_rondas >= 6 THEN
            v_stage_name := 'Dieciseisavos de Final';
          -- Fallback for small tournaments
          ELSE
            CASE NEW.ronda
              WHEN 1 THEN 
                CASE v_total_rondas
                  WHEN 1 THEN v_stage_name := 'Final';
                  WHEN 2 THEN v_stage_name := 'Semifinal';
                  ELSE v_stage_name := 'Primera Ronda';
                END CASE;
              WHEN 2 THEN 
                CASE v_total_rondas
                  WHEN 2 THEN v_stage_name := 'Final';
                  WHEN 3 THEN v_stage_name := 'Semifinal';
                  ELSE v_stage_name := 'Segunda Ronda';
                END CASE;
              ELSE
                v_stage_name := 'Ronda ' || NEW.ronda;
            END CASE;
        END CASE;
        
        NEW.stage_name := v_stage_name;
      END IF;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update stage_name
DROP TRIGGER IF EXISTS trigger_update_stage_name ON public.partidos;
CREATE TRIGGER trigger_update_stage_name
  BEFORE INSERT OR UPDATE ON public.partidos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_stage_name_for_partidos();

-- Update existing partidos to have stage_name
UPDATE public.partidos p
SET stage_name = CASE 
  WHEN p.bracket_tipo = 'eliminacion_directa' AND p.ronda IS NOT NULL THEN
    (SELECT 
      CASE 
        WHEN p.ronda = max_rondas.max_ronda THEN 'Final'
        WHEN p.ronda = max_rondas.max_ronda - 1 AND max_rondas.max_ronda >= 3 THEN 'Semifinal'
        WHEN p.ronda = max_rondas.max_ronda - 2 AND max_rondas.max_ronda >= 4 THEN 'Cuartos de Final'
        WHEN p.ronda = max_rondas.max_ronda - 3 AND max_rondas.max_ronda >= 5 THEN 'Octavos de Final'
        WHEN p.ronda = max_rondas.max_ronda - 4 AND max_rondas.max_ronda >= 6 THEN 'Dieciseisavos de Final'
        ELSE 'Ronda ' || p.ronda
      END
     FROM (SELECT MAX(ronda) as max_ronda 
           FROM public.partidos 
           WHERE torneo_id = p.torneo_id 
             AND bracket_tipo = 'eliminacion_directa') max_rondas)
  ELSE NULL
END
WHERE p.bracket_tipo = 'eliminacion_directa' AND p.ronda IS NOT NULL;
