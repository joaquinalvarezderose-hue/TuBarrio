-- Consolidacion de configuracion del torneo: flujo unico diferido.
-- Elimina columnas redundantes/muertas y unifica a un solo flujo de sorteo manual.
-- Fecha: 2026-06-24

-- ============================================================
-- PASO 1: Limpiar columnas redundantes/muertas
-- ============================================================

-- max_participantes_por_grupo (vieja): muerta en funciones vivas, reemplazada por jugadores_por_grupo renombrado
ALTER TABLE public.torneo_configuracion DROP COLUMN IF EXISTS max_participantes_por_grupo;

-- grupos_cantidad: duplicado muerto de numero_grupos, nunca fue leido por ninguna funcion
ALTER TABLE public.torneo_configuracion DROP COLUMN IF EXISTS grupos_cantidad;

-- sortear_grupos_en_sorteo: ya no aplica, el flujo siempre es diferido/manual
ALTER TABLE public.torneo_configuracion DROP COLUMN IF EXISTS sortear_grupos_en_sorteo;

-- ============================================================
-- PASO 2: Renombrar jugadores_por_grupo → max_participantes_por_grupo
-- Ahora es el unico campo que define el tamaño/cap por grupo
-- ============================================================
ALTER TABLE public.torneo_configuracion
  RENAME COLUMN jugadores_por_grupo TO max_participantes_por_grupo;

-- ============================================================
-- PASO 3: procesar_inscripcion_aprobada — version simplificada
-- Solo registra al jugador en grupo_base y actualiza el contador.
-- El sorteo es siempre manual (admin configura grupos y sortea).
-- ============================================================
CREATE OR REPLACE FUNCTION public.procesar_inscripcion_aprobada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categoria text;
  v_grupo_base text;
BEGIN
  IF NEW.estado <> 'pagado_aprobado' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.estado = 'pagado_aprobado' THEN
    RETURN NEW;
  END IF;

  IF NEW.aprobado_en IS NULL THEN
    NEW.aprobado_en := now();
  END IF;

  v_categoria := NULLIF(TRIM(COALESCE(NEW.categoria, '')), '');
  IF v_categoria IS NULL THEN
    SELECT t.subtitulo INTO v_categoria FROM public.torneos t WHERE t.id = NEW.torneo_id LIMIT 1;
  END IF;
  v_categoria := COALESCE(v_categoria, 'General');

  SELECT COALESCE(NULLIF(TRIM(tc.grupo_base), ''), format('TORNEO_%s', NEW.torneo_id))
  INTO v_grupo_base
  FROM public.torneo_configuracion tc
  WHERE tc.torneo_id = NEW.torneo_id;

  v_grupo_base := COALESCE(v_grupo_base, format('TORNEO_%s', NEW.torneo_id));

  NEW.categoria := v_categoria;
  NEW.grupo := v_grupo_base;

  INSERT INTO public.torneo_estado (torneo_id, categoria, grupo, estado, current_participantes, sorteo_realizado)
  VALUES (NEW.torneo_id, v_categoria, v_grupo_base, 'RECRUITING', 0, false)
  ON CONFLICT ON CONSTRAINT uq_torneo_estado_scope
  DO UPDATE SET updated_at = now();

  UPDATE public.torneo_estado te
  SET current_participantes = (
    SELECT COUNT(DISTINCT i.perfil_id)::integer
    FROM public.inscripciones_torneo i
    WHERE i.torneo_id = NEW.torneo_id
      AND COALESCE(NULLIF(TRIM(i.categoria), ''), v_categoria) = v_categoria
      AND i.estado = 'pagado_aprobado'
  ),
  updated_at = now()
  WHERE te.torneo_id = NEW.torneo_id
    AND te.categoria = v_categoria
    AND te.grupo = v_grupo_base;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.procesar_inscripcion_aprobada()
IS 'Trigger de aprobacion: asigna categoria y grupo_base al inscripto y actualiza el contador. El sorteo de grupos es siempre manual.';

-- ============================================================
-- PASO 4: sortear_grupos_y_fixture_torneo — version limpia
-- Jerarquia: numero_grupos > ceil(total/max_participantes_por_grupo)
-- Valida min_participantes_por_grupo si esta seteado.
-- ============================================================
CREATE OR REPLACE FUNCTION public.sortear_grupos_y_fixture_torneo(
  p_torneo_id bigint,
  p_categoria text DEFAULT NULL,
  p_grupo_base text DEFAULT NULL
)
RETURNS TABLE (
  categoria text,
  grupo_base text,
  max_participantes_por_grupo integer,
  grupos_creados integer,
  jugadores_sorteados integer,
  partidos_creados integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categoria           text;
  v_grupo_base          text;
  v_max_por_grupo       integer := 4;
  v_numero_grupos       integer := NULL;
  v_min_por_grupo       integer := NULL;
  v_perfiles            uuid[];
  v_total               integer := 0;
  v_grupos              integer := 0;
  v_base_size           integer := 0;
  v_remainder           integer := 0;
  v_group_idx           integer := 0;
  v_start               integer := 1;
  v_group_size          integer := 0;
  v_end_idx             integer := 0;
  v_grupo               text;
  v_partidos            integer := 0;
  v_has_existing        boolean := false;
  v_member              uuid;
  v_members             uuid[];
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
    COALESCE(NULLIF(TRIM(tc.grupo_base), ''), format('TORNEO_%s', p_torneo_id))
  INTO v_max_por_grupo, v_numero_grupos, v_min_por_grupo, v_grupo_base
  FROM public.torneo_configuracion tc
  WHERE tc.torneo_id = p_torneo_id;

  v_max_por_grupo := GREATEST(2, COALESCE(v_max_por_grupo, 4));
  v_min_por_grupo := COALESCE(v_min_por_grupo, 2);
  v_grupo_base := COALESCE(NULLIF(TRIM(COALESCE(p_grupo_base, v_grupo_base, '')), ''), format('TORNEO_%s', p_torneo_id));

  SELECT array_agg(DISTINCT i.perfil_id ORDER BY i.perfil_id)
  INTO v_perfiles
  FROM public.inscripciones_torneo i
  WHERE i.torneo_id = p_torneo_id
    AND COALESCE(NULLIF(TRIM(i.categoria), ''), v_categoria) = v_categoria
    AND i.estado = 'pagado_aprobado';

  IF COALESCE(array_length(v_perfiles, 1), 0) = 0 THEN
    SELECT array_agg(DISTINCT tj.perfil_id ORDER BY tj.perfil_id)
    INTO v_perfiles
    FROM public.torneo_jugadores tj
    WHERE tj.torneo_id = p_torneo_id
      AND COALESCE(tj.categoria, v_categoria) = v_categoria
      AND tj.grupo = v_grupo_base;
  END IF;

  IF array_length(v_perfiles, 1) IS NOT NULL THEN
    DECLARE
      v_i integer;
      v_j integer;
      v_tmp uuid;
    BEGIN
      FOR v_i IN REVERSE array_lower(v_perfiles, 1)..array_upper(v_perfiles, 1) LOOP
        EXIT WHEN v_i <= 1;
        v_j := 1 + floor(random() * v_i)::int;
        v_tmp := v_perfiles[v_j];
        v_perfiles[v_j] := v_perfiles[v_i];
        v_perfiles[v_i] := v_tmp;
      END LOOP;
    END;
  END IF;

  v_total := COALESCE(array_length(v_perfiles, 1), 0);

  IF v_total < 2 THEN
    RAISE EXCEPTION 'Se necesitan al menos 2 jugadores aprobados para sortear el torneo. Encontrados: %', v_total;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.partidos p
    WHERE p.torneo_id = p_torneo_id
      AND p.categoria = v_categoria
      AND (p.grupo = v_grupo_base OR p.grupo LIKE (v_grupo_base || '\_G%') ESCAPE '\')
  ) INTO v_has_existing;

  IF v_has_existing THEN
    RAISE EXCEPTION 'Ya existen partidos para %/%. Limpialos antes de re-sortear.', p_torneo_id, v_categoria;
  END IF;

  DELETE FROM public.torneo_jugadores tj
  WHERE tj.torneo_id = p_torneo_id
    AND tj.categoria = v_categoria
    AND (tj.grupo = v_grupo_base OR tj.grupo LIKE (v_grupo_base || '\_G%') ESCAPE '\');

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

  IF v_total < v_grupos * v_min_por_grupo THEN
    RAISE EXCEPTION 'No hay suficientes jugadores (% jugadores) para crear % grupos con minimo % por grupo.',
      v_total, v_grupos, v_min_por_grupo;
  END IF;

  v_base_size := FLOOR(v_total::numeric / v_grupos::numeric)::integer;
  v_remainder := MOD(v_total, v_grupos);

  FOR v_group_idx IN 1..v_grupos LOOP
    v_group_size := v_base_size + CASE WHEN v_group_idx <= v_remainder THEN 1 ELSE 0 END;
    v_end_idx := v_start + v_group_size - 1;
    v_members := v_perfiles[v_start:v_end_idx];
    v_grupo := CASE WHEN v_group_idx = 1 THEN v_grupo_base ELSE format('%s_G%s', v_grupo_base, v_group_idx) END;

    PERFORM public.upsert_torneo_grupo(
      p_torneo_id, v_categoria, v_grupo, NULL, 'GRUPOS', v_group_idx, NULL, (v_group_idx = 1)
    );

    INSERT INTO public.torneo_estado (torneo_id, categoria, grupo, estado, current_participantes, sorteo_realizado)
    VALUES (p_torneo_id, v_categoria, v_grupo, 'LOCKED', v_group_size, true)
    ON CONFLICT ON CONSTRAINT uq_torneo_estado_scope DO UPDATE
      SET estado = 'LOCKED', current_participantes = v_group_size, sorteo_realizado = true, updated_at = now();

    FOREACH v_member IN ARRAY v_members LOOP
      INSERT INTO public.torneo_jugadores (torneo_id, perfil_id, categoria, grupo, puntos, partidos_jugados, sets_ganados)
      VALUES (p_torneo_id, v_member, v_categoria, v_grupo, 0, 0, 0)
      ON CONFLICT DO NOTHING;
    END LOOP;

    UPDATE public.inscripciones_torneo i
    SET categoria = v_categoria, grupo = v_grupo, updated_at = now()
    WHERE i.torneo_id = p_torneo_id
      AND i.estado = 'pagado_aprobado'
      AND i.perfil_id = ANY(v_members);

    v_partidos := v_partidos + public.generar_fixture_round_robin_grupo(p_torneo_id, v_categoria, v_grupo);
    v_start := v_end_idx + 1;
  END LOOP;

  RETURN QUERY SELECT v_categoria, v_grupo_base, v_max_por_grupo, v_grupos, v_total, v_partidos;
END;
$$;

COMMENT ON FUNCTION public.sortear_grupos_y_fixture_torneo(bigint, text, text)
IS 'Sortea grupos y genera fixture round robin. Jerarquia: numero_grupos > ceil(total/max_participantes_por_grupo). Valida min_participantes_por_grupo.';

-- ============================================================
-- PASO 5: iniciar_torneo_en_curso — eliminar dependencia de sortear_grupos_en_sorteo
-- Solo transiciona grupos LOCKED a EN_CURSO.
-- ============================================================
CREATE OR REPLACE FUNCTION public.iniciar_torneo_en_curso(
  p_torneo_id bigint,
  p_categoria text DEFAULT NULL,
  p_grupo_base text DEFAULT NULL
)
RETURNS TABLE (
  torneo_id bigint,
  categoria text,
  grupo_base text,
  grupos_actualizados integer,
  partidos_creados integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categoria text;
  v_grupo_base text;
  v_grupos_actualizados integer := 0;
BEGIN
  v_categoria := NULLIF(TRIM(COALESCE(p_categoria, '')), '');
  IF v_categoria IS NULL THEN
    SELECT t.subtitulo INTO v_categoria FROM public.torneos t WHERE t.id = p_torneo_id LIMIT 1;
  END IF;
  v_categoria := COALESCE(v_categoria, 'General');

  SELECT COALESCE(NULLIF(TRIM(tc.grupo_base), ''), format('TORNEO_%s', p_torneo_id))
  INTO v_grupo_base
  FROM public.torneo_configuracion tc
  WHERE tc.torneo_id = p_torneo_id;

  v_grupo_base := COALESCE(NULLIF(TRIM(COALESCE(p_grupo_base, v_grupo_base, '')), ''), format('TORNEO_%s', p_torneo_id));

  UPDATE public.torneo_estado te
  SET estado = 'EN_CURSO', updated_at = now()
  WHERE te.torneo_id = p_torneo_id
    AND te.categoria = v_categoria
    AND (te.grupo = v_grupo_base OR te.grupo LIKE (v_grupo_base || '\_G%') ESCAPE '\')
    AND te.estado IN ('RECRUITING', 'LOCKED');

  GET DIAGNOSTICS v_grupos_actualizados = ROW_COUNT;

  RETURN QUERY SELECT p_torneo_id, v_categoria, v_grupo_base, v_grupos_actualizados, 0;
END;
$$;

COMMENT ON FUNCTION public.iniciar_torneo_en_curso(bigint, text, text)
IS 'Inicia un torneo pasando grupos de LOCKED/RECRUITING a EN_CURSO. El sorteo debe haberse ejecutado previamente.';

-- ============================================================
-- PASO 6: Eliminar trigger trg_iniciar_torneo_en_curso
-- Era especifico del flujo inmediato (sortear_grupos_en_sorteo=false).
-- Con el flujo unificado diferido, ya no aplica.
-- ============================================================
DROP TRIGGER IF EXISTS trg_iniciar_torneo_en_curso ON public.torneo_estado;
DROP FUNCTION IF EXISTS public.trg_iniciar_torneo_en_curso();
