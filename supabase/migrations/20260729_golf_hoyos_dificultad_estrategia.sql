-- ============================================================
-- Categoria de dificultad y estrategia sugerida por hoyo, para
-- mostrar la guia hoyo por hoyo en la app (pantalla de info del
-- hoyo). Aditivo, no toca columnas existentes.
--
-- RLS: no hace falta politica nueva, hoyos_select_autenticado y
-- hoyos_update_admin ya cubren estas columnas igual que par/yardas.
-- ============================================================

ALTER TABLE public.hoyos ADD COLUMN IF NOT EXISTS categoria_dificultad text;
ALTER TABLE public.hoyos ADD COLUMN IF NOT EXISTS estrategia_sugerida text;

ALTER TABLE public.hoyos DROP CONSTRAINT IF EXISTS hoyos_categoria_dificultad_check;
ALTER TABLE public.hoyos ADD CONSTRAINT hoyos_categoria_dificultad_check
  CHECK (categoria_dificultad IS NULL OR categoria_dificultad IN ('OPORTUNIDAD', 'INTERMEDIO', 'EXIGENTE', 'MUY EXIGENTE'));

COMMENT ON COLUMN public.hoyos.categoria_dificultad IS
  'Etiqueta tactica del hoyo (OPORTUNIDAD/INTERMEDIO/EXIGENTE/MUY EXIGENTE). Opcional, solo para mostrar guia en la app.';
COMMENT ON COLUMN public.hoyos.estrategia_sugerida IS
  'Texto libre con la estrategia sugerida para jugar el hoyo. Opcional, solo para mostrar guia en la app.';

-- ------------------------------------------------------------
-- crear_cancha_con_hoyos: mismo signature (p_hoyos sigue siendo
-- jsonb), ahora tambien lee categoria_dificultad/estrategia_sugerida
-- si vienen en cada elemento del array.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_cancha_con_hoyos(
  p_nombre text,
  p_ubicacion text,
  p_hoyos jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cancha_id bigint;
  v_nombre text;
  v_cantidad integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permiso denegado: solo un admin puede dar de alta canchas.';
  END IF;

  v_nombre := NULLIF(TRIM(COALESCE(p_nombre, '')), '');
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'El nombre de la cancha es obligatorio.';
  END IF;

  SELECT COUNT(*) INTO v_cantidad FROM jsonb_array_elements(COALESCE(p_hoyos, '[]'::jsonb));
  IF v_cantidad = 0 THEN
    RAISE EXCEPTION 'Debe informar al menos un hoyo (numero_hoyo, par, indice_dificultad).';
  END IF;

  INSERT INTO public.canchas (nombre, ubicacion, cantidad_hoyos)
  VALUES (v_nombre, NULLIF(TRIM(COALESCE(p_ubicacion, '')), ''), v_cantidad)
  RETURNING id INTO v_cancha_id;

  INSERT INTO public.hoyos (cancha_id, numero_hoyo, par, yardas, indice_dificultad, mapa_url, categoria_dificultad, estrategia_sugerida)
  SELECT
    v_cancha_id,
    (h ->> 'numero_hoyo')::integer,
    (h ->> 'par')::integer,
    NULLIF(h ->> 'yardas', '')::integer,
    (h ->> 'indice_dificultad')::integer,
    NULLIF(h ->> 'mapa_url', ''),
    NULLIF(h ->> 'categoria_dificultad', ''),
    NULLIF(h ->> 'estrategia_sugerida', '')
  FROM jsonb_array_elements(p_hoyos) AS h;

  RETURN v_cancha_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_cancha_con_hoyos(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_cancha_con_hoyos(text, text, jsonb) TO authenticated;

-- ------------------------------------------------------------
-- Seed: cancha "El Canton" (Par 70, 6.438 yardas) con la guia
-- tactica hoyo por hoyo. Idempotente: no duplica si ya existe
-- una cancha con este nombre.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_cancha_id bigint;
BEGIN
  SELECT id INTO v_cancha_id FROM public.canchas WHERE nombre = 'El Canton';

  IF v_cancha_id IS NULL THEN
    INSERT INTO public.canchas (nombre, ubicacion, cantidad_hoyos)
    VALUES ('El Canton', NULL, 18)
    RETURNING id INTO v_cancha_id;

    INSERT INTO public.hoyos
      (cancha_id, numero_hoyo, par, yardas, indice_dificultad, categoria_dificultad, estrategia_sugerida)
    VALUES
      (v_cancha_id, 1, 4, 415, 7, 'EXIGENTE',
        'Par 4 largo y exigente. Priorizá una salida al centro de la calle; el segundo golpe suele ser largo. Jugar al centro del green reduce el riesgo de un número alto.'),
      (v_cancha_id, 2, 4, 420, 5, 'EXIGENTE',
        'Otro par 4 de mucha distancia. La clave es combinar potencia controlada con precisión. Si la salida no queda cómoda, conviene asegurar la aproximación antes que forzar la bandera.'),
      (v_cancha_id, 3, 3, 145, 17, 'OPORTUNIDAD',
        'Par 3 corto y buena oportunidad de score. Elegí el palo por distancia real y viento. El objetivo principal es tomar green y dejar un putt de birdie manejable.'),
      (v_cancha_id, 4, 4, 402, 13, 'INTERMEDIO',
        'Par 4 de longitud media-larga. Una salida bien posicionada facilita el ataque. Jugá con criterio al sector más amplio del green y evitá perseguir una bandera complicada.'),
      (v_cancha_id, 5, 4, 374, 9, 'INTERMEDIO',
        'Par 4 equilibrado. La precisión desde el tee vale más que unos metros extra. Desde calle, una aproximación controlada permite pelear el par y generar opción de birdie.'),
      (v_cancha_id, 6, 3, 175, 15, 'OPORTUNIDAD',
        'Par 3 de distancia media-larga. Verificá viento y desnivel antes de elegir palo. El centro del green es una buena decisión cuando la bandera está cerca de un borde.'),
      (v_cancha_id, 7, 4, 343, 11, 'INTERMEDIO',
        'Par 4 corto que premia la colocación. No siempre hace falta driver: dejá una distancia cómoda para el segundo golpe y atacá con un palo corto desde una posición segura.'),
      (v_cancha_id, 8, 4, 421, 3, 'MUY EXIGENTE',
        'Uno de los hoyos más difíciles de la vuelta. La salida debe quedar en juego. Aceptá un approach largo y apuntá al centro del green; el bogey puede ser un resultado razonable.'),
      (v_cancha_id, 9, 5, 534, 1, 'MUY EXIGENTE',
        'El hoyo de mayor dificultad del recorrido. Pensalo en tres golpes: salida segura, lay-up a tu distancia favorita y aproximación precisa. Evitá regalar penalidades por exceso de agresividad.'),
      (v_cancha_id, 10, 4, 311, 16, 'OPORTUNIDAD',
        'Par 4 corto y clara oportunidad de score. Elegí la estrategia según tu golpe de salida: atacar o dejar una distancia completa. La prioridad es jugar desde calle.'),
      (v_cancha_id, 11, 4, 387, 6, 'EXIGENTE',
        'Par 4 demandante. Una salida sólida abre el hoyo; desde una posición incómoda conviene jugar al sector ancho del green y confiar en el putt para salvar el par.'),
      (v_cancha_id, 12, 3, 159, 14, 'OPORTUNIDAD',
        'Par 3 de distancia media. Controlá trayectoria y viento. Tomar el centro del green suele ser la decisión correcta, especialmente con una bandera corta o lateral.'),
      (v_cancha_id, 13, 4, 378, 10, 'INTERMEDIO',
        'Par 4 balanceado. La salida debe favorecer el ángulo de ataque y evitar una aproximación forzada. Un golpe conservador al green mantiene el hoyo bajo control.'),
      (v_cancha_id, 14, 4, 414, 8, 'EXIGENTE',
        'Par 4 largo. Necesita una salida firme y un segundo golpe bien elegido. Si el green queda fuera de alcance cómodo, asegurá una buena zona de approach y defendé el bogey.'),
      (v_cancha_id, 15, 4, 431, 4, 'MUY EXIGENTE',
        'El par 4 más largo de la cancha. Jugalo como un hoyo de paciencia: mantener la pelota en juego es esencial. Centro de green y dos putts es una excelente estrategia.'),
      (v_cancha_id, 16, 4, 358, 18, 'OPORTUNIDAD',
        'El hoyo estadísticamente más accesible. Buena oportunidad para atacar, pero sin perder posición. Una salida a calle deja un hierro corto y una chance concreta de birdie.'),
      (v_cancha_id, 17, 3, 167, 12, 'INTERMEDIO',
        'Par 3 de longitud media. Elegí palo para llegar con vuelo suficiente y apuntá al sector amplio. Evitá jugar una bandera riesgosa si el margen de error es pequeño.'),
      (v_cancha_id, 18, 5, 604, 2, 'MUY EXIGENTE',
        'Cierre muy largo y exigente. Planificá tres golpes desde el tee: salida en juego, segundo golpe de posición y approach a una distancia cómoda. Paciencia hasta el último putt.');
  END IF;
END $$;
