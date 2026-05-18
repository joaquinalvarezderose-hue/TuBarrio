-- ============================================================
-- Tournament Champion Persistence & Auto-Archive
--
-- Changes:
-- 1. torneo_estado: add campeon_perfil_id column
-- 2. promover_ganador_bracket: store champion and set torneos.activo = false at Final
-- ============================================================


-- ============================================================
-- 1. Add campeon_perfil_id to torneo_estado
-- ============================================================

ALTER TABLE public.torneo_estado
  ADD COLUMN IF NOT EXISTS campeon_perfil_id UUID REFERENCES public.perfiles(id);


-- ============================================================
-- 2. Update promover_ganador_bracket to persist champion and archive tournament
-- ============================================================

CREATE OR REPLACE FUNCTION public.promover_ganador_bracket()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.bracket_tipo = 'eliminacion_directa'
    AND NEW.estado = 'finalizado'
    AND NEW.ganador_id IS NOT NULL
    AND (OLD.estado IS DISTINCT FROM 'finalizado' OR OLD.ganador_id IS NULL)
  THEN
    IF NEW.siguiente_partido_id IS NOT NULL THEN
      -- Promote winner to next match slot (odd position → jugador1, even → jugador2)
      IF NEW.posicion_bracket % 2 = 1 THEN
        UPDATE public.partidos SET jugador1_id = NEW.ganador_id WHERE id = NEW.siguiente_partido_id;
      ELSE
        UPDATE public.partidos SET jugador2_id = NEW.ganador_id WHERE id = NEW.siguiente_partido_id;
      END IF;
    ELSE
      -- siguiente_partido_id IS NULL → this is the Final; store champion and archive
      UPDATE public.torneo_estado
      SET estado = 'FINALIZADO',
          campeon_perfil_id = NEW.ganador_id,
          updated_at = now()
      WHERE torneo_id = NEW.torneo_id
        AND categoria = NEW.categoria
        AND grupo LIKE '%_PLAYOFFS';

      UPDATE public.torneos
      SET activo = false,
          updated_at = now()
      WHERE id = NEW.torneo_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_promover_ganador_bracket ON public.partidos;
CREATE TRIGGER trigger_promover_ganador_bracket
  AFTER UPDATE ON public.partidos
  FOR EACH ROW EXECUTE FUNCTION public.promover_ganador_bracket();
