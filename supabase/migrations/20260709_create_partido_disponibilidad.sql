-- ============================================================
-- COORDINAR PARTIDO — 2026-07-09
-- Coordinación de horarios entre rivales de torneo
-- ============================================================

-- 1. Agregar columnas de coordinación a partidos
ALTER TABLE public.partidos
  ADD COLUMN IF NOT EXISTS estado_coordinacion TEXT
    NOT NULL DEFAULT 'pendiente'
    CHECK (estado_coordinacion IN ('pendiente', 'pactado', 'manual')),
  ADD COLUMN IF NOT EXISTS horario_pactado TIMESTAMPTZ;

-- 2. Tabla de disponibilidad semanal por jugador/partido
-- slots JSONB: [{"dia": 0, "franja": "mañana"}, ...]
--   dia:    0=Lunes … 6=Domingo
--   franja: "mañana" (08:00-13:00) | "tarde" (13:00-17:00) | "noche" (17:00-22:00)
CREATE TABLE IF NOT EXISTS public.partido_disponibilidad (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  partido_id  UUID        NOT NULL REFERENCES public.partidos(id) ON DELETE CASCADE,
  perfil_id   UUID        NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  slots       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_partido_disponibilidad UNIQUE (partido_id, perfil_id)
);

CREATE INDEX IF NOT EXISTS idx_partido_disponibilidad_partido
  ON public.partido_disponibilidad (partido_id);

CREATE INDEX IF NOT EXISTS idx_partido_disponibilidad_perfil
  ON public.partido_disponibilidad (perfil_id);

-- 3. Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_partido_disponibilidad_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partido_disponibilidad_updated_at
  ON public.partido_disponibilidad;

CREATE TRIGGER trg_partido_disponibilidad_updated_at
  BEFORE UPDATE ON public.partido_disponibilidad
  FOR EACH ROW EXECUTE FUNCTION public.set_partido_disponibilidad_updated_at();

-- 4. RLS
ALTER TABLE public.partido_disponibilidad ENABLE ROW LEVEL SECURITY;

-- SELECT: ambos participantes del partido pueden leer todas las filas de ese partido
DROP POLICY IF EXISTS "disponibilidad_select_participante" ON public.partido_disponibilidad;
CREATE POLICY "disponibilidad_select_participante"
  ON public.partido_disponibilidad
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.partidos p
      WHERE p.id = partido_disponibilidad.partido_id
        AND (p.jugador1_id = auth.uid() OR p.jugador2_id = auth.uid())
    )
  );

-- INSERT: solo propia fila + debe ser participante del partido
DROP POLICY IF EXISTS "disponibilidad_insert_own" ON public.partido_disponibilidad;
CREATE POLICY "disponibilidad_insert_own"
  ON public.partido_disponibilidad
  FOR INSERT
  TO authenticated
  WITH CHECK (
    perfil_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.partidos p
      WHERE p.id = partido_disponibilidad.partido_id
        AND (p.jugador1_id = auth.uid() OR p.jugador2_id = auth.uid())
    )
  );

-- UPDATE: solo propia fila + debe ser participante
DROP POLICY IF EXISTS "disponibilidad_update_own" ON public.partido_disponibilidad;
CREATE POLICY "disponibilidad_update_own"
  ON public.partido_disponibilidad
  FOR UPDATE
  TO authenticated
  USING (
    perfil_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.partidos p
      WHERE p.id = partido_disponibilidad.partido_id
        AND (p.jugador1_id = auth.uid() OR p.jugador2_id = auth.uid())
    )
  )
  WITH CHECK (
    perfil_id = auth.uid()
  );

-- DELETE: solo admins
DROP POLICY IF EXISTS "disponibilidad_delete_admin" ON public.partido_disponibilidad;
CREATE POLICY "disponibilidad_delete_admin"
  ON public.partido_disponibilidad
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 5. RPC: confirmar_horario_partido
-- Valida participación y que ambos cargaron disponibilidad antes de poner 'pactado'
CREATE OR REPLACE FUNCTION public.confirmar_horario_partido(
  p_partido_id UUID,
  p_horario    TIMESTAMPTZ
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_j1      UUID;
  v_j2      UUID;
  v_count   INTEGER;
BEGIN
  SELECT jugador1_id, jugador2_id
    INTO v_j1, v_j2
    FROM public.partidos
   WHERE id = p_partido_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Partido no encontrado');
  END IF;

  IF auth.uid() <> v_j1 AND auth.uid() <> v_j2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No sos participante de este partido');
  END IF;

  -- Ambos deben haber enviado al menos un slot
  SELECT COUNT(*) INTO v_count
    FROM public.partido_disponibilidad
   WHERE partido_id = p_partido_id
     AND perfil_id IN (v_j1, v_j2)
     AND jsonb_array_length(slots) > 0;

  IF v_count < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ambos jugadores deben cargar disponibilidad primero');
  END IF;

  UPDATE public.partidos
     SET estado_coordinacion = 'pactado',
         horario_pactado     = p_horario
   WHERE id = p_partido_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirmar_horario_partido(UUID, TIMESTAMPTZ) FROM anon;

-- 6. RPC: set_coordinacion_manual
-- Permite marcar un partido como 'manual' para ir directo a WhatsApp
CREATE OR REPLACE FUNCTION public.set_coordinacion_manual(
  p_partido_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_j1 UUID;
  v_j2 UUID;
BEGIN
  SELECT jugador1_id, jugador2_id
    INTO v_j1, v_j2
    FROM public.partidos
   WHERE id = p_partido_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Partido no encontrado');
  END IF;

  IF auth.uid() <> v_j1 AND auth.uid() <> v_j2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No sos participante de este partido');
  END IF;

  UPDATE public.partidos
     SET estado_coordinacion = 'manual'
   WHERE id = p_partido_id
     AND estado_coordinacion = 'pendiente';

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_coordinacion_manual(UUID) FROM anon;
