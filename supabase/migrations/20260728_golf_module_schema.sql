-- ============================================================
-- Modulo de Torneos de Golf (stroke play) - MVP
-- Esquema: columnas nuevas + tablas nuevas.
--
-- Todo lo agregado aca es aditivo y no modifica columnas ni filas
-- existentes de tenis. torneo_configuracion NO se usa para golf
-- (su columna modalidad esta acoplada a las RPCs de sorteo/bracket
-- de tenis); golf usa su propia tabla torneo_golf_config.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Distinguir deporte en torneos (default preserva el
--    comportamiento actual: todos los torneos existentes quedan
--    como 'tenis').
-- ------------------------------------------------------------
ALTER TABLE public.torneos
  ADD COLUMN IF NOT EXISTS deporte text NOT NULL DEFAULT 'tenis';

ALTER TABLE public.torneos
  DROP CONSTRAINT IF EXISTS torneos_deporte_check;

ALTER TABLE public.torneos
  ADD CONSTRAINT torneos_deporte_check CHECK (deporte IN ('tenis', 'golf'));

COMMENT ON COLUMN public.torneos.deporte IS
  'Distingue el modulo al que pertenece el torneo. Default tenis para no alterar datos existentes.';

-- ------------------------------------------------------------
-- 2. Handicap opcional en perfiles.
-- ------------------------------------------------------------
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS handicap numeric(4, 1) NULL;

ALTER TABLE public.perfiles
  DROP CONSTRAINT IF EXISTS perfiles_handicap_check;

ALTER TABLE public.perfiles
  ADD CONSTRAINT perfiles_handicap_check
  CHECK (handicap IS NULL OR handicap BETWEEN -10 AND 54);

COMMENT ON COLUMN public.perfiles.handicap IS
  'Handicap de golf del jugador (course handicap). Opcional, no aplica a tenis.';

-- ------------------------------------------------------------
-- 3. Catalogo de canchas de golf (compartido, no atado a un torneo).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.canchas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL,
  ubicacion text,
  cantidad_hoyos integer NOT NULL DEFAULT 18 CHECK (cantidad_hoyos > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.canchas IS 'Catalogo de canchas de golf disponibles para torneos.';

CREATE TABLE IF NOT EXISTS public.hoyos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cancha_id bigint NOT NULL REFERENCES public.canchas(id) ON DELETE CASCADE,
  numero_hoyo integer NOT NULL CHECK (numero_hoyo BETWEEN 1 AND 18),
  par integer NOT NULL CHECK (par BETWEEN 3 AND 6),
  yardas integer,
  indice_dificultad integer NOT NULL CHECK (indice_dificultad BETWEEN 1 AND 18),
  mapa_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cancha_id, numero_hoyo),
  UNIQUE (cancha_id, indice_dificultad)
);

COMMENT ON TABLE public.hoyos IS 'Hoyos de una cancha: par, yardas e indice de dificultad (stroke index) por hoyo.';
COMMENT ON COLUMN public.hoyos.indice_dificultad IS 'Stroke index del hoyo (1 = mas dificil, 18 = mas facil). Unico por cancha.';
COMMENT ON COLUMN public.hoyos.mapa_url IS 'Imagen del hoyo, opcional. Si es null, la UI muestra solo los datos en texto.';

-- ------------------------------------------------------------
-- 4. Configuracion / reglas de un torneo de golf (reemplaza a
--    torneo_configuracion para este modulo).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.torneo_golf_config (
  torneo_id bigint PRIMARY KEY REFERENCES public.torneos(id) ON DELETE CASCADE,
  cancha_id bigint NOT NULL REFERENCES public.canchas(id),
  sistema_handicap text NOT NULL DEFAULT 'Course Handicap (stroke index por hoyo)',
  criterio_desempate text NOT NULL DEFAULT 'Menor score neto total. En caso de empate, countback de los ultimos 9 hoyos.',
  reglas_texto text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.torneo_golf_config IS 'Configuracion y reglas editables de un torneo de golf: cancha, sistema de handicap y criterio de desempate.';

-- ------------------------------------------------------------
-- 5. Rondas: una fila por jugador por torneo (MVP = 1 vuelta).
--    Varios jugadores comparten "flight" cuando coinciden en
--    torneo_id + cancha_id + fecha + hora_salida.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rondas_golf (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  torneo_id bigint NOT NULL REFERENCES public.torneos(id) ON DELETE CASCADE,
  jugador_id uuid NOT NULL REFERENCES public.perfiles(id),
  cancha_id bigint NOT NULL REFERENCES public.canchas(id),
  fecha date NOT NULL,
  hora_salida time NOT NULL,
  estado text NOT NULL DEFAULT 'programada',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (torneo_id, jugador_id)
);

ALTER TABLE public.rondas_golf
  DROP CONSTRAINT IF EXISTS rondas_golf_estado_check;

ALTER TABLE public.rondas_golf
  ADD CONSTRAINT rondas_golf_estado_check
  CHECK (estado IN ('programada', 'en_curso', 'finalizada'));

CREATE INDEX IF NOT EXISTS idx_rondas_golf_flight
  ON public.rondas_golf (torneo_id, cancha_id, fecha, hora_salida);

COMMENT ON TABLE public.rondas_golf IS 'Ronda de golf de un jugador en un torneo (tee time). El "flight"/grupo de salida se determina por coincidencia de cancha+fecha+hora_salida.';

-- ------------------------------------------------------------
-- 6. Scorecard: un registro por hoyo por ronda, con doble
--    confirmacion (mismo espiritu que torneo_propuestas_partido
--    en tenis, adaptado a golf).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scorecard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ronda_id uuid NOT NULL REFERENCES public.rondas_golf(id) ON DELETE CASCADE,
  hoyo_id bigint NOT NULL REFERENCES public.hoyos(id),
  golpes_brutos integer CHECK (golpes_brutos IS NULL OR golpes_brutos > 0),
  golpes_netos integer,
  estado text NOT NULL DEFAULT 'pendiente',
  cargado_por uuid REFERENCES public.perfiles(id),
  confirmado_por uuid REFERENCES public.perfiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ronda_id, hoyo_id)
);

ALTER TABLE public.scorecard
  DROP CONSTRAINT IF EXISTS scorecard_estado_check;

ALTER TABLE public.scorecard
  ADD CONSTRAINT scorecard_estado_check
  CHECK (estado IN ('pendiente', 'confirmado'));

COMMENT ON TABLE public.scorecard IS 'Score por hoyo de una ronda. golpes_netos se calcula automaticamente segun handicap del jugador + indice de dificultad del hoyo. Requiere confirmacion cruzada de un companero de flight antes de contar en el leaderboard.';

-- ------------------------------------------------------------
-- 7. updated_at automatico, reutilizando public.set_updated_at()
--    (ya existente, usado por perfiles/torneos).
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_canchas_updated_at ON public.canchas;
CREATE TRIGGER trg_canchas_updated_at
  BEFORE UPDATE ON public.canchas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_hoyos_updated_at ON public.hoyos;
CREATE TRIGGER trg_hoyos_updated_at
  BEFORE UPDATE ON public.hoyos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_torneo_golf_config_updated_at ON public.torneo_golf_config;
CREATE TRIGGER trg_torneo_golf_config_updated_at
  BEFORE UPDATE ON public.torneo_golf_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_rondas_golf_updated_at ON public.rondas_golf;
CREATE TRIGGER trg_rondas_golf_updated_at
  BEFORE UPDATE ON public.rondas_golf
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_scorecard_updated_at ON public.scorecard;
CREATE TRIGGER trg_scorecard_updated_at
  BEFORE UPDATE ON public.scorecard
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
