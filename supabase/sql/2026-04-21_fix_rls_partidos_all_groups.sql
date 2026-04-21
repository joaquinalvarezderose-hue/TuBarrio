-- Fix RLS para permitir ver todos los partidos del torneo si estás inscrito
-- El usuario debe poder ver partidos de todos los grupos si está inscrito en el torneo

DROP POLICY IF EXISTS partidos_select_own ON public.partidos;

CREATE POLICY partidos_select_own
ON public.partidos
FOR SELECT
TO authenticated
USING (
  jugador1_id = auth.uid()
  OR jugador2_id = auth.uid()
  OR is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.inscripciones_torneo it
    WHERE it.torneo_id = partidos.torneo_id
      AND it.perfil_id = auth.uid()
      AND it.estado IN ('pagado_aprobado', 'pendiente_revision')
  )
);

-- ============================================================
-- Fix RLS para inscripciones_torneo - Permitir cambios SEGUROS
-- ============================================================
-- Usuario solo puede modificar:
-- - comprobante_url: actualizar si la URL expira o hay error
-- - referencia_manual: corregir referencia de transferencia

DROP POLICY IF EXISTS inscripciones_update_own_pending ON public.inscripciones_torneo;

-- Trigger que valida qué campos puede cambiar el usuario
CREATE OR REPLACE FUNCTION public.validate_inscripcion_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si es admin, permitir cualquier cambio
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Usuario regular solo puede cambiar si está en pendiente_revision y es su inscripción
  IF NEW.perfil_id != auth.uid() OR NEW.estado != 'pendiente_revision' THEN
    RAISE EXCEPTION 'No puedes modificar esta inscripción';
  END IF;

  -- Solo permite cambios en campos seguros
  -- Si intenta cambiar otros campos, rechazar
  IF 
    OLD.torneo_id != NEW.torneo_id OR
    OLD.estado != NEW.estado OR
    OLD.monto != NEW.monto OR
    OLD.moneda != NEW.moneda OR
    OLD.metodo_pago != NEW.metodo_pago OR
    OLD.categoria != NEW.categoria OR
    OLD.grupo != NEW.grupo OR
    OLD.alias_destino != NEW.alias_destino OR
    OLD.whatsapp_destino != NEW.whatsapp_destino
  THEN
    RAISE EXCEPTION 'Solo puedes cambiar: comprobante_url, referencia_manual';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_inscripcion_update ON public.inscripciones_torneo;
CREATE TRIGGER trg_validate_inscripcion_update
BEFORE UPDATE ON public.inscripciones_torneo
FOR EACH ROW
EXECUTE FUNCTION public.validate_inscripcion_update();

-- Política RLS simplificada ahora que el trigger valida
CREATE POLICY inscripciones_update_own_pending
ON public.inscripciones_torneo
FOR UPDATE
TO authenticated
USING (perfil_id = auth.uid() AND estado = 'pendiente_revision')
WITH CHECK (perfil_id = auth.uid() AND estado = 'pendiente_revision');
