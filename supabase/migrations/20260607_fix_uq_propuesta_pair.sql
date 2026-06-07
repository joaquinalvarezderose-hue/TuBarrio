-- El constraint uq_propuesta_pair es demasiado amplio: no permite que
-- el mismo par de jugadores confirme resultados en etapas distintas
-- (fase de grupos + playoffs) del mismo torneo.
-- Lo reemplazamos por un índice único sobre partido_id (1 propuesta por partido).

ALTER TABLE public.torneo_propuestas_partido
  DROP CONSTRAINT IF EXISTS uq_propuesta_pair;

CREATE UNIQUE INDEX IF NOT EXISTS uq_propuesta_por_partido
  ON public.torneo_propuestas_partido (partido_id)
  WHERE partido_id IS NOT NULL;
