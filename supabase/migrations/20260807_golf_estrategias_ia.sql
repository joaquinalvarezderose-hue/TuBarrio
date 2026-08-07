-- ============================================================
-- Estrategia de golpe generada por IA (Claude Haiku 4.5), en
-- tiempo real segun posicion GPS del jugador. Aditivo: no toca
-- columnas ni RPCs existentes. Complementa (no reemplaza) a
-- hoyos.estrategia_sugerida, que sigue siendo la guia estatica
-- del organizador y ademas sirve de contexto/grounding para el
-- prompt de la IA.
--
-- Cache por (ronda_id, hoyo_id, distancia_bucket_yd): la
-- distancia al objetivo (bandera si esta cargada, si no centro
-- del green) se redondea a un bucket de 15 yardas para no
-- disparar una llamada nueva a la IA por el ruido normal del GPS
-- (hasta ~20m de precision "aceptable" en el burst, ver
-- ACCEPTABLE_ACCURACY_M en services/golfBurstLocation.ts). Un
-- pedido dentro del mismo bucket para la misma ronda+hoyo
-- actualiza la fila existente (upsert); un bucket distinto crea
-- una fila nueva, dando un historial de cada "situacion de tiro"
-- distinta pedida durante la ronda.
--
-- RLS: mismo criterio que scorecard/rondas_golf -- lectura
-- abierta a authenticated (igual que el resto del modulo, sin
-- restriccion por flight, ya que hoyos/rondas_golf/scorecard
-- tampoco la tienen). Escritura (insert/update, usadas por la
-- Edge Function via upsert con el JWT del jugador) solo del
-- dueno de la ronda o el organizador/admin del torneo. Sin
-- policy de delete para jugadores (solo admin, para corregir).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.golf_estrategias_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ronda_id uuid NOT NULL REFERENCES public.rondas_golf(id) ON DELETE CASCADE,
  hoyo_id bigint NOT NULL REFERENCES public.hoyos(id),

  -- Posicion GPS del jugador al momento del pedido (auditoria/debug).
  gps_lat double precision NOT NULL,
  gps_lng double precision NOT NULL,
  gps_accuracy_m numeric NOT NULL,

  -- Distancias calculadas en el momento del pedido (yardas), mismo
  -- criterio que el panel "Tu distancia" de HoleMap.tsx.
  distancia_centro_yd integer NOT NULL,
  distancia_bandera_yd integer,
  distancia_objetivo_yd integer NOT NULL, -- bandera si esta cargada, si no centro
  distancia_bucket_yd integer NOT NULL,   -- distancia_objetivo_yd redondeada a 15yd: clave de cache

  -- Respuesta estructurada de la IA.
  club_recomendado text NOT NULL,
  objetivo text NOT NULL,
  riesgo text,
  tip text NOT NULL,
  respuesta_ia jsonb NOT NULL, -- respuesta cruda completa (debug/auditoria/futuro)

  modelo text NOT NULL DEFAULT 'claude-haiku-4-5',
  senal_debil boolean NOT NULL DEFAULT false, -- gps_accuracy_m por encima del umbral "preciso"

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (ronda_id, hoyo_id, distancia_bucket_yd)
);

COMMENT ON TABLE public.golf_estrategias_ia IS
  'Estrategia de golpe generada por IA (Claude Haiku 4.5) para una posicion GPS puntual del jugador durante una ronda. Cache por (ronda_id, hoyo_id, distancia_bucket_yd) para evitar llamadas repetidas a la API por el mismo tiro.';
COMMENT ON COLUMN public.golf_estrategias_ia.distancia_bucket_yd IS
  'distancia_objetivo_yd redondeada a multiplos de 15 yardas. Junto con ronda_id+hoyo_id identifica "el mismo pedido" para reusar cache en vez de llamar de nuevo a la IA.';
COMMENT ON COLUMN public.golf_estrategias_ia.respuesta_ia IS
  'JSON crudo devuelto por la API de Anthropic (output_config.format), para debug/auditoria y por si a futuro se necesitan campos que hoy no se muestran.';

CREATE INDEX IF NOT EXISTS idx_golf_estrategias_ia_ronda_hoyo
  ON public.golf_estrategias_ia (ronda_id, hoyo_id);

DROP TRIGGER IF EXISTS trg_golf_estrategias_ia_updated_at ON public.golf_estrategias_ia;
CREATE TRIGGER trg_golf_estrategias_ia_updated_at
  BEFORE UPDATE ON public.golf_estrategias_ia
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.golf_estrategias_ia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "golf_estrategias_ia_select_autenticado" ON public.golf_estrategias_ia;
CREATE POLICY "golf_estrategias_ia_select_autenticado" ON public.golf_estrategias_ia
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "golf_estrategias_ia_insert_propio" ON public.golf_estrategias_ia;
CREATE POLICY "golf_estrategias_ia_insert_propio" ON public.golf_estrategias_ia
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rondas_golf r
      WHERE r.id = ronda_id AND r.jugador_id = auth.uid()
    )
    OR public.puede_administrar_torneo(
      (SELECT r.torneo_id FROM public.rondas_golf r WHERE r.id = ronda_id)
    )
  );

DROP POLICY IF EXISTS "golf_estrategias_ia_update_propio" ON public.golf_estrategias_ia;
CREATE POLICY "golf_estrategias_ia_update_propio" ON public.golf_estrategias_ia
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rondas_golf r
      WHERE r.id = ronda_id AND r.jugador_id = auth.uid()
    )
    OR public.puede_administrar_torneo(
      (SELECT r.torneo_id FROM public.rondas_golf r WHERE r.id = ronda_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rondas_golf r
      WHERE r.id = ronda_id AND r.jugador_id = auth.uid()
    )
    OR public.puede_administrar_torneo(
      (SELECT r.torneo_id FROM public.rondas_golf r WHERE r.id = ronda_id)
    )
  );

DROP POLICY IF EXISTS "golf_estrategias_ia_delete_admin" ON public.golf_estrategias_ia;
CREATE POLICY "golf_estrategias_ia_delete_admin" ON public.golf_estrategias_ia
  FOR DELETE TO authenticated
  USING (
    public.puede_administrar_torneo(
      (SELECT r.torneo_id FROM public.rondas_golf r WHERE r.id = ronda_id)
    )
  );

-- Sin GRANTs explicitos: igual que hoyos/rondas_golf/scorecard, se
-- apoya en los privilegios de esquema por defecto de Supabase +
-- estas policies de RLS como unico gate real.
