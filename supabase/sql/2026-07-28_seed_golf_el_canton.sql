-- ============================================================
-- Seed de prueba: Modulo de Golf
-- Cancha real "El Canton Golf" (Belen de Escobar, Buenos Aires),
-- tee negro, par 70, 6438 yardas + 4 jugadores de prueba con
-- handicaps distintos + 1 torneo de golf de ejemplo inscriptos.
--
-- Mismo estilo que crear_usuarios_prueba.sql /
-- 2026-05-21_seed_servicios_prueba.sql: perfiles con UUIDs fijos
-- insertados directo. Este script NO llama a las RPCs del modulo
-- (crear_cancha_con_hoyos, crear_torneo_golf, etc.) porque esas
-- RPCs estan gateadas por auth.uid() / is_admin() y no hay sesion
-- autenticada al correr un script SQL suelto -- en su lugar hace
-- INSERT directo a las tablas, replicando a mano lo que las RPCs
-- harian (incluido el calculo de golpes netos).
--
-- Idempotente: puede correrse mas de una vez sin duplicar datos.
-- ============================================================

DO $$
DECLARE
  v_cancha_id       bigint;
  v_torneo_id       bigint;
  v_hoyo1_id        bigint;
  v_hoyo2_id        bigint;
  v_hoyo3_id        bigint;
  v_j1              uuid := '00000000-0000-0000-0000-000000000101'; -- handicap 8
  v_j2              uuid := '00000000-0000-0000-0000-000000000102'; -- handicap 14
  v_j3              uuid := '00000000-0000-0000-0000-000000000103'; -- handicap 20
  v_j4              uuid := '00000000-0000-0000-0000-000000000104'; -- handicap 28
  v_ronda1_id       uuid;
  v_ronda2_id       uuid;
  v_fecha_salida    date := (CURRENT_DATE + INTERVAL '7 days')::date;
  v_hora_salida     time := '08:30';
BEGIN
  -- ----------------------------------------------------------
  -- 1. Jugadores de prueba con handicaps distintos.
  -- ----------------------------------------------------------
  INSERT INTO public.perfiles (id, email, nombre_completo, whatsapp, rol, handicap)
  VALUES
    (v_j1, 'golf1@test.com', 'Federico Handicap 8',  '11-1000-0001', 'jugador', 8),
    (v_j2, 'golf2@test.com', 'Lucas Handicap 14',    '11-1000-0002', 'jugador', 14),
    (v_j3, 'golf3@test.com', 'Martina Handicap 20',  '11-1000-0003', 'jugador', 20),
    (v_j4, 'golf4@test.com', 'Ramiro Handicap 28',   '11-1000-0004', 'jugador', 28)
  ON CONFLICT (id) DO UPDATE SET
    email           = EXCLUDED.email,
    nombre_completo = EXCLUDED.nombre_completo,
    whatsapp        = EXCLUDED.whatsapp,
    rol             = EXCLUDED.rol,
    handicap        = EXCLUDED.handicap;

  -- ----------------------------------------------------------
  -- 2. Cancha "El Canton Golf" + sus 18 hoyos reales
  --    (tee negro, par 70, 6438 yardas).
  -- ----------------------------------------------------------
  SELECT id INTO v_cancha_id FROM public.canchas WHERE nombre = 'El Canton Golf';

  IF v_cancha_id IS NULL THEN
    INSERT INTO public.canchas (nombre, ubicacion, cantidad_hoyos)
    VALUES ('El Canton Golf', 'Belen de Escobar, Buenos Aires', 18)
    RETURNING id INTO v_cancha_id;

    INSERT INTO public.hoyos (cancha_id, numero_hoyo, par, yardas, indice_dificultad) VALUES
      (v_cancha_id, 1,  4, 415, 7),
      (v_cancha_id, 2,  4, 420, 5),
      (v_cancha_id, 3,  3, 145, 17),
      (v_cancha_id, 4,  4, 402, 13),
      (v_cancha_id, 5,  4, 374, 9),
      (v_cancha_id, 6,  3, 175, 15),
      (v_cancha_id, 7,  4, 343, 11),
      (v_cancha_id, 8,  4, 421, 3),
      (v_cancha_id, 9,  5, 534, 1),
      (v_cancha_id, 10, 4, 311, 16),
      (v_cancha_id, 11, 4, 387, 6),
      (v_cancha_id, 12, 3, 159, 14),
      (v_cancha_id, 13, 4, 378, 10),
      (v_cancha_id, 14, 4, 414, 8),
      (v_cancha_id, 15, 4, 431, 4),
      (v_cancha_id, 16, 4, 358, 18),
      (v_cancha_id, 17, 3, 167, 12),
      (v_cancha_id, 18, 5, 604, 2);
  END IF;

  -- ----------------------------------------------------------
  -- 3. Torneo de golf de ejemplo (stroke play) + su config/reglas.
  -- ----------------------------------------------------------
  SELECT id INTO v_torneo_id
  FROM public.torneos
  WHERE titulo = 'Abierto de Golf TuBarrio (Prueba)' AND deporte = 'golf';

  IF v_torneo_id IS NULL THEN
    INSERT INTO public.torneos (titulo, subtitulo, fecha_inicio, fecha_fin, deporte, activo, alias_pago, whatsapp_pago)
    VALUES (
      'Abierto de Golf TuBarrio (Prueba)',
      'Stroke Play - Categoria Libre',
      v_fecha_salida,
      v_fecha_salida,
      'golf',
      true,
      'torneo.golf.canton',
      '5491164219155'
    )
    RETURNING id INTO v_torneo_id;

    INSERT INTO public.torneo_golf_config (torneo_id, cancha_id, sistema_handicap, criterio_desempate, reglas_texto)
    VALUES (
      v_torneo_id,
      v_cancha_id,
      'Course Handicap (stroke index por hoyo)',
      'Menor score neto total. En caso de empate, countback de los ultimos 9 hoyos.',
      'Se juega stroke play a 18 hoyos, tee negro. El handicap de cada jugador se toma de su perfil. '
      'Cada hoyo debe cargarse por el jugador o un companero de su mismo tee time, y requiere '
      'confirmacion cruzada de otro integrante del grupo antes de contar para el leaderboard.'
    );
  END IF;

  -- ----------------------------------------------------------
  -- 4. Inscripciones aprobadas (dispara procesar_inscripcion_aprobada
  --    automaticamente, que crea la fila en torneo_estado).
  -- ----------------------------------------------------------
  INSERT INTO public.inscripciones_torneo (torneo_id, perfil_id, estado, monto, alias_destino, whatsapp_destino, aprobado_en)
  SELECT v_torneo_id, jugador, 'pagado_aprobado', 15000, 'torneo.golf.canton', '5491164219155', now()
  FROM unnest(ARRAY[v_j1, v_j2, v_j3, v_j4]) AS jugador
  WHERE NOT EXISTS (
    SELECT 1 FROM public.inscripciones_torneo i
    WHERE i.torneo_id = v_torneo_id AND i.perfil_id = jugador
  );

  -- ----------------------------------------------------------
  -- 5. Tee time: los 4 jugadores comparten el mismo flight.
  -- ----------------------------------------------------------
  INSERT INTO public.rondas_golf (torneo_id, jugador_id, cancha_id, fecha, hora_salida, estado)
  VALUES
    (v_torneo_id, v_j1, v_cancha_id, v_fecha_salida, v_hora_salida, 'en_curso'),
    (v_torneo_id, v_j2, v_cancha_id, v_fecha_salida, v_hora_salida, 'en_curso'),
    (v_torneo_id, v_j3, v_cancha_id, v_fecha_salida, v_hora_salida, 'programada'),
    (v_torneo_id, v_j4, v_cancha_id, v_fecha_salida, v_hora_salida, 'programada')
  ON CONFLICT (torneo_id, jugador_id) DO UPDATE
    SET cancha_id = EXCLUDED.cancha_id, fecha = EXCLUDED.fecha, hora_salida = EXCLUDED.hora_salida;

  SELECT id INTO v_ronda1_id FROM public.rondas_golf WHERE torneo_id = v_torneo_id AND jugador_id = v_j1;
  SELECT id INTO v_ronda2_id FROM public.rondas_golf WHERE torneo_id = v_torneo_id AND jugador_id = v_j2;

  SELECT id INTO v_hoyo1_id FROM public.hoyos WHERE cancha_id = v_cancha_id AND numero_hoyo = 1;
  SELECT id INTO v_hoyo2_id FROM public.hoyos WHERE cancha_id = v_cancha_id AND numero_hoyo = 2;
  SELECT id INTO v_hoyo3_id FROM public.hoyos WHERE cancha_id = v_cancha_id AND numero_hoyo = 3;

  -- ----------------------------------------------------------
  -- 6. Primeros 3 hoyos cargados y confirmados para los 2 primeros
  --    jugadores (deja los otros 15 hoyos + jugadores 3 y 4 sin
  --    cargar, para poder probar el flujo manual end-to-end).
  --
  --    Handicap 8 en hoyo indice 7 -> floor(8/18)=0, resto=8, 7<=8
  --    => 1 golpe de descuento (5 brutos -> 4 netos).
  --    Handicap 14 en hoyo indice 7 -> resto=14, 7<=14 => 1 golpe
  --    (6 brutos -> 5 netos).
  -- ----------------------------------------------------------
  INSERT INTO public.scorecard (ronda_id, hoyo_id, golpes_brutos, golpes_netos, estado, cargado_por, confirmado_por) VALUES
    (v_ronda1_id, v_hoyo1_id, 5, public.calcular_golpes_netos(5, 8, 7),  'confirmado', v_j1, v_j2),
    (v_ronda1_id, v_hoyo2_id, 5, public.calcular_golpes_netos(5, 8, 5),  'confirmado', v_j1, v_j2),
    (v_ronda1_id, v_hoyo3_id, 4, public.calcular_golpes_netos(4, 8, 17), 'confirmado', v_j1, v_j2),
    (v_ronda2_id, v_hoyo1_id, 6, public.calcular_golpes_netos(6, 14, 7),  'confirmado', v_j2, v_j1),
    (v_ronda2_id, v_hoyo2_id, 5, public.calcular_golpes_netos(5, 14, 5),  'confirmado', v_j2, v_j1),
    (v_ronda2_id, v_hoyo3_id, 4, public.calcular_golpes_netos(4, 14, 17), 'confirmado', v_j2, v_j1)
  ON CONFLICT (ronda_id, hoyo_id) DO UPDATE SET
    golpes_brutos  = EXCLUDED.golpes_brutos,
    golpes_netos   = EXCLUDED.golpes_netos,
    estado         = EXCLUDED.estado,
    cargado_por    = EXCLUDED.cargado_por,
    confirmado_por = EXCLUDED.confirmado_por;

  RAISE NOTICE '=== SEED GOLF CREADO ===';
  RAISE NOTICE 'Cancha: El Canton Golf (id %)', v_cancha_id;
  RAISE NOTICE 'Torneo: Abierto de Golf TuBarrio (Prueba) (id %)', v_torneo_id;
  RAISE NOTICE 'Jugadores: golf1..golf4@test.com (handicaps 8/14/20/28)';
  RAISE NOTICE 'Tee time: % % hs, 4 jugadores en el mismo flight', v_fecha_salida, v_hora_salida;
  RAISE NOTICE 'Hoyos 1-3 cargados y confirmados para golf1/golf2 -- probar el resto desde GolfScorecard.tsx';
  RAISE NOTICE '=== FIN ===';
END $$;

-- ----------------------------------------------------------
-- Verificacion rapida del leaderboard resultante:
--   SELECT * FROM public.obtener_leaderboard_golf(
--     (SELECT id FROM public.torneos WHERE titulo = 'Abierto de Golf TuBarrio (Prueba)' AND deporte = 'golf')
--   );
-- ----------------------------------------------------------
