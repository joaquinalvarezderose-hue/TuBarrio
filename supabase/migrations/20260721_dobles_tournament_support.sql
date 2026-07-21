-- ============================================================
-- Soporte para torneos de dobles (parejas)
--
-- Estrategia: aditivo puro. Ninguna funcion, columna ni RLS
-- de singles se modifica. Se agrega:
--   1. torneo_configuracion.modalidad ('singles' | 'dobles')
--   2. Tabla nueva torneo_equipos (parejas)
--   3. Columnas equipo*_id nullable en partidos /
--      torneo_propuestas_partido / torneo_partidos_historial
--   4. RPCs paralelas con sufijo _equipo/_equipos, espejo 1:1
--      de las RPCs de singles (enviar_resultado_seguro,
--      validar_resultado_seguro, sortear_grupos_y_fixture_torneo,
--      generar_playoffs_eliminacion_directa_torneo,
--      obtener_estado_jugador_torneo, admin_marcar_wo).
--   5. Triggers nuevos y aditivos (gateados por columnas equipo*
--      que son NULL en todo torneo singles, por lo que son no-op
--      garantizado ahi) para bracket-advancement y auto-generacion
--      de playoffs de dobles.
-- ============================================================


-- ============================================================
-- 1. torneo_configuracion.modalidad
-- ============================================================

ALTER TABLE public.torneo_configuracion
  ADD COLUMN IF NOT EXISTS modalidad text NOT NULL DEFAULT 'singles';

ALTER TABLE public.torneo_configuracion
  DROP CONSTRAINT IF EXISTS torneo_configuracion_modalidad_check;

ALTER TABLE public.torneo_configuracion
  ADD CONSTRAINT torneo_configuracion_modalidad_check CHECK (modalidad IN ('singles', 'dobles'));


-- ============================================================
-- 2. Tabla torneo_equipos (parejas de dobles)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.torneo_equipos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  torneo_id         bigint NOT NULL REFERENCES public.torneos(id),
  categoria         text NOT NULL,
  grupo             text NULL,
  jugador1_id       uuid NOT NULL REFERENCES public.perfiles(id),
  jugador2_id       uuid NOT NULL REFERENCES public.perfiles(id),
  puntos            integer NOT NULL DEFAULT 0,
  partidos_jugados  integer NOT NULL DEFAULT 0,
  sets_ganados      integer NOT NULL DEFAULT 0,
  sets_perdidos     integer NOT NULL DEFAULT 0,
  creado_por        uuid NULL REFERENCES public.perfiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT torneo_equipos_jugadores_distintos CHECK (jugador1_id <> jugador2_id),
  CONSTRAINT torneo_equipos_orden_canonico CHECK (jugador1_id < jugador2_id),
  CONSTRAINT uq_torneo_equipos_pareja UNIQUE (torneo_id, categoria, jugador1_id, jugador2_id)
);

CREATE INDEX IF NOT EXISTS idx_torneo_equipos_scope ON public.torneo_equipos (torneo_id, categoria, grupo);

ALTER TABLE public.torneo_equipos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS torneo_equipos_select_todos ON public.torneo_equipos;
CREATE POLICY torneo_equipos_select_todos ON public.torneo_equipos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS torneo_equipos_insert_admin ON public.torneo_equipos;
CREATE POLICY torneo_equipos_insert_admin ON public.torneo_equipos
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS torneo_equipos_update_admin ON public.torneo_equipos;
CREATE POLICY torneo_equipos_update_admin ON public.torneo_equipos
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS torneo_equipos_delete_admin ON public.torneo_equipos;
CREATE POLICY torneo_equipos_delete_admin ON public.torneo_equipos
  FOR DELETE USING (public.is_admin());

-- Un jugador no puede integrar dos equipos distintos en el mismo torneo/categoria.
-- El UNIQUE de arriba no alcanza: un jugador podria aparecer como jugador1_id
-- en una fila y jugador2_id en otra.
CREATE OR REPLACE FUNCTION public.trg_torneo_equipos_no_jugador_duplicado_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.torneo_equipos te
    WHERE te.torneo_id = NEW.torneo_id
      AND te.categoria = NEW.categoria
      AND te.id <> NEW.id
      AND (te.jugador1_id IN (NEW.jugador1_id, NEW.jugador2_id)
           OR te.jugador2_id IN (NEW.jugador1_id, NEW.jugador2_id))
  ) THEN
    RAISE EXCEPTION 'Uno de los jugadores ya integra otro equipo en este torneo/categoria.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_torneo_equipos_no_jugador_duplicado ON public.torneo_equipos;
CREATE TRIGGER trg_torneo_equipos_no_jugador_duplicado
  BEFORE INSERT OR UPDATE ON public.torneo_equipos
  FOR EACH ROW EXECUTE FUNCTION public.trg_torneo_equipos_no_jugador_duplicado_fn();

REVOKE ALL ON FUNCTION public.trg_torneo_equipos_no_jugador_duplicado_fn() FROM PUBLIC;


-- ============================================================
-- 3. Columnas equipo*_id (nullable, aditivas) en tablas existentes
-- ============================================================

ALTER TABLE public.partidos
  ADD COLUMN IF NOT EXISTS equipo1_id uuid NULL REFERENCES public.torneo_equipos(id),
  ADD COLUMN IF NOT EXISTS equipo2_id uuid NULL REFERENCES public.torneo_equipos(id),
  ADD COLUMN IF NOT EXISTS equipo_ganador_id uuid NULL REFERENCES public.torneo_equipos(id);

CREATE INDEX IF NOT EXISTS idx_partidos_equipos ON public.partidos (torneo_id, categoria, grupo, equipo1_id, equipo2_id);

ALTER TABLE public.torneo_propuestas_partido
  ADD COLUMN IF NOT EXISTS equipo1_id uuid NULL REFERENCES public.torneo_equipos(id),
  ADD COLUMN IF NOT EXISTS equipo2_id uuid NULL REFERENCES public.torneo_equipos(id),
  ADD COLUMN IF NOT EXISTS debe_confirmar_equipo_id uuid NULL REFERENCES public.torneo_equipos(id);

ALTER TABLE public.torneo_partidos_historial
  ADD COLUMN IF NOT EXISTS equipo1_id uuid NULL REFERENCES public.torneo_equipos(id),
  ADD COLUMN IF NOT EXISTS equipo2_id uuid NULL REFERENCES public.torneo_equipos(id),
  ADD COLUMN IF NOT EXISTS equipo_ganador_id uuid NULL REFERENCES public.torneo_equipos(id);

-- Nota: partidos ya tiene una politica SELECT "partidos_select_anon" con
-- USING (true), por lo que la lectura de partidos de dobles ya queda
-- cubierta sin necesidad de una politica RLS adicional.


-- ============================================================
-- 4. crear_equipo_dobles / eliminar_equipo_dobles
--    (herramienta de armado de parejas, usada desde AdminPanel.tsx)
-- ============================================================

CREATE OR REPLACE FUNCTION public.crear_equipo_dobles(
  p_torneo_id bigint,
  p_categoria text,
  p_jugador1_id uuid,
  p_jugador2_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_categoria text;
  v_j1 uuid;
  v_j2 uuid;
  v_existing_id uuid;
  v_new_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permiso denegado: solo admin puede crear equipos de dobles.';
  END IF;

  IF p_jugador1_id IS NULL OR p_jugador2_id IS NULL THEN
    RAISE EXCEPTION 'Debes indicar ambos jugadores.';
  END IF;
  IF p_jugador1_id = p_jugador2_id THEN
    RAISE EXCEPTION 'Un jugador no puede formar pareja consigo mismo.';
  END IF;

  v_categoria := NULLIF(TRIM(COALESCE(p_categoria, '')), '');
  IF v_categoria IS NULL THEN
    RAISE EXCEPTION 'Debes indicar la categoria.';
  END IF;

  v_j1 := LEAST(p_jugador1_id, p_jugador2_id);
  v_j2 := GREATEST(p_jugador1_id, p_jugador2_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.inscripciones_torneo i
    WHERE i.torneo_id = p_torneo_id AND i.perfil_id = v_j1
      AND i.estado = 'pagado_aprobado'
      AND COALESCE(NULLIF(TRIM(i.categoria), ''), v_categoria) = v_categoria
  ) THEN
    RAISE EXCEPTION 'El jugador % no tiene una inscripcion aprobada en esta categoria.', v_j1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inscripciones_torneo i
    WHERE i.torneo_id = p_torneo_id AND i.perfil_id = v_j2
      AND i.estado = 'pagado_aprobado'
      AND COALESCE(NULLIF(TRIM(i.categoria), ''), v_categoria) = v_categoria
  ) THEN
    RAISE EXCEPTION 'El jugador % no tiene una inscripcion aprobada en esta categoria.', v_j2;
  END IF;

  SELECT id INTO v_existing_id
  FROM public.torneo_equipos
  WHERE torneo_id = p_torneo_id AND categoria = v_categoria
    AND jugador1_id = v_j1 AND jugador2_id = v_j2;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  INSERT INTO public.torneo_equipos (torneo_id, categoria, jugador1_id, jugador2_id, creado_por)
  VALUES (p_torneo_id, v_categoria, v_j1, v_j2, auth.uid())
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_equipo_dobles(bigint, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_equipo_dobles(bigint, text, uuid, uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.eliminar_equipo_dobles(p_equipo_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_equipo public.torneo_equipos%rowtype;
  v_partidos_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permiso denegado: solo admin puede eliminar equipos de dobles.';
  END IF;

  SELECT * INTO v_equipo FROM public.torneo_equipos WHERE id = p_equipo_id;
  IF NOT FOUND THEN
    RETURN 'Equipo no encontrado.';
  END IF;

  IF v_equipo.grupo IS NOT NULL THEN
    RETURN 'No se puede deshacer: el equipo ya fue asignado a un grupo (sorteo realizado).';
  END IF;

  SELECT COUNT(*) INTO v_partidos_count
  FROM public.partidos
  WHERE equipo1_id = p_equipo_id OR equipo2_id = p_equipo_id;

  IF v_partidos_count > 0 THEN
    RETURN 'No se puede deshacer: el equipo ya tiene partidos generados.';
  END IF;

  DELETE FROM public.torneo_equipos WHERE id = p_equipo_id;
  RETURN 'OK';
END;
$$;

REVOKE ALL ON FUNCTION public.eliminar_equipo_dobles(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eliminar_equipo_dobles(uuid) TO authenticated, service_role;


-- ============================================================
-- 5. generar_fixture_round_robin_grupo_equipos
--    Espejo de generar_fixture_round_robin_grupo, sobre equipos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.generar_fixture_round_robin_grupo_equipos(
  p_torneo_id bigint,
  p_categoria text,
  p_grupo text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_equipos uuid[];
  v_work uuid[];
  v_created integer := 0;
  v_expected_partidos integer := 0;
  v_i integer;
  v_j integer;
  v_round integer;
  v_rounds integer;
  v_slots integer;
  v_half integer;
  v_tmp uuid;
  v_partidos_existentes integer := 0;
  v_e1 uuid;
  v_e2 uuid;
BEGIN
  SELECT COALESCE(array_agg(te.id ORDER BY te.id), '{}'::uuid[])
    INTO v_equipos
  FROM public.torneo_equipos te
  WHERE te.torneo_id = p_torneo_id
    AND te.categoria = p_categoria
    AND te.grupo = p_grupo;

  IF COALESCE(array_length(v_equipos, 1), 0) < 2 THEN
    RETURN 0;
  END IF;

  v_work := v_equipos;
  v_expected_partidos := (array_length(v_work, 1) * GREATEST(array_length(v_work, 1) - 1, 0)) / 2;

  SELECT COUNT(*)::integer INTO v_partidos_existentes
  FROM public.partidos p
  WHERE p.torneo_id = p_torneo_id AND p.categoria = p_categoria AND p.grupo = p_grupo;

  IF v_partidos_existentes > 0 THEN
    RAISE EXCEPTION 'El grupo % ya tiene % partidos cargados. Limpialos antes de re-sortear.', p_grupo, v_partidos_existentes;
  END IF;

  IF MOD(array_length(v_work, 1), 2) = 1 THEN
    v_work := array_append(v_work, NULL::uuid);
  END IF;

  v_slots := COALESCE(array_length(v_work, 1), 0);
  v_half := v_slots / 2;
  v_rounds := GREATEST(v_slots - 1, 0);

  FOR v_round IN 1..v_rounds LOOP
    FOR v_i IN 1..v_half LOOP
      v_e1 := v_work[v_i];
      v_e2 := v_work[v_slots - v_i + 1];

      IF v_e1 IS NULL OR v_e2 IS NULL THEN
        CONTINUE;
      END IF;

      INSERT INTO public.partidos (
        torneo_id, categoria, grupo, jornada,
        equipo1_id, equipo2_id,
        fecha_programada, resultado, estado, ganador_id
      ) VALUES (
        p_torneo_id, p_categoria, p_grupo, v_round,
        v_e1, v_e2,
        NULL, 'PENDIENTE', 'programado', NULL
      );

      v_created := v_created + 1;
    END LOOP;

    IF v_slots > 2 THEN
      v_tmp := v_work[v_slots];
      FOR v_j IN REVERSE v_slots..3 LOOP
        v_work[v_j] := v_work[v_j - 1];
      END LOOP;
      v_work[2] := v_tmp;
    END IF;
  END LOOP;

  IF v_created <> v_expected_partidos THEN
    RAISE EXCEPTION 'Se esperaban % partidos para %/%/% y se generaron %.', v_expected_partidos, p_torneo_id, p_categoria, p_grupo, v_created;
  END IF;

  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.generar_fixture_round_robin_grupo_equipos(bigint, text, text) FROM PUBLIC;


-- ============================================================
-- 6. sortear_grupos_y_fixture_equipos_torneo
--    Espejo de sortear_grupos_y_fixture_torneo, sobre torneo_equipos.
--    A diferencia de singles, los equipos ya existen (se crean con
--    crear_equipo_dobles); el sorteo solo reparte por grupo y arma
--    el fixture.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sortear_grupos_y_fixture_equipos_torneo(
  p_torneo_id bigint,
  p_categoria text DEFAULT NULL,
  p_grupo_base text DEFAULT NULL
)
RETURNS TABLE (
  categoria text,
  grupo_base text,
  max_participantes_por_grupo integer,
  grupos_creados integer,
  equipos_sorteados integer,
  partidos_creados integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_categoria text;
  v_grupo_base text;
  v_modalidad text;
  v_max_por_grupo integer := 4;
  v_numero_grupos integer := NULL;
  v_min_por_grupo integer := NULL;
  v_equipos uuid[];
  v_total integer := 0;
  v_grupos integer := 0;
  v_base_size integer := 0;
  v_remainder integer := 0;
  v_group_idx integer := 0;
  v_start integer := 1;
  v_group_size integer := 0;
  v_end_idx integer := 0;
  v_grupo text;
  v_partidos integer := 0;
  v_has_existing boolean := false;
  v_members uuid[];
  v_i integer;
  v_j integer;
  v_tmp uuid;
BEGIN
  v_categoria := NULLIF(TRIM(COALESCE(p_categoria, '')), '');
  IF v_categoria IS NULL THEN
    SELECT t.subtitulo INTO v_categoria FROM public.torneos t WHERE t.id = p_torneo_id LIMIT 1;
  END IF;
  v_categoria := COALESCE(v_categoria, 'General');

  SELECT
    GREATEST(2, COALESCE(tc.max_participantes_por_grupo, 4)),
    tc.numero_grupos,
    tc.min_participantes_por_grupo,
    COALESCE(NULLIF(TRIM(tc.grupo_base), ''), format('TORNEO_%s', p_torneo_id)),
    tc.modalidad
  INTO v_max_por_grupo, v_numero_grupos, v_min_por_grupo, v_grupo_base, v_modalidad
  FROM public.torneo_configuracion tc
  WHERE tc.torneo_id = p_torneo_id;

  IF v_modalidad IS DISTINCT FROM 'dobles' THEN
    RAISE EXCEPTION 'Este torneo no esta configurado como modalidad dobles.';
  END IF;

  v_max_por_grupo := GREATEST(2, COALESCE(v_max_por_grupo, 4));
  v_grupo_base := COALESCE(NULLIF(TRIM(COALESCE(p_grupo_base, v_grupo_base, '')), ''), format('TORNEO_%s', p_torneo_id));

  SELECT array_agg(te.id ORDER BY te.id)
  INTO v_equipos
  FROM public.torneo_equipos te
  WHERE te.torneo_id = p_torneo_id
    AND te.categoria = v_categoria
    AND te.grupo IS NULL;

  v_total := COALESCE(array_length(v_equipos, 1), 0);

  IF v_total < 2 THEN
    RAISE EXCEPTION 'Se necesitan al menos 2 equipos sin grupo asignado para sortear. Encontrados: %', v_total;
  END IF;

  IF array_length(v_equipos, 1) IS NOT NULL THEN
    FOR v_i IN REVERSE array_lower(v_equipos, 1)..array_upper(v_equipos, 1) LOOP
      EXIT WHEN v_i <= 1;
      v_j := 1 + floor(random() * v_i)::int;
      v_tmp := v_equipos[v_j];
      v_equipos[v_j] := v_equipos[v_i];
      v_equipos[v_i] := v_tmp;
    END LOOP;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.partidos p
    WHERE p.torneo_id = p_torneo_id
      AND p.categoria = v_categoria
      AND (p.grupo = v_grupo_base OR p.grupo LIKE (v_grupo_base || '\_G%') ESCAPE '\')
      AND p.equipo1_id IS NOT NULL
  ) INTO v_has_existing;

  IF v_has_existing THEN
    RAISE EXCEPTION 'Ya existen partidos de dobles para %/%. Limpialos antes de re-sortear.', p_torneo_id, v_categoria;
  END IF;

  DELETE FROM public.torneo_estado te
  WHERE te.torneo_id = p_torneo_id
    AND te.categoria = v_categoria
    AND (te.grupo = v_grupo_base OR te.grupo LIKE (v_grupo_base || '\_G%') ESCAPE '\');

  IF v_numero_grupos IS NOT NULL THEN
    v_grupos := LEAST(GREATEST(v_numero_grupos, 1), v_total);
  ELSE
    v_grupos := CEIL(v_total::numeric / v_max_por_grupo::numeric)::integer;
  END IF;

  IF v_grupos < 1 THEN v_grupos := 1; END IF;

  IF v_min_por_grupo IS NOT NULL AND v_total < v_grupos * v_min_por_grupo THEN
    RAISE EXCEPTION 'No hay suficientes equipos (% equipos) para crear % grupos con minimo % por grupo.',
      v_total, v_grupos, v_min_por_grupo;
  END IF;

  v_base_size := FLOOR(v_total::numeric / v_grupos::numeric)::integer;
  v_remainder := MOD(v_total, v_grupos);

  FOR v_group_idx IN 1..v_grupos LOOP
    v_group_size := v_base_size + CASE WHEN v_group_idx <= v_remainder THEN 1 ELSE 0 END;
    v_end_idx := v_start + v_group_size - 1;
    v_members := v_equipos[v_start:v_end_idx];
    v_grupo := CASE WHEN v_group_idx = 1 THEN v_grupo_base ELSE format('%s_G%s', v_grupo_base, v_group_idx) END;

    PERFORM public.upsert_torneo_grupo(
      p_torneo_id, v_categoria, v_grupo, NULL, 'GRUPOS', v_group_idx, NULL, (v_group_idx = 1)
    );

    INSERT INTO public.torneo_estado (torneo_id, categoria, grupo, estado, current_participantes, sorteo_realizado)
    VALUES (p_torneo_id, v_categoria, v_grupo, 'LOCKED', v_group_size, true)
    ON CONFLICT ON CONSTRAINT uq_torneo_estado_scope DO UPDATE
      SET estado = 'LOCKED', current_participantes = v_group_size, sorteo_realizado = true, updated_at = now();

    UPDATE public.torneo_equipos
    SET grupo = v_grupo, updated_at = now()
    WHERE id = ANY(v_members);

    v_partidos := v_partidos + public.generar_fixture_round_robin_grupo_equipos(p_torneo_id, v_categoria, v_grupo);
    v_start := v_end_idx + 1;
  END LOOP;

  RETURN QUERY SELECT v_categoria, v_grupo_base, v_max_por_grupo, v_grupos, v_total, v_partidos;
END;
$$;

REVOKE ALL ON FUNCTION public.sortear_grupos_y_fixture_equipos_torneo(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sortear_grupos_y_fixture_equipos_torneo(bigint, text, text) TO authenticated, service_role;


-- ============================================================
-- 7. equipo_clasifica_en_fase_grupos
--    Espejo de jugador_clasifica_en_fase_grupos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.equipo_clasifica_en_fase_grupos(
  p_torneo_id bigint,
  p_categoria text,
  p_equipo_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_categoria text;
  v_grupo_base text;
  v_grupo_base_id uuid;
  v_clasificados_por_grupo integer := 2;
  v_incluir_mejores_terceros boolean := false;
  v_cantidad_mejores_terceros integer := 0;
  v_clasifica boolean := false;
BEGIN
  v_categoria := NULLIF(TRIM(COALESCE(p_categoria, '')), '');
  IF v_categoria IS NULL THEN
    SELECT t.subtitulo INTO v_categoria FROM public.torneos t WHERE t.id = p_torneo_id LIMIT 1;
  END IF;
  v_categoria := COALESCE(v_categoria, 'General');

  SELECT
    GREATEST(1, COALESCE(tc.clasificados_por_grupo, 2)),
    COALESCE(tc.incluir_mejores_terceros, false),
    COALESCE(tc.cantidad_mejores_terceros, 0),
    tc.grupo_base_id
  INTO
    v_clasificados_por_grupo, v_incluir_mejores_terceros, v_cantidad_mejores_terceros, v_grupo_base_id
  FROM public.torneo_configuracion tc
  WHERE tc.torneo_id = p_torneo_id;

  SELECT grupo_codigo
  INTO v_grupo_base
  FROM public.resolver_grupo_base_torneo(p_torneo_id, v_categoria, NULL, v_grupo_base_id);

  IF v_grupo_base IS NULL THEN
    RETURN false;
  END IF;

  WITH ranking AS (
    SELECT
      te.grupo,
      te.id,
      COALESCE(te.puntos, 0) AS puntos,
      COALESCE(te.sets_ganados, 0) AS sets_ganados,
      COALESCE(te.partidos_jugados, 0) AS partidos_jugados,
      row_number() OVER (
        PARTITION BY te.grupo
        ORDER BY COALESCE(te.puntos, 0) DESC,
                 COALESCE(te.sets_ganados, 0) DESC,
                 COALESCE(te.partidos_jugados, 0) ASC,
                 te.id ASC
      ) AS pos_grupo
    FROM public.torneo_equipos te
    WHERE te.torneo_id = p_torneo_id
      AND te.categoria = v_categoria
      AND (te.grupo = v_grupo_base OR starts_with(te.grupo, v_grupo_base || '_G'))
  ),
  clasificados AS (
    SELECT id FROM ranking WHERE pos_grupo <= v_clasificados_por_grupo
  ),
  terceros_rankeados AS (
    SELECT id,
      row_number() OVER (
        ORDER BY puntos DESC, sets_ganados DESC, partidos_jugados ASC, grupo ASC, id ASC
      ) AS rank_tercero
    FROM ranking
    WHERE pos_grupo = v_clasificados_por_grupo + 1
  ),
  mejores_terceros AS (
    SELECT id FROM terceros_rankeados
    WHERE v_incluir_mejores_terceros AND rank_tercero <= v_cantidad_mejores_terceros
  )
  SELECT EXISTS (
    SELECT 1 FROM clasificados WHERE id = p_equipo_id
    UNION ALL
    SELECT 1 FROM mejores_terceros WHERE id = p_equipo_id
  ) INTO v_clasifica;

  RETURN COALESCE(v_clasifica, false);
END;
$$;

REVOKE ALL ON FUNCTION public.equipo_clasifica_en_fase_grupos(bigint, text, uuid) FROM PUBLIC;


-- ============================================================
-- 8. generar_playoffs_eliminacion_directa_equipos_torneo
--    Espejo estructural de generar_playoffs_eliminacion_directa_torneo
--    (version bracket-completo con siguiente_partido_id).
-- ============================================================

CREATE OR REPLACE FUNCTION public.generar_playoffs_eliminacion_directa_equipos_torneo(
  p_torneo_id bigint,
  p_categoria text DEFAULT NULL,
  p_grupo_base text DEFAULT NULL
)
RETURNS TABLE (
  out_categoria text,
  grupo_playoffs text,
  grupos_fuente integer,
  clasificados_totales integer,
  partidos_creados integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_categoria text;
  v_grupo_base text;
  v_grupo_base_id uuid;
  v_modalidad text;
  v_clasificados_por_grupo integer := 2;
  v_habilitar_playoffs boolean := false;
  v_incluir_mejores_terceros boolean := false;
  v_cantidad_mejores_terceros integer := 0;
  v_grupo_playoffs text;
  v_grupo_playoffs_id uuid;
  v_total integer := 0;
  v_grupos_fuente integer := 0;
  v_partidos integer := 0;
  v_has_existing boolean := false;
  v_seeded uuid[];
  v_total_rondas integer;
  v_match_ids uuid[];
  v_ronda integer;
  v_pos integer;
  v_num_matches integer;
  v_flat_idx integer;
  v_flat_idx_next integer;
  v_offset integer;
  v_offset_next integer;
  v_e1 uuid;
  v_e2 uuid;
  v_grupos_no_finalizados integer;
  i integer;
BEGIN
  v_categoria := NULLIF(TRIM(COALESCE(p_categoria, '')), '');
  IF v_categoria IS NULL THEN
    SELECT t.subtitulo INTO v_categoria FROM public.torneos t WHERE t.id = p_torneo_id LIMIT 1;
  END IF;
  v_categoria := COALESCE(v_categoria, 'General');

  SELECT
    GREATEST(1, COALESCE(tc.clasificados_por_grupo, 2)),
    COALESCE(tc.crear_playoffs_eliminacion_directa, false),
    COALESCE(tc.incluir_mejores_terceros, false),
    COALESCE(tc.cantidad_mejores_terceros, 0),
    tc.grupo_base_id,
    tc.modalidad
  INTO
    v_clasificados_por_grupo, v_habilitar_playoffs, v_incluir_mejores_terceros,
    v_cantidad_mejores_terceros, v_grupo_base_id, v_modalidad
  FROM public.torneo_configuracion tc
  WHERE tc.torneo_id = p_torneo_id;

  IF v_modalidad IS DISTINCT FROM 'dobles' THEN
    RAISE EXCEPTION 'Este torneo no esta configurado como modalidad dobles.';
  END IF;

  SELECT grupo_id, grupo_codigo
  INTO v_grupo_base_id, v_grupo_base
  FROM public.resolver_grupo_base_torneo(p_torneo_id, v_categoria, p_grupo_base, v_grupo_base_id);

  IF NOT v_habilitar_playoffs THEN
    RAISE EXCEPTION 'Playoffs por eliminacion directa no habilitado en torneo_configuracion para torneo %.', p_torneo_id;
  END IF;

  SELECT COUNT(*) INTO v_grupos_no_finalizados
  FROM public.torneo_estado
  WHERE torneo_id = p_torneo_id
    AND categoria = v_categoria
    AND grupo NOT LIKE '%_PLAYOFFS'
    AND TRIM(estado) <> 'FINALIZADO';

  IF v_grupos_no_finalizados > 0 THEN
    RAISE EXCEPTION 'No se pueden generar playoffs: % grupo(s) aun no han finalizado todos sus partidos.', v_grupos_no_finalizados;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.partidos p
    WHERE p.torneo_id = p_torneo_id AND p.categoria = v_categoria AND p.grupo LIKE (v_grupo_base || '_PLAYOFFS')
  ) INTO v_has_existing;
  IF v_has_existing THEN
    RAISE EXCEPTION 'El playoffs ya tiene partidos cargados. Limpialos antes de regenerar.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.torneo_partidos_historial h
    WHERE h.torneo_id = p_torneo_id AND h.categoria = v_categoria AND h.grupo LIKE (v_grupo_base || '_PLAYOFFS')
  ) INTO v_has_existing;
  IF v_has_existing THEN
    RAISE EXCEPTION 'El playoffs ya tiene historial cargado. Limpialo antes de regenerar.';
  END IF;

  WITH ranking AS (
    SELECT
      te.grupo,
      te.id,
      COALESCE(te.puntos, 0) AS puntos,
      COALESCE(te.sets_ganados, 0) AS sets_ganados,
      COALESCE(te.partidos_jugados, 0) AS partidos_jugados,
      row_number() OVER (
        PARTITION BY te.grupo
        ORDER BY COALESCE(te.puntos, 0) DESC,
                 COALESCE(te.sets_ganados, 0) DESC,
                 COALESCE(te.partidos_jugados, 0) ASC,
                 te.id ASC
      ) AS pos_grupo
    FROM public.torneo_equipos te
    WHERE te.torneo_id = p_torneo_id
      AND te.categoria = v_categoria
      AND (te.grupo = v_grupo_base OR starts_with(te.grupo, v_grupo_base || '_G'))
  ),
  clasificados AS (
    SELECT grupo, id, puntos, sets_ganados, partidos_jugados, pos_grupo, false AS es_mejor_tercero
    FROM ranking
    WHERE pos_grupo <= v_clasificados_por_grupo
  ),
  terceros_rankeados AS (
    SELECT grupo, id, puntos, sets_ganados, partidos_jugados, pos_grupo,
      row_number() OVER (
        ORDER BY puntos DESC, sets_ganados DESC, partidos_jugados ASC, grupo ASC, id ASC
      ) AS rank_tercero
    FROM ranking
    WHERE pos_grupo = v_clasificados_por_grupo + 1
  ),
  mejores_terceros AS (
    SELECT grupo, id, puntos, sets_ganados, partidos_jugados, pos_grupo, true AS es_mejor_tercero
    FROM terceros_rankeados
    WHERE v_incluir_mejores_terceros AND rank_tercero <= v_cantidad_mejores_terceros
  ),
  todos AS (
    SELECT * FROM clasificados
    UNION ALL
    SELECT * FROM mejores_terceros
  ),
  seeded AS (
    SELECT *,
      row_number() OVER (
        ORDER BY es_mejor_tercero ASC, pos_grupo ASC, puntos DESC,
                 sets_ganados DESC, partidos_jugados ASC, grupo ASC, id ASC
      ) AS seed
    FROM todos
  )
  SELECT
    array_agg(s.id ORDER BY s.seed),
    count(*)::integer,
    count(DISTINCT s.grupo)::integer
  INTO v_seeded, v_total, v_grupos_fuente
  FROM seeded s;

  IF v_total < 2 THEN
    RAISE EXCEPTION 'No hay suficientes equipos clasificados para playoffs (%).', v_total;
  END IF;
  IF (v_total & (v_total - 1)) <> 0 THEN
    RAISE EXCEPTION 'Los clasificados totales (%) deben ser potencia de 2 para armar cruces directos.', v_total;
  END IF;

  v_total_rondas := log(2, v_total)::integer;
  v_grupo_playoffs := format('%s_PLAYOFFS', v_grupo_base);

  v_grupo_playoffs_id := public.upsert_torneo_grupo(
    p_torneo_id, v_categoria, v_grupo_playoffs, 'Playoffs', 'PLAYOFFS', 1, v_grupo_base_id, false
  );

  DELETE FROM public.torneo_estado
  WHERE torneo_id = p_torneo_id AND categoria = v_categoria AND grupo = v_grupo_playoffs;

  INSERT INTO public.torneo_estado (torneo_id, categoria, grupo, estado, current_participantes)
  VALUES (p_torneo_id, v_categoria, v_grupo_playoffs, 'LOCKED', v_total);

  v_match_ids := ARRAY[]::uuid[];
  FOR i IN 1..(v_total - 1) LOOP
    v_match_ids := array_append(v_match_ids, gen_random_uuid());
  END LOOP;

  v_offset := 0;
  FOR v_ronda IN 1..v_total_rondas LOOP
    v_num_matches := v_total / (2 ^ v_ronda);
    FOR v_pos IN 1..v_num_matches LOOP
      v_flat_idx := v_offset + v_pos;
      IF v_ronda = 1 THEN
        v_e1 := v_seeded[2 * v_pos - 1];
        v_e2 := v_seeded[v_total - (2 * v_pos - 1) + 1];
      ELSE
        v_e1 := NULL;
        v_e2 := NULL;
      END IF;
      INSERT INTO public.partidos (
        id, torneo_id, categoria, grupo, jornada,
        equipo1_id, equipo2_id, estado,
        ronda, posicion_bracket, bracket_tipo
      ) VALUES (
        v_match_ids[v_flat_idx], p_torneo_id, v_categoria, v_grupo_playoffs, v_ronda,
        v_e1, v_e2, 'programado', v_ronda, v_pos, 'eliminacion_directa'
      );
      v_partidos := v_partidos + 1;
    END LOOP;
    v_offset := v_offset + v_num_matches;
  END LOOP;

  v_offset := 0;
  FOR v_ronda IN 1..(v_total_rondas - 1) LOOP
    v_num_matches := v_total / (2 ^ v_ronda);
    v_offset_next := v_offset + v_num_matches;
    FOR v_pos IN 1..v_num_matches LOOP
      v_flat_idx := v_offset + v_pos;
      v_flat_idx_next := v_offset_next + ceil(v_pos::numeric / 2)::integer;
      UPDATE public.partidos SET siguiente_partido_id = v_match_ids[v_flat_idx_next]
      WHERE id = v_match_ids[v_flat_idx];
    END LOOP;
    v_offset := v_offset + v_num_matches;
  END LOOP;

  UPDATE public.partidos
  SET stage_name = public.calculate_stage_name(p_torneo_id, ronda)
  WHERE torneo_id = p_torneo_id AND categoria = v_categoria
    AND grupo = v_grupo_playoffs AND bracket_tipo = 'eliminacion_directa';

  RETURN QUERY SELECT v_categoria, v_grupo_playoffs, v_grupos_fuente, v_total, v_partidos;
END;
$$;

REVOKE ALL ON FUNCTION public.generar_playoffs_eliminacion_directa_equipos_torneo(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generar_playoffs_eliminacion_directa_equipos_torneo(bigint, text, text) TO authenticated, service_role;


-- ============================================================
-- 9. enviar_resultado_seguro_equipo / validar_resultado_seguro_equipo
--    / _confirmar_resultado_equipo_core
--    Espejo de enviar_resultado_seguro / validar_resultado_seguro /
--    _confirmar_resultado_core. "equipo1"/"equipo2" en vez de
--    "jugador1"/"jugador2"; debe_confirmar_equipo_id habilita a
--    CUALQUIER integrante del otro equipo a confirmar/rechazar.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enviar_resultado_seguro_equipo(
  p_partido_id uuid,
  p_user_id uuid,
  p_set1_j1 integer,
  p_set1_j2 integer,
  p_set2_j1 integer,
  p_set2_j2 integer,
  p_set3_j1 integer,
  p_set3_j2 integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partido public.partidos%rowtype;
  v_equipo1 public.torneo_equipos%rowtype;
  v_equipo2 public.torneo_equipos%rowtype;
  v_propuesta public.torneo_propuestas_partido%rowtype;
  v_match_pair_key text;
  v_sets jsonb;
  v_debe_confirmar_equipo uuid;
  v_user_lado integer;
  v_rep_jugador1 uuid;
  v_rep_jugador2 uuid;
BEGIN
  IF p_partido_id IS NULL OR p_user_id IS NULL THEN
    RETURN 'Partido o usuario invalido.';
  END IF;

  IF p_set1_j1 IS NULL OR p_set1_j2 IS NULL OR p_set2_j1 IS NULL OR p_set2_j2 IS NULL THEN
    RETURN 'Faltan sets obligatorios para enviar el resultado.';
  END IF;

  SELECT * INTO v_partido FROM public.partidos p WHERE p.id = p_partido_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'Partido no encontrado.';
  END IF;

  IF v_partido.equipo1_id IS NULL OR v_partido.equipo2_id IS NULL THEN
    RETURN 'Este partido no tiene equipos de dobles asignados.';
  END IF;

  SELECT * INTO v_equipo1 FROM public.torneo_equipos WHERE id = v_partido.equipo1_id;
  SELECT * INTO v_equipo2 FROM public.torneo_equipos WHERE id = v_partido.equipo2_id;

  IF p_user_id IN (v_equipo1.jugador1_id, v_equipo1.jugador2_id) THEN
    v_user_lado := 1;
  ELSIF p_user_id IN (v_equipo2.jugador1_id, v_equipo2.jugador2_id) THEN
    v_user_lado := 2;
  ELSE
    RETURN 'Solo los integrantes de los equipos del partido pueden cargar resultado.';
  END IF;

  IF COALESCE(v_partido.estado, '') = 'finalizado' THEN
    RETURN 'Este partido ya esta finalizado.';
  END IF;

  IF v_user_lado = 1 THEN
    v_debe_confirmar_equipo := v_partido.equipo2_id;
  ELSE
    v_debe_confirmar_equipo := v_partido.equipo1_id;
  END IF;

  v_rep_jugador1 := v_equipo1.jugador1_id;
  v_rep_jugador2 := v_equipo2.jugador1_id;

  v_match_pair_key := format(
    'PARTIDO:%s|T:%s|C:%s|G:%s|J:%s',
    v_partido.id,
    v_partido.torneo_id,
    COALESCE(v_partido.categoria, ''),
    COALESCE(v_partido.grupo, ''),
    COALESCE(v_partido.jornada, 1)
  );

  v_sets := jsonb_build_array(
    jsonb_build_object('p1', GREATEST(0, COALESCE(p_set1_j1, 0)), 'p2', GREATEST(0, COALESCE(p_set1_j2, 0))),
    jsonb_build_object('p1', GREATEST(0, COALESCE(p_set2_j1, 0)), 'p2', GREATEST(0, COALESCE(p_set2_j2, 0))),
    jsonb_build_object('p1', GREATEST(0, COALESCE(p_set3_j1, 0)), 'p2', GREATEST(0, COALESCE(p_set3_j2, 0)))
  );

  SELECT * INTO v_propuesta FROM public.torneo_propuestas_partido tpp WHERE tpp.partido_id = p_partido_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.torneo_propuestas_partido (
      torneo_id, categoria, grupo,
      jugador1_id, jugador2_id, jugador1_perfil_id, jugador2_perfil_id,
      equipo1_id, equipo2_id,
      fecha_propuesta, propuesta_por, match_pair_key, partido_id, jornada,
      ultimo_cargado_por, debe_confirmar_equipo_id,
      sets_json_j1, sets_json_j2,
      estado, updated_at
    ) VALUES (
      COALESCE(v_partido.torneo_id, 0)::integer,
      COALESCE(v_partido.categoria, ''),
      COALESCE(v_partido.grupo, ''),
      v_rep_jugador1, v_rep_jugador2, v_rep_jugador1, v_rep_jugador2,
      v_partido.equipo1_id, v_partido.equipo2_id,
      now(), p_user_id, v_match_pair_key, v_partido.id, COALESCE(v_partido.jornada, 1),
      p_user_id, v_debe_confirmar_equipo,
      CASE WHEN v_user_lado = 1 THEN v_sets ELSE NULL END,
      CASE WHEN v_user_lado = 2 THEN v_sets ELSE NULL END,
      'pendiente', now()
    );
  ELSE
    UPDATE public.torneo_propuestas_partido
    SET sets_json_j1 = CASE WHEN v_user_lado = 1 THEN v_sets ELSE sets_json_j1 END,
        sets_json_j2 = CASE WHEN v_user_lado = 2 THEN v_sets ELSE sets_json_j2 END,
        equipo1_id = v_partido.equipo1_id,
        equipo2_id = v_partido.equipo2_id,
        ultimo_cargado_por = p_user_id,
        debe_confirmar_equipo_id = v_debe_confirmar_equipo,
        estado = 'pendiente',
        updated_at = now()
    WHERE partido_id = p_partido_id;
  END IF;

  UPDATE public.partidos
  SET estado = 'esperando_validacion',
      set1_j1 = GREATEST(0, COALESCE(p_set1_j1, 0)),
      set1_j2 = GREATEST(0, COALESCE(p_set1_j2, 0)),
      set2_j1 = GREATEST(0, COALESCE(p_set2_j1, 0)),
      set2_j2 = GREATEST(0, COALESCE(p_set2_j2, 0)),
      set3_j1 = CASE WHEN p_set3_j1 IS NULL THEN NULL ELSE GREATEST(0, p_set3_j1) END,
      set3_j2 = CASE WHEN p_set3_j2 IS NULL THEN NULL ELSE GREATEST(0, p_set3_j2) END
  WHERE id = p_partido_id;

  RETURN 'OK';
END;
$$;

REVOKE ALL ON FUNCTION public.enviar_resultado_seguro_equipo(uuid, uuid, integer, integer, integer, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enviar_resultado_seguro_equipo(uuid, uuid, integer, integer, integer, integer, integer, integer) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public._confirmar_resultado_equipo_core(
  p_partido_id uuid,
  p_automatico boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partido public.partidos%rowtype;
  v_propuesta public.torneo_propuestas_partido%rowtype;
  v_set_row jsonb;
  v_sets jsonb;
  v_existing_historial_id uuid;
  v_sets_j1 integer := 0;
  v_sets_j2 integer := 0;
  v_pts_j1 integer := 0;
  v_pts_j2 integer := 0;
  v_winner_equipo uuid;
  v_resultado text;
  v_torneo_titulo text;
  v_equipo1 public.torneo_equipos%rowtype;
  v_equipo2 public.torneo_equipos%rowtype;
  v_ganador_perfil uuid;
BEGIN
  SELECT * INTO v_partido FROM public.partidos p WHERE p.id = p_partido_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'Partido no encontrado.';
  END IF;

  IF COALESCE(v_partido.estado, '') NOT IN ('esperando_validacion', 'finalizado') THEN
    RETURN 'El partido no esta esperando validacion.';
  END IF;

  IF v_partido.equipo1_id IS NULL OR v_partido.equipo2_id IS NULL THEN
    RETURN 'Este partido no tiene equipos de dobles asignados.';
  END IF;

  SELECT * INTO v_propuesta FROM public.torneo_propuestas_partido tpp WHERE tpp.partido_id = p_partido_id FOR UPDATE;

  SELECT h.id INTO v_existing_historial_id FROM public.torneo_partidos_historial h WHERE h.partido_id = p_partido_id LIMIT 1;

  IF v_propuesta.id IS NOT NULL THEN
    v_sets := COALESCE(v_propuesta.sets_json_j1, v_propuesta.sets_json_j2);
  END IF;

  IF v_sets IS NULL AND v_partido.set1_j1 IS NOT NULL AND v_partido.set1_j2 IS NOT NULL AND v_partido.set2_j1 IS NOT NULL AND v_partido.set2_j2 IS NOT NULL THEN
    v_sets := jsonb_build_array(
      jsonb_build_object('p1', v_partido.set1_j1, 'p2', v_partido.set1_j2),
      jsonb_build_object('p1', v_partido.set2_j1, 'p2', v_partido.set2_j2),
      jsonb_build_object('p1', COALESCE(v_partido.set3_j1, 0), 'p2', COALESCE(v_partido.set3_j2, 0))
    );
  END IF;

  IF v_sets IS NULL THEN
    RETURN 'No hay un resultado propuesto para confirmar.';
  END IF;

  FOR v_set_row IN SELECT value FROM jsonb_array_elements(v_sets)
  LOOP
    IF COALESCE((v_set_row->>'p1')::integer, 0) > COALESCE((v_set_row->>'p2')::integer, 0) THEN
      v_sets_j1 := v_sets_j1 + 1;
    ELSIF COALESCE((v_set_row->>'p2')::integer, 0) > COALESCE((v_set_row->>'p1')::integer, 0) THEN
      v_sets_j2 := v_sets_j2 + 1;
    END IF;
  END LOOP;

  IF v_sets_j1 = v_sets_j2 THEN
    RETURN 'El marcador propuesto no define un ganador valido.';
  END IF;

  IF v_sets_j1 > v_sets_j2 THEN
    v_winner_equipo := v_partido.equipo1_id;
    v_pts_j1 := 3;
    v_pts_j2 := 1;
  ELSE
    v_winner_equipo := v_partido.equipo2_id;
    v_pts_j2 := 3;
    v_pts_j1 := 1;
  END IF;

  v_resultado := FORMAT('%s-%s', v_sets_j1, v_sets_j2);

  SELECT t.titulo INTO v_torneo_titulo FROM public.torneos t WHERE t.id = v_partido.torneo_id::bigint;
  SELECT * INTO v_equipo1 FROM public.torneo_equipos WHERE id = v_partido.equipo1_id;
  SELECT * INTO v_equipo2 FROM public.torneo_equipos WHERE id = v_partido.equipo2_id;

  v_ganador_perfil := CASE WHEN v_winner_equipo = v_partido.equipo1_id THEN v_equipo1.jugador1_id ELSE v_equipo2.jugador1_id END;

  IF v_existing_historial_id IS NULL THEN
    WITH hist AS (
      INSERT INTO public.torneo_partidos_historial (
        partido_id, torneo_id, torneo_titulo, categoria, grupo,
        jugador1_id, jugador2_id, ganador_id,
        jugador1_perfil_id, jugador2_perfil_id, ganador_perfil_id,
        equipo1_id, equipo2_id, equipo_ganador_id,
        sets_json, sets_jugador1, sets_jugador2, puntos_jugador1, puntos_jugador2,
        external_match_key, cargado_por_perfil_id, cargado_en,
        stage_name, ronda
      ) VALUES (
        v_partido.id,
        COALESCE(v_partido.torneo_id, 0)::integer,
        v_torneo_titulo,
        COALESCE(v_partido.categoria, ''),
        COALESCE(v_partido.grupo, ''),
        v_equipo1.jugador1_id,
        v_equipo2.jugador1_id,
        v_ganador_perfil,
        v_equipo1.jugador1_id,
        v_equipo2.jugador1_id,
        v_ganador_perfil,
        v_partido.equipo1_id, v_partido.equipo2_id, v_winner_equipo,
        v_sets, v_sets_j1, v_sets_j2, v_pts_j1, v_pts_j2,
        v_propuesta.match_pair_key, v_propuesta.ultimo_cargado_por, now(),
        v_partido.stage_name, v_partido.ronda
      )
      RETURNING id
    )
    SELECT id INTO v_existing_historial_id FROM hist;
  END IF;

  UPDATE public.torneo_propuestas_partido
  SET estado = 'confirmado', debe_confirmar_equipo_id = NULL, updated_at = now(),
      confirmado_automaticamente = p_automatico
  WHERE id = v_propuesta.id;

  UPDATE public.partidos
  SET estado = 'finalizado',
      resultado = v_resultado,
      equipo_ganador_id = v_winner_equipo,
      sets_jugador1 = v_sets_j1,
      sets_jugador2 = v_sets_j2,
      confirmado_automaticamente = p_automatico
  WHERE id = p_partido_id;

  IF v_partido.torneo_id IS NOT NULL AND COALESCE(v_partido.grupo, '') <> '' THEN
    UPDATE public.torneo_equipos te
    SET
      puntos = COALESCE(te.puntos, 0) + CASE
        WHEN te.id = v_partido.equipo1_id THEN v_pts_j1
        WHEN te.id = v_partido.equipo2_id THEN v_pts_j2
        ELSE 0
      END,
      sets_ganados = COALESCE(te.sets_ganados, 0) + CASE
        WHEN te.id = v_partido.equipo1_id THEN v_sets_j1
        WHEN te.id = v_partido.equipo2_id THEN v_sets_j2
        ELSE 0
      END,
      sets_perdidos = COALESCE(te.sets_perdidos, 0) + CASE
        WHEN te.id = v_partido.equipo1_id THEN v_sets_j2
        WHEN te.id = v_partido.equipo2_id THEN v_sets_j1
        ELSE 0
      END,
      partidos_jugados = COALESCE(te.partidos_jugados, 0) + CASE
        WHEN te.id IN (v_partido.equipo1_id, v_partido.equipo2_id) THEN 1
        ELSE 0
      END,
      updated_at = now()
    WHERE te.torneo_id = v_partido.torneo_id
      AND te.categoria = v_partido.categoria
      AND te.grupo = v_partido.grupo
      AND te.id IN (v_partido.equipo1_id, v_partido.equipo2_id);
  END IF;

  RETURN 'OK_CONFIRMADO';
END;
$$;

REVOKE ALL ON FUNCTION public._confirmar_resultado_equipo_core(uuid, boolean) FROM PUBLIC;


CREATE OR REPLACE FUNCTION public.validar_resultado_seguro_equipo(
  p_partido_id uuid,
  p_user_id uuid,
  p_accion text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partido public.partidos%rowtype;
  v_propuesta public.torneo_propuestas_partido%rowtype;
  v_equipo1 public.torneo_equipos%rowtype;
  v_equipo2 public.torneo_equipos%rowtype;
  v_equipo_autorizado uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 'No autenticado.';
  END IF;
  IF p_user_id <> auth.uid() THEN
    RETURN 'No puedes actuar en nombre de otro jugador.';
  END IF;

  IF p_partido_id IS NULL OR p_user_id IS NULL THEN
    RETURN 'Partido o usuario invalido.';
  END IF;

  SELECT * INTO v_partido FROM public.partidos p WHERE p.id = p_partido_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'Partido no encontrado.';
  END IF;

  IF v_partido.equipo1_id IS NULL OR v_partido.equipo2_id IS NULL THEN
    RETURN 'Este partido no tiene equipos de dobles asignados.';
  END IF;

  SELECT * INTO v_equipo1 FROM public.torneo_equipos WHERE id = v_partido.equipo1_id;
  SELECT * INTO v_equipo2 FROM public.torneo_equipos WHERE id = v_partido.equipo2_id;

  IF p_user_id NOT IN (v_equipo1.jugador1_id, v_equipo1.jugador2_id, v_equipo2.jugador1_id, v_equipo2.jugador2_id) THEN
    RETURN 'Solo los integrantes de los equipos del partido pueden validar resultado.';
  END IF;

  SELECT * INTO v_propuesta FROM public.torneo_propuestas_partido tpp WHERE tpp.partido_id = p_partido_id FOR UPDATE;

  IF v_propuesta.id IS NOT NULL AND v_propuesta.debe_confirmar_equipo_id IS NOT NULL THEN
    v_equipo_autorizado := v_propuesta.debe_confirmar_equipo_id;
  ELSE
    v_equipo_autorizado := v_partido.equipo2_id;
  END IF;

  IF v_equipo_autorizado = v_equipo1.id THEN
    IF p_user_id NOT IN (v_equipo1.jugador1_id, v_equipo1.jugador2_id) THEN
      RETURN 'Solo un integrante del equipo rival puede confirmar o rechazar este resultado.';
    END IF;
  ELSE
    IF p_user_id NOT IN (v_equipo2.jugador1_id, v_equipo2.jugador2_id) THEN
      RETURN 'Solo un integrante del equipo rival puede confirmar o rechazar este resultado.';
    END IF;
  END IF;

  IF LOWER(COALESCE(p_accion, '')) = 'rechazar' THEN
    UPDATE public.partidos
    SET estado = 'programado', resultado = NULL, equipo_ganador_id = NULL,
        set1_j1 = NULL, set1_j2 = NULL, set2_j1 = NULL, set2_j2 = NULL, set3_j1 = NULL, set3_j2 = NULL,
        confirmado_automaticamente = false
    WHERE id = p_partido_id;

    IF FOUND AND v_propuesta.id IS NOT NULL THEN
      UPDATE public.torneo_propuestas_partido
      SET estado = 'discrepancia', sets_json_j1 = NULL, sets_json_j2 = NULL, debe_confirmar_equipo_id = NULL, updated_at = now(),
          confirmado_automaticamente = false
      WHERE id = v_propuesta.id;
    END IF;

    RETURN 'OK_RECHAZADO';
  END IF;

  IF LOWER(COALESCE(p_accion, '')) <> 'confirmar' THEN
    RETURN 'Accion invalida.';
  END IF;

  RETURN public._confirmar_resultado_equipo_core(p_partido_id, false);
END;
$$;

REVOKE ALL ON FUNCTION public.validar_resultado_seguro_equipo(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_resultado_seguro_equipo(uuid, uuid, text) TO authenticated, service_role;


-- ============================================================
-- 10. auto_confirmar_resultados_equipos_vencidos + cron job propio
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_confirmar_resultados_equipos_vencidos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row record;
  v_result text;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT tpp.partido_id
    FROM public.torneo_propuestas_partido tpp
    JOIN public.partidos p ON p.id = tpp.partido_id
    WHERE tpp.estado = 'pendiente'
      AND tpp.debe_confirmar_equipo_id IS NOT NULL
      AND tpp.updated_at < now() - interval '24 hours'
      AND p.estado = 'esperando_validacion'
  LOOP
    v_result := public._confirmar_resultado_equipo_core(v_row.partido_id, true);
    IF v_result = 'OK_CONFIRMADO' THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_confirmar_resultados_equipos_vencidos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_confirmar_resultados_equipos_vencidos() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'auto-confirmar-resultados-equipos-vencidos';
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

SELECT cron.schedule(
  'auto-confirmar-resultados-equipos-vencidos',
  '*/30 * * * *',
  $$SELECT public.auto_confirmar_resultados_equipos_vencidos();$$
);


-- ============================================================
-- 11. admin_marcar_wo_equipo
--     Espejo de admin_marcar_wo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_marcar_wo_equipo(p_partido_id uuid, p_equipo_ganador_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partido public.partidos%rowtype;
  v_sets_j1 integer;
  v_sets_j2 integer;
  v_pts_j1 integer;
  v_pts_j2 integer;
  v_titulo text;
  v_existing record;
  v_old_pts_j1 integer := 0;
  v_old_pts_j2 integer := 0;
  v_old_sets_j1 integer := 0;
  v_old_sets_j2 integer := 0;
  v_ya_registrado boolean := false;
  v_equipo1 public.torneo_equipos%rowtype;
  v_equipo2 public.torneo_equipos%rowtype;
  v_ganador_perfil uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permiso denegado: solo admin puede marcar W.O.';
  END IF;

  SELECT * INTO v_partido FROM public.partidos WHERE id = p_partido_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partido no encontrado: %', p_partido_id;
  END IF;

  IF v_partido.equipo1_id IS NULL OR v_partido.equipo2_id IS NULL THEN
    RAISE EXCEPTION 'El partido no tiene ambos equipos asignados.';
  END IF;

  IF p_equipo_ganador_id NOT IN (v_partido.equipo1_id, v_partido.equipo2_id) THEN
    RAISE EXCEPTION 'El ganador debe ser uno de los dos equipos del partido.';
  END IF;

  SELECT * INTO v_equipo1 FROM public.torneo_equipos WHERE id = v_partido.equipo1_id;
  SELECT * INTO v_equipo2 FROM public.torneo_equipos WHERE id = v_partido.equipo2_id;

  IF p_equipo_ganador_id = v_partido.equipo1_id THEN
    v_sets_j1 := 2; v_sets_j2 := 0;
    v_pts_j1 := 3; v_pts_j2 := 0;
  ELSE
    v_sets_j1 := 0; v_sets_j2 := 2;
    v_pts_j1 := 0; v_pts_j2 := 3;
  END IF;

  v_ganador_perfil := CASE WHEN p_equipo_ganador_id = v_partido.equipo1_id THEN v_equipo1.jugador1_id ELSE v_equipo2.jugador1_id END;

  UPDATE public.torneo_propuestas_partido
  SET estado = 'confirmado', debe_confirmar_equipo_id = NULL, updated_at = now()
  WHERE partido_id = p_partido_id
    AND estado IN ('discrepancia', 'pendiente');

  SELECT id, puntos_jugador1, puntos_jugador2, sets_jugador1, sets_jugador2
  INTO v_existing
  FROM public.torneo_partidos_historial
  WHERE partido_id = p_partido_id
  LIMIT 1;

  v_ya_registrado := FOUND;
  IF v_ya_registrado THEN
    v_old_pts_j1 := COALESCE(v_existing.puntos_jugador1, 0);
    v_old_pts_j2 := COALESCE(v_existing.puntos_jugador2, 0);
    v_old_sets_j1 := COALESCE(v_existing.sets_jugador1, 0);
    v_old_sets_j2 := COALESCE(v_existing.sets_jugador2, 0);
  END IF;

  SELECT titulo INTO v_titulo FROM public.torneos WHERE id = v_partido.torneo_id::bigint;

  IF v_ya_registrado THEN
    UPDATE public.torneo_partidos_historial
    SET jugador1_perfil_id = v_equipo1.jugador1_id,
        jugador2_perfil_id = v_equipo2.jugador1_id,
        ganador_perfil_id = v_ganador_perfil,
        jugador1_id = v_equipo1.jugador1_id,
        jugador2_id = v_equipo2.jugador1_id,
        ganador_id = v_ganador_perfil,
        equipo1_id = v_partido.equipo1_id,
        equipo2_id = v_partido.equipo2_id,
        equipo_ganador_id = p_equipo_ganador_id,
        sets_json = NULL,
        sets_jugador1 = v_sets_j1,
        sets_jugador2 = v_sets_j2,
        puntos_jugador1 = v_pts_j1,
        puntos_jugador2 = v_pts_j2,
        es_wo = true,
        cargado_por_perfil_id = auth.uid(),
        registrado_por = auth.uid(),
        cargado_en = now()
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO public.torneo_partidos_historial (
      partido_id, torneo_id, torneo_titulo, categoria, grupo,
      jugador1_id, jugador2_id, ganador_id,
      jugador1_perfil_id, jugador2_perfil_id, ganador_perfil_id,
      equipo1_id, equipo2_id, equipo_ganador_id,
      sets_json, sets_jugador1, sets_jugador2,
      puntos_jugador1, puntos_jugador2, es_wo,
      cargado_por_perfil_id, registrado_por, cargado_en,
      stage_name, ronda
    ) VALUES (
      v_partido.id,
      v_partido.torneo_id::integer,
      v_titulo,
      COALESCE(v_partido.categoria, ''),
      COALESCE(v_partido.grupo, ''),
      v_equipo1.jugador1_id,
      v_equipo2.jugador1_id,
      v_ganador_perfil,
      v_equipo1.jugador1_id,
      v_equipo2.jugador1_id,
      v_ganador_perfil,
      v_partido.equipo1_id, v_partido.equipo2_id, p_equipo_ganador_id,
      NULL, v_sets_j1, v_sets_j2,
      v_pts_j1, v_pts_j2, true,
      auth.uid(), auth.uid(), now(),
      v_partido.stage_name, v_partido.ronda
    );
  END IF;

  UPDATE public.partidos
  SET estado = 'finalizado',
      resultado = 'W.O.',
      equipo_ganador_id = p_equipo_ganador_id,
      es_wo = true,
      sets_jugador1 = v_sets_j1,
      sets_jugador2 = v_sets_j2,
      set1_j1 = NULL, set1_j2 = NULL,
      set2_j1 = NULL, set2_j2 = NULL,
      set3_j1 = NULL, set3_j2 = NULL,
      updated_at = now()
  WHERE id = p_partido_id;

  IF COALESCE(v_partido.grupo, '') <> '' AND v_partido.bracket_tipo IS NULL THEN
    UPDATE public.torneo_equipos te
    SET
      puntos = COALESCE(te.puntos, 0)
        + CASE WHEN te.id = v_partido.equipo1_id THEN v_pts_j1 - v_old_pts_j1
               WHEN te.id = v_partido.equipo2_id THEN v_pts_j2 - v_old_pts_j2
               ELSE 0 END,
      sets_ganados = COALESCE(te.sets_ganados, 0)
        + CASE WHEN te.id = v_partido.equipo1_id THEN v_sets_j1 - v_old_sets_j1
               WHEN te.id = v_partido.equipo2_id THEN v_sets_j2 - v_old_sets_j2
               ELSE 0 END,
      sets_perdidos = COALESCE(te.sets_perdidos, 0)
        + CASE WHEN te.id = v_partido.equipo1_id THEN v_sets_j2 - v_old_sets_j2
               WHEN te.id = v_partido.equipo2_id THEN v_sets_j1 - v_old_sets_j1
               ELSE 0 END,
      partidos_jugados = COALESCE(te.partidos_jugados, 0)
        + CASE WHEN NOT v_ya_registrado AND te.id IN (v_partido.equipo1_id, v_partido.equipo2_id) THEN 1
               ELSE 0 END,
      updated_at = now()
    WHERE te.torneo_id = v_partido.torneo_id
      AND te.categoria = v_partido.categoria
      AND te.grupo = v_partido.grupo
      AND te.id IN (v_partido.equipo1_id, v_partido.equipo2_id);
  END IF;

  RETURN FORMAT(
    'OK: Partido %s marcado como W.O. Equipo ganador: %s. Historial: %s.',
    p_partido_id,
    p_equipo_ganador_id,
    CASE WHEN v_ya_registrado THEN 'actualizado' ELSE 'insertado' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_marcar_wo_equipo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_marcar_wo_equipo(uuid, uuid) TO authenticated, service_role;


-- ============================================================
-- 12. obtener_estado_equipo_torneo
--     Espejo de obtener_estado_jugador_torneo. Resuelve el equipo
--     del jugador llamante y devuelve el mismo shape JSON.
-- ============================================================

CREATE OR REPLACE FUNCTION public.obtener_estado_equipo_torneo(p_torneo_id bigint, p_perfil_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_equipo_id        uuid;
  v_next_match       jsonb := NULL;
  v_stats            jsonb;
  v_ronda_actual     integer := NULL;
  v_total            integer := 0;
  v_wins             integer := 0;
  v_losses           integer := 0;
  v_sets_won         integer := 0;
  v_sets_lost        integer := 0;

  v_bracket_played   integer := 0;
  v_bracket_wins     integer := 0;
  v_bracket_losses   integer := 0;
  v_max_ronda        integer := NULL;
  v_total_rondas     integer := NULL;
  v_has_pending      boolean := false;
  v_stage_name       text := NULL;
  v_current_round    integer := NULL;

  v_cat              text := NULL;
  v_pendientes       integer := 0;
  v_playoffs_on      boolean := false;

  v_rival_equipo_id  uuid;
  v_rival_j1_id      uuid;
  v_rival_j1_nombre  text;
  v_rival_j1_whatsapp text;
  v_rival_j2_id      uuid;
  v_rival_j2_nombre  text;
  v_rival_j2_whatsapp text;
  v_rival_nombre     text;

  rec RECORD;
BEGIN
  SELECT te.id, te.categoria
  INTO v_equipo_id, v_cat
  FROM public.torneo_equipos te
  WHERE te.torneo_id = p_torneo_id
    AND (te.jugador1_id = p_perfil_id OR te.jugador2_id = p_perfil_id)
  LIMIT 1;

  IF v_equipo_id IS NULL THEN
    RETURN jsonb_build_object(
      'estado', 'sin_participacion',
      'proximo_partido', NULL,
      'stats', jsonb_build_object('total', 0, 'wins', 0, 'losses', 0, 'sets_won', 0, 'sets_lost', 0, 'win_rate', 0),
      'ronda_actual', NULL,
      'mensaje', 'No tenes un equipo formado en este torneo todavia.'
    );
  END IF;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE equipo_ganador_id = v_equipo_id)::int,
    COUNT(*) FILTER (WHERE equipo_ganador_id IS NOT NULL AND equipo_ganador_id <> v_equipo_id)::int,
    COALESCE(SUM(
      CASE WHEN equipo1_id = v_equipo_id THEN
        COALESCE(set1_j1,0) + COALESCE(set2_j1,0) + COALESCE(set3_j1,0)
      ELSE
        COALESCE(set1_j2,0) + COALESCE(set2_j2,0) + COALESCE(set3_j2,0)
      END
    ), 0)::int,
    COALESCE(SUM(
      CASE WHEN equipo1_id = v_equipo_id THEN
        COALESCE(set1_j2,0) + COALESCE(set2_j2,0) + COALESCE(set3_j2,0)
      ELSE
        COALESCE(set1_j1,0) + COALESCE(set2_j1,0) + COALESCE(set3_j1,0)
      END
    ), 0)::int
  INTO v_total, v_wins, v_losses, v_sets_won, v_sets_lost
  FROM public.partidos
  WHERE torneo_id = p_torneo_id
    AND (equipo1_id = v_equipo_id OR equipo2_id = v_equipo_id)
    AND estado = 'finalizado';

  v_stats := jsonb_build_object(
    'total', v_total,
    'wins', v_wins,
    'losses', v_losses,
    'sets_won', v_sets_won,
    'sets_lost', v_sets_lost,
    'win_rate', CASE WHEN v_total > 0 THEN ROUND((v_wins::numeric / v_total) * 100) ELSE 0 END
  );

  IF v_total = 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.partidos
      WHERE torneo_id = p_torneo_id
        AND (equipo1_id = v_equipo_id OR equipo2_id = v_equipo_id)
        AND estado IN ('programado', 'en_curso', 'esperando_validacion')
    ) INTO v_has_pending;

    IF NOT v_has_pending THEN
      RETURN jsonb_build_object(
        'estado', 'sin_participacion',
        'proximo_partido', NULL,
        'stats', v_stats,
        'ronda_actual', NULL,
        'mensaje', 'No tenes partidos registrados en este torneo todavia.'
      );
    END IF;
  END IF;

  SELECT
    p.id, p.jornada, p.estado, p.fecha_programada,
    p.equipo1_id, p.equipo2_id, p.ronda, p.bracket_tipo, p.grupo, p.categoria, p.stage_name,
    e1.jugador1_id AS e1_j1, e1.jugador2_id AS e1_j2,
    e2.jugador1_id AS e2_j1, e2.jugador2_id AS e2_j2,
    pr_e1_j1.nombre_completo AS e1_j1_nombre, pr_e1_j2.nombre_completo AS e1_j2_nombre,
    pr_e2_j1.nombre_completo AS e2_j1_nombre, pr_e2_j2.nombre_completo AS e2_j2_nombre,
    pr_e1_j1.whatsapp AS e1_j1_whatsapp, pr_e1_j2.whatsapp AS e1_j2_whatsapp,
    pr_e2_j1.whatsapp AS e2_j1_whatsapp, pr_e2_j2.whatsapp AS e2_j2_whatsapp
  INTO rec
  FROM public.partidos p
  JOIN public.torneo_equipos e1 ON e1.id = p.equipo1_id
  JOIN public.torneo_equipos e2 ON e2.id = p.equipo2_id
  LEFT JOIN public.perfiles pr_e1_j1 ON pr_e1_j1.id = e1.jugador1_id
  LEFT JOIN public.perfiles pr_e1_j2 ON pr_e1_j2.id = e1.jugador2_id
  LEFT JOIN public.perfiles pr_e2_j1 ON pr_e2_j1.id = e2.jugador1_id
  LEFT JOIN public.perfiles pr_e2_j2 ON pr_e2_j2.id = e2.jugador2_id
  WHERE p.torneo_id = p_torneo_id
    AND (p.equipo1_id = v_equipo_id OR p.equipo2_id = v_equipo_id)
    AND p.estado IN ('programado', 'en_curso', 'esperando_validacion')
  ORDER BY
    CASE p.estado
      WHEN 'esperando_validacion' THEN 0
      WHEN 'en_curso' THEN 1
      ELSE 2
    END ASC,
    p.ronda ASC NULLS LAST,
    p.jornada ASC,
    p.fecha_programada ASC NULLS LAST
  LIMIT 1;

  IF rec.id IS NOT NULL THEN
    IF rec.equipo1_id = v_equipo_id THEN
      v_rival_equipo_id := rec.equipo2_id;
      v_rival_j1_id := rec.e2_j1; v_rival_j1_nombre := rec.e2_j1_nombre; v_rival_j1_whatsapp := rec.e2_j1_whatsapp;
      v_rival_j2_id := rec.e2_j2; v_rival_j2_nombre := rec.e2_j2_nombre; v_rival_j2_whatsapp := rec.e2_j2_whatsapp;
    ELSE
      v_rival_equipo_id := rec.equipo1_id;
      v_rival_j1_id := rec.e1_j1; v_rival_j1_nombre := rec.e1_j1_nombre; v_rival_j1_whatsapp := rec.e1_j1_whatsapp;
      v_rival_j2_id := rec.e1_j2; v_rival_j2_nombre := rec.e1_j2_nombre; v_rival_j2_whatsapp := rec.e1_j2_whatsapp;
    END IF;

    v_rival_nombre := TRIM(BOTH ' / ' FROM
      COALESCE(v_rival_j1_nombre, 'Jugador') || ' / ' || COALESCE(v_rival_j2_nombre, 'Jugador')
    );

    v_next_match := jsonb_build_object(
      'id', rec.id,
      'jornada', rec.jornada,
      'estado', rec.estado,
      'fecha_programada', rec.fecha_programada,
      'equipo1_id', rec.equipo1_id,
      'equipo2_id', rec.equipo2_id,
      'ronda', rec.ronda,
      'bracket_tipo', rec.bracket_tipo,
      'grupo', rec.grupo,
      'categoria', rec.categoria,
      'stage_name', rec.stage_name,
      'rival_equipo_id', v_rival_equipo_id,
      'rival_nombre', v_rival_nombre,
      'rival_jugadores', jsonb_build_array(
        jsonb_build_object('id', v_rival_j1_id, 'nombre', v_rival_j1_nombre, 'whatsapp', v_rival_j1_whatsapp),
        jsonb_build_object('id', v_rival_j2_id, 'nombre', v_rival_j2_nombre, 'whatsapp', v_rival_j2_whatsapp)
      ),
      'jugador1_id', rec.e1_j1,
      'jugador2_id', rec.e2_j1,
      'rival_id', v_rival_j1_id,
      'rival_whatsapp', v_rival_j1_whatsapp
    );

    RETURN jsonb_build_object(
      'estado', 'activo',
      'proximo_partido', v_next_match,
      'stats', v_stats,
      'ronda_actual', rec.ronda,
      'stage_name', v_stage_name,
      'mensaje', 'Tenes un partido pendiente.'
    );
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE bracket_tipo = 'eliminacion_directa')::int,
    COUNT(*) FILTER (WHERE bracket_tipo = 'eliminacion_directa' AND equipo_ganador_id = v_equipo_id)::int,
    COUNT(*) FILTER (WHERE bracket_tipo = 'eliminacion_directa' AND equipo_ganador_id IS NOT NULL AND equipo_ganador_id <> v_equipo_id)::int,
    MAX(ronda) FILTER (WHERE bracket_tipo = 'eliminacion_directa')
  INTO v_bracket_played, v_bracket_wins, v_bracket_losses, v_max_ronda
  FROM public.partidos
  WHERE torneo_id = p_torneo_id
    AND (equipo1_id = v_equipo_id OR equipo2_id = v_equipo_id)
    AND estado = 'finalizado';

  IF v_max_ronda IS NOT NULL THEN
    SELECT MAX(ronda) INTO v_total_rondas
    FROM public.partidos
    WHERE torneo_id = p_torneo_id AND bracket_tipo = 'eliminacion_directa';

    v_ronda_actual := v_max_ronda;
  END IF;

  IF rec.id IS NOT NULL AND rec.ronda IS NOT NULL THEN
    v_current_round := rec.ronda;
  ELSIF v_max_ronda IS NOT NULL THEN
    v_current_round := v_max_ronda;
  END IF;

  IF v_current_round IS NOT NULL AND v_total_rondas IS NOT NULL THEN
    v_stage_name := public.calculate_stage_name(p_torneo_id, v_current_round);
  END IF;

  IF v_bracket_losses > 0 THEN
    IF v_max_ronda IS NOT NULL AND v_total_rondas IS NOT NULL AND v_max_ronda = v_total_rondas THEN
      RETURN jsonb_build_object(
        'estado', 'eliminado',
        'proximo_partido', NULL,
        'stats', v_stats,
        'ronda_actual', v_ronda_actual,
        'stage_name', v_stage_name,
        'mensaje', 'Quedaron eliminados en la final. Pueden seguir viendo los resultados del torneo.'
      );
    END IF;

    RETURN jsonb_build_object(
      'estado', 'eliminado',
      'proximo_partido', NULL,
      'stats', v_stats,
      'ronda_actual', v_ronda_actual,
      'stage_name', v_stage_name,
      'mensaje', 'No avanzaron a la siguiente ronda. Pueden seguir viendo los resultados del torneo.'
    );
  END IF;

  IF v_bracket_wins > 0 AND v_bracket_losses = 0 THEN
    IF v_max_ronda IS NOT NULL AND v_total_rondas IS NOT NULL AND v_max_ronda = v_total_rondas THEN
      RETURN jsonb_build_object(
        'estado', 'campeon',
        'proximo_partido', NULL,
        'stats', v_stats,
        'ronda_actual', v_ronda_actual,
        'stage_name', v_stage_name,
        'mensaje', 'Son los campeones del torneo!'
      );
    END IF;

    RETURN jsonb_build_object(
      'estado', 'esperando_siguiente_ronda',
      'proximo_partido', NULL,
      'stats', v_stats,
      'ronda_actual', v_ronda_actual,
      'stage_name', v_stage_name,
      'mensaje', 'Avanzaron a la siguiente ronda. Esperen que se generen los cruces.'
    );
  END IF;

  IF v_total > 0 AND v_bracket_played = 0 THEN
    IF v_cat IS NULL THEN
      SELECT p.categoria INTO v_cat
      FROM public.partidos p
      WHERE p.torneo_id = p_torneo_id
        AND (p.equipo1_id = v_equipo_id OR p.equipo2_id = v_equipo_id)
        AND p.estado = 'finalizado'
      LIMIT 1;
    END IF;

    SELECT COALESCE(tc.crear_playoffs_eliminacion_directa, false)
    INTO v_playoffs_on
    FROM public.torneo_configuracion tc
    WHERE tc.torneo_id = p_torneo_id;
    v_playoffs_on := COALESCE(v_playoffs_on, false);

    SELECT COUNT(*)
    INTO v_pendientes
    FROM public.partidos p
    WHERE p.torneo_id = p_torneo_id
      AND (v_cat IS NULL OR p.categoria = v_cat)
      AND (p.bracket_tipo IS NULL OR p.bracket_tipo <> 'eliminacion_directa')
      AND p.estado <> 'finalizado'
      AND p.equipo1_id IS NOT NULL;

    IF v_pendientes > 0 THEN
      RETURN jsonb_build_object(
        'estado', 'fase_grupos_en_curso',
        'proximo_partido', NULL,
        'stats', v_stats,
        'ronda_actual', NULL,
        'mensaje', 'Terminaron sus partidos. La clasificacion se definira cuando se jueguen todos los partidos de la fase de grupos.'
      );
    END IF;

    IF v_playoffs_on AND public.equipo_clasifica_en_fase_grupos(p_torneo_id, v_cat, v_equipo_id) THEN
      RETURN jsonb_build_object(
        'estado', 'esperando_siguiente_ronda',
        'proximo_partido', NULL,
        'stats', v_stats,
        'ronda_actual', NULL,
        'mensaje', 'Clasificaron a los playoffs. Esperen que se generen los cruces.'
      );
    END IF;

    RETURN jsonb_build_object(
      'estado', 'eliminado',
      'proximo_partido', NULL,
      'stats', v_stats,
      'ronda_actual', NULL,
      'mensaje', 'La fase de grupos termino y no clasificaron a los playoffs.'
    );
  END IF;

  RETURN jsonb_build_object(
    'estado', 'sin_participacion',
    'proximo_partido', NULL,
    'stats', v_stats,
    'ronda_actual', NULL,
    'mensaje', 'No hay informacion disponible sobre el estado del equipo en el torneo.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_estado_equipo_torneo(bigint, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_estado_equipo_torneo(bigint, uuid) TO authenticated, service_role;


-- ============================================================
-- 13. Triggers nuevos y aditivos sobre partidos
--     Gateados por columnas equipo* (NULL en todo torneo singles),
--     por lo que son no-op garantizado para singles.
-- ============================================================

CREATE OR REPLACE FUNCTION public.promover_ganador_bracket_equipo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.bracket_tipo = 'eliminacion_directa'
    AND NEW.estado = 'finalizado'
    AND NEW.equipo_ganador_id IS NOT NULL
    AND NEW.siguiente_partido_id IS NOT NULL
    AND (OLD.estado IS DISTINCT FROM 'finalizado' OR OLD.equipo_ganador_id IS NULL)
  THEN
    IF NEW.posicion_bracket % 2 = 1 THEN
      UPDATE public.partidos SET equipo1_id = NEW.equipo_ganador_id WHERE id = NEW.siguiente_partido_id;
    ELSE
      UPDATE public.partidos SET equipo2_id = NEW.equipo_ganador_id WHERE id = NEW.siguiente_partido_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_promover_ganador_bracket_equipo ON public.partidos;
CREATE TRIGGER trigger_promover_ganador_bracket_equipo
  AFTER UPDATE ON public.partidos
  FOR EACH ROW EXECUTE FUNCTION public.promover_ganador_bracket_equipo();

REVOKE ALL ON FUNCTION public.promover_ganador_bracket_equipo() FROM PUBLIC;


CREATE OR REPLACE FUNCTION public.finalizar_grupo_equipos_si_completo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_torneo_id bigint;
  v_categoria text;
  v_pendientes integer;
BEGIN
  IF NEW.estado <> 'finalizado'
     OR OLD.estado = 'finalizado'
     OR NEW.bracket_tipo = 'eliminacion_directa'
     OR NEW.equipo1_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_torneo_id := NEW.torneo_id;
  v_categoria := NEW.categoria;

  SELECT COUNT(*) INTO v_pendientes
  FROM public.partidos
  WHERE torneo_id = v_torneo_id
    AND (v_categoria IS NULL OR categoria = v_categoria)
    AND (bracket_tipo IS NULL OR bracket_tipo <> 'eliminacion_directa')
    AND equipo1_id IS NOT NULL
    AND estado <> 'finalizado';

  IF v_pendientes > 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.torneo_estado
  SET estado = 'FINALIZADO', updated_at = now()
  WHERE torneo_id = v_torneo_id
    AND (v_categoria IS NULL OR categoria = v_categoria)
    AND grupo NOT LIKE '%_PLAYOFFS'
    AND TRIM(estado) <> 'FINALIZADO';

  IF EXISTS (
    SELECT 1 FROM public.partidos
    WHERE torneo_id = v_torneo_id
      AND (v_categoria IS NULL OR categoria = v_categoria)
      AND bracket_tipo = 'eliminacion_directa'
  ) THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.torneo_configuracion
    WHERE torneo_id = v_torneo_id
      AND crear_playoffs_eliminacion_directa = true
      AND modalidad = 'dobles'
  ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.generar_playoffs_eliminacion_directa_equipos_torneo(v_torneo_id, v_categoria);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Auto-generacion de playoffs de dobles fallo para torneo %: %', v_torneo_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_finalizar_grupo_equipos_al_completar_partidos ON public.partidos;
CREATE TRIGGER trigger_finalizar_grupo_equipos_al_completar_partidos
  AFTER UPDATE ON public.partidos
  FOR EACH ROW EXECUTE FUNCTION public.finalizar_grupo_equipos_si_completo();

REVOKE ALL ON FUNCTION public.finalizar_grupo_equipos_si_completo() FROM PUBLIC;
