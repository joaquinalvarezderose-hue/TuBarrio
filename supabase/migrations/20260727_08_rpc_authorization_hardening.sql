-- ============================================================
-- FIX DE SEGURIDAD PREEXISTENTE: varios RPCs SECURITY DEFINER de
-- administracion de torneo (sorteo, fixture, playoffs, forzar
-- resultado, W.O., resetear disputas, armar/deshacer parejas de
-- dobles) tienen GRANT EXECUTE TO authenticated pero NO validan rol
-- en absoluto en el cuerpo -- hoy cualquier usuario autenticado que
-- conozca el nombre del RPC podria invocarlas directo desde la
-- consola del browser para cualquier torneo. La unica proteccion real
-- era que el boton esta oculto en el frontend.
--
-- Esta migracion reproduce cada funcion completa (CREATE OR REPLACE,
-- misma firma, mismo cuerpo) agregando unicamente el gate de
-- autorizacion vía public.puede_administrar_torneo(). En las
-- funciones que ya tenian `IF NOT is_admin() THEN RAISE EXCEPTION`
-- (admin_forzar_resultado_partido, admin_resetear_disputa,
-- admin_marcar_wo_equipo, crear_equipo_dobles, eliminar_equipo_dobles)
-- se reemplaza ese chequeo por el nuevo helper, movido -- cuando hace
-- falta -- a despues de resolver el torneo_id del partido/equipo en
-- cuestion.
-- ============================================================

-- ── 1. sortear_grupos_y_fixture_torneo (sin chequeo previo) ─────────
create or replace function public.sortear_grupos_y_fixture_torneo(
  p_torneo_id bigint,
  p_categoria text default null,
  p_grupo_base text default null
)
returns table (
  categoria text,
  grupo_base text,
  max_participantes_por_grupo integer,
  grupos_creados integer,
  jugadores_sorteados integer,
  partidos_creados integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
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
begin
  if not public.puede_administrar_torneo(p_torneo_id) then
    raise exception 'Permiso denegado: no administras este torneo.';
  end if;

  v_categoria := NULLIF(TRIM(COALESCE(p_categoria, '')), '');
  if v_categoria is null then
    select t.subtitulo into v_categoria from public.torneos t where t.id = p_torneo_id limit 1;
  end if;
  v_categoria := COALESCE(v_categoria, 'General');

  select
    GREATEST(2, COALESCE(tc.max_participantes_por_grupo, 4)),
    tc.numero_grupos,
    tc.min_participantes_por_grupo,
    COALESCE(NULLIF(TRIM(tc.grupo_base), ''), format('TORNEO_%s', p_torneo_id))
  into v_max_por_grupo, v_numero_grupos, v_min_por_grupo, v_grupo_base
  from public.torneo_configuracion tc
  where tc.torneo_id = p_torneo_id;

  v_max_por_grupo := GREATEST(2, COALESCE(v_max_por_grupo, 4));
  -- v_min_por_grupo permanece NULL si el admin no lo configuro
  v_grupo_base := COALESCE(NULLIF(TRIM(COALESCE(p_grupo_base, v_grupo_base, '')), ''), format('TORNEO_%s', p_torneo_id));

  select array_agg(distinct i.perfil_id order by i.perfil_id)
  into v_perfiles
  from public.inscripciones_torneo i
  where i.torneo_id = p_torneo_id
    and COALESCE(NULLIF(TRIM(i.categoria), ''), v_categoria) = v_categoria
    and i.estado = 'pagado_aprobado';

  if COALESCE(array_length(v_perfiles, 1), 0) = 0 then
    select array_agg(distinct tj.perfil_id order by tj.perfil_id)
    into v_perfiles
    from public.torneo_jugadores tj
    where tj.torneo_id = p_torneo_id
      and COALESCE(tj.categoria, v_categoria) = v_categoria
      and tj.grupo = v_grupo_base;
  end if;

  if array_length(v_perfiles, 1) is not null then
    declare
      v_i integer;
      v_j integer;
      v_tmp uuid;
    begin
      for v_i in reverse array_lower(v_perfiles, 1)..array_upper(v_perfiles, 1) loop
        exit when v_i <= 1;
        v_j := 1 + floor(random() * v_i)::int;
        v_tmp := v_perfiles[v_j];
        v_perfiles[v_j] := v_perfiles[v_i];
        v_perfiles[v_i] := v_tmp;
      end loop;
    end;
  end if;

  v_total := COALESCE(array_length(v_perfiles, 1), 0);

  if v_total < 2 then
    raise exception 'Se necesitan al menos 2 jugadores aprobados para sortear el torneo. Encontrados: %', v_total;
  end if;

  select exists (
    select 1 from public.partidos p
    where p.torneo_id = p_torneo_id
      and p.categoria = v_categoria
      and (p.grupo = v_grupo_base OR p.grupo LIKE (v_grupo_base || '\_G%') ESCAPE '\')
  ) into v_has_existing;

  if v_has_existing then
    raise exception 'Ya existen partidos para %/%. Limpialos antes de re-sortear.', p_torneo_id, v_categoria;
  end if;

  delete from public.torneo_jugadores tj
  where tj.torneo_id = p_torneo_id
    and tj.categoria = v_categoria
    and (tj.grupo = v_grupo_base OR tj.grupo LIKE (v_grupo_base || '\_G%') ESCAPE '\');

  delete from public.torneo_estado te
  where te.torneo_id = p_torneo_id
    and te.categoria = v_categoria
    and (te.grupo = v_grupo_base OR te.grupo LIKE (v_grupo_base || '\_G%') ESCAPE '\');

  if v_numero_grupos is not null then
    v_grupos := LEAST(GREATEST(v_numero_grupos, 1), v_total);
  else
    v_grupos := CEIL(v_total::numeric / v_max_por_grupo::numeric)::integer;
  end if;

  if v_grupos < 1 then v_grupos := 1; end if;

  -- Validar minimo solo si el admin lo configuro explicitamente
  if v_min_por_grupo is not null and v_total < v_grupos * v_min_por_grupo then
    raise exception 'No hay suficientes jugadores (% jugadores) para crear % grupos con minimo % por grupo.',
      v_total, v_grupos, v_min_por_grupo;
  end if;

  v_base_size := FLOOR(v_total::numeric / v_grupos::numeric)::integer;
  v_remainder := MOD(v_total, v_grupos);

  for v_group_idx in 1..v_grupos loop
    v_group_size := v_base_size + CASE WHEN v_group_idx <= v_remainder THEN 1 ELSE 0 END;
    v_end_idx := v_start + v_group_size - 1;
    v_members := v_perfiles[v_start:v_end_idx];
    v_grupo := CASE WHEN v_group_idx = 1 THEN v_grupo_base ELSE format('%s_G%s', v_grupo_base, v_group_idx) END;

    perform public.upsert_torneo_grupo(
      p_torneo_id, v_categoria, v_grupo, NULL, 'GRUPOS', v_group_idx, NULL, (v_group_idx = 1)
    );

    insert into public.torneo_estado (torneo_id, categoria, grupo, estado, current_participantes, sorteo_realizado)
    values (p_torneo_id, v_categoria, v_grupo, 'LOCKED', v_group_size, true)
    on conflict on constraint uq_torneo_estado_scope do update
      set estado = 'LOCKED', current_participantes = v_group_size, sorteo_realizado = true, updated_at = now();

    foreach v_member in array v_members loop
      insert into public.torneo_jugadores (torneo_id, perfil_id, categoria, grupo, puntos, partidos_jugados, sets_ganados)
      values (p_torneo_id, v_member, v_categoria, v_grupo, 0, 0, 0)
      on conflict do nothing;
    end loop;

    update public.inscripciones_torneo i
    set categoria = v_categoria, grupo = v_grupo, updated_at = now()
    where i.torneo_id = p_torneo_id
      and i.estado = 'pagado_aprobado'
      and i.perfil_id = ANY(v_members);

    v_partidos := v_partidos + public.generar_fixture_round_robin_grupo(p_torneo_id, v_categoria, v_grupo);
    v_start := v_end_idx + 1;
  end loop;

  return query select v_categoria, v_grupo_base, v_max_por_grupo, v_grupos, v_total, v_partidos;
end;
$$;

-- ── 2. sortear_grupos_y_fixture_equipos_torneo (sin chequeo previo) ─
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
  IF NOT public.puede_administrar_torneo(p_torneo_id) THEN
    RAISE EXCEPTION 'Permiso denegado: no administras este torneo.';
  END IF;

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

-- ── 3. generar_fixture_round_robin_grupo (sin chequeo previo) ───────
create or replace function public.generar_fixture_round_robin_grupo(
  p_torneo_id bigint,
  p_categoria text,
  p_grupo text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfiles uuid[];
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
  v_can_insert_partidos boolean := false;
  v_partidos_existentes integer := 0;
  v_j1 uuid;
  v_j2 uuid;
begin
  if not public.puede_administrar_torneo(p_torneo_id) then
    raise exception 'Permiso denegado: no administras este torneo.';
  end if;

  select coalesce(array_agg(tj.perfil_id order by tj.perfil_id), '{}'::uuid[])
    into v_perfiles
  from public.torneo_jugadores tj
  where tj.torneo_id = p_torneo_id
    and tj.categoria = p_categoria
    and tj.grupo = p_grupo;

  if coalesce(array_length(v_perfiles, 1), 0) < 2 then
    return 0;
  end if;

  select coalesce(array_agg(player_id), '{}'::uuid[])
    into v_work
  from unnest(v_perfiles) as player_id;

  v_expected_partidos := (array_length(v_work, 1) * greatest(array_length(v_work, 1) - 1, 0)) / 2;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'partidos'
      and column_name in ('id', 'torneo_id', 'categoria', 'grupo', 'jornada', 'jugador1_id', 'jugador2_id', 'fecha_programada', 'resultado', 'estado', 'ganador_id')
    group by table_name
    having count(distinct column_name) = 11
  ) into v_can_insert_partidos;

  if not v_can_insert_partidos then
    raise exception 'La tabla public.partidos no tiene las columnas esperadas para crear cruces automaticamente.';
  end if;

  select count(*)::integer
    into v_partidos_existentes
  from public.partidos p
  where p.torneo_id = p_torneo_id
    and p.categoria = p_categoria
    and p.grupo = p_grupo;

  if v_partidos_existentes > 0 then
    raise exception 'El grupo % ya tiene % partidos cargados. Limpialos antes de re-sortear.', p_grupo, v_partidos_existentes;
  end if;

  if mod(array_length(v_work, 1), 2) = 1 then
    v_work := array_append(v_work, null::uuid);
  end if;

  v_slots := coalesce(array_length(v_work, 1), 0);
  v_half := v_slots / 2;
  v_rounds := greatest(v_slots - 1, 0);

  for v_round in 1..v_rounds loop
    for v_i in 1..v_half loop
      v_j1 := v_work[v_i];
      v_j2 := v_work[v_slots - v_i + 1];

      if v_j1 is null or v_j2 is null then
        continue;
      end if;

      insert into public.partidos (
        torneo_id,
        categoria,
        grupo,
        jornada,
        jugador1_id,
        jugador2_id,
        fecha_programada,
        resultado,
        estado,
        ganador_id
      ) values (
        p_torneo_id,
        p_categoria,
        p_grupo,
        v_round,
        v_j1,
        v_j2,
        null,
        'PENDIENTE',
        'programado',
        null
      );

      v_created := v_created + 1;
    end loop;

    if v_slots > 2 then
      v_tmp := v_work[v_slots];
      for v_j in reverse v_slots..3 loop
        v_work[v_j] := v_work[v_j - 1];
      end loop;
      v_work[2] := v_tmp;
    end if;
  end loop;

  if v_created <> v_expected_partidos then
    raise exception 'Se esperaban % partidos para %/%/% y se generaron %.', v_expected_partidos, p_torneo_id, p_categoria, p_grupo, v_created;
  end if;

  return v_created;
end;
$$;

-- ── 4. generar_fixture_round_robin_grupo_equipos (sin chequeo previo) ─
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
  IF NOT public.puede_administrar_torneo(p_torneo_id) THEN
    RAISE EXCEPTION 'Permiso denegado: no administras este torneo.';
  END IF;

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

-- ── 5. generar_playoffs_eliminacion_directa_torneo (sin chequeo previo) ─
create or replace function public.generar_playoffs_eliminacion_directa_torneo(
  p_torneo_id bigint,
  p_categoria text default null,
  p_grupo_base text default null
)
returns table (
  out_categoria text,
  grupo_playoffs text,
  grupos_fuente integer,
  clasificados_totales integer,
  partidos_creados integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria                 text;
  v_grupo_base                text;
  v_grupo_base_id             uuid;
  v_clasificados_por_grupo    integer := 2;
  v_habilitar_playoffs        boolean := false;
  v_incluir_mejores_terceros  boolean := false;
  v_cantidad_mejores_terceros integer := 0;
  v_grupo_playoffs            text;
  v_grupo_playoffs_id         uuid;
  v_total                     integer := 0;
  v_grupos_fuente             integer := 0;
  v_partidos                  integer := 0;
  v_has_existing              boolean := false;
  v_seeded                    uuid[];
  v_total_rondas              integer;
  v_match_ids                 uuid[];
  v_ronda                     integer;
  v_pos                       integer;
  v_num_matches               integer;
  v_flat_idx                  integer;
  v_flat_idx_next             integer;
  v_offset                    integer;
  v_offset_next               integer;
  v_j1                        uuid;
  v_j2                        uuid;
  v_grupos_no_finalizados     integer;
  i                           integer;
begin
  if not public.puede_administrar_torneo(p_torneo_id) then
    raise exception 'Permiso denegado: no administras este torneo.';
  end if;

  v_categoria := nullif(trim(coalesce(p_categoria, '')), '');
  if v_categoria is null then
    select t.subtitulo into v_categoria from public.torneos t where t.id = p_torneo_id limit 1;
  end if;
  v_categoria := coalesce(v_categoria, 'General');

  select
    greatest(1, coalesce(tc.clasificados_por_grupo, 2)),
    coalesce(tc.crear_playoffs_eliminacion_directa, false),
    coalesce(tc.incluir_mejores_terceros, false),
    coalesce(tc.cantidad_mejores_terceros, 0),
    tc.grupo_base_id
  into
    v_clasificados_por_grupo,
    v_habilitar_playoffs,
    v_incluir_mejores_terceros,
    v_cantidad_mejores_terceros,
    v_grupo_base_id
  from public.torneo_configuracion tc
  where tc.torneo_id = p_torneo_id;

  select grupo_id, grupo_codigo
  into v_grupo_base_id, v_grupo_base
  from public.resolver_grupo_base_torneo(p_torneo_id, v_categoria, p_grupo_base, v_grupo_base_id);

  if not v_habilitar_playoffs then
    raise exception 'Playoffs por eliminacion directa no habilitado en torneo_configuracion para torneo %.', p_torneo_id;
  end if;

  select count(*) into v_grupos_no_finalizados
  from public.torneo_estado
  where torneo_id = p_torneo_id
    and categoria = v_categoria
    and grupo not like '%_PLAYOFFS'
    and trim(estado) <> 'FINALIZADO';

  if v_grupos_no_finalizados > 0 then
    raise exception 'No se pueden generar playoffs: % grupo(s) aún no han finalizado todos sus partidos.', v_grupos_no_finalizados;
  end if;

  select exists (
    select 1 from public.partidos p
    where p.torneo_id = p_torneo_id and p.categoria = v_categoria and p.grupo like (v_grupo_base || '_PLAYOFFS')
  ) into v_has_existing;
  if v_has_existing then
    raise exception 'El playoffs ya tiene partidos cargados. Limpialos antes de regenerar.';
  end if;

  select exists (
    select 1 from public.torneo_partidos_historial h
    where h.torneo_id = p_torneo_id and h.categoria = v_categoria and h.grupo like (v_grupo_base || '_PLAYOFFS')
  ) into v_has_existing;
  if v_has_existing then
    raise exception 'El playoffs ya tiene historial cargado. Limpialo antes de regenerar.';
  end if;

  with base as (
    select
      tj.grupo,
      tj.perfil_id,
      coalesce(tj.puntos, 0)                                         as puntos,
      coalesce(tj.sets_ganados, 0)                                   as sets_ganados,
      coalesce(tj.sets_ganados, 0) - coalesce(tj.sets_perdidos, 0)   as diff_sets,
      coalesce(tj.games_ganados, 0) - coalesce(tj.games_perdidos, 0) as diff_games,
      coalesce(tj.partidos_jugados, 0)                               as partidos_jugados
    from public.torneo_jugadores tj
    where tj.torneo_id = p_torneo_id
      and tj.categoria = v_categoria
      and (tj.grupo = v_grupo_base or starts_with(tj.grupo, v_grupo_base || '_G'))
  ),
  h2h as (
    select
      b.perfil_id,
      (
        select count(*)
        from public.torneo_partidos_historial h
        where h.torneo_id = p_torneo_id
          and h.categoria = v_categoria
          and h.ganador_perfil_id = b.perfil_id
          and exists (
            select 1 from base riv
            where riv.grupo = b.grupo
              and riv.perfil_id <> b.perfil_id
              and riv.puntos = b.puntos
              and riv.diff_sets = b.diff_sets
              and riv.sets_ganados = b.sets_ganados
              and (h.jugador1_perfil_id = riv.perfil_id or h.jugador2_perfil_id = riv.perfil_id)
          )
      ) as h2h_wins
    from base b
  ),
  ranking as (
    select
      b.grupo,
      b.perfil_id,
      b.puntos,
      b.sets_ganados,
      b.partidos_jugados,
      row_number() over (
        partition by b.grupo
        order by b.puntos desc,
                 b.diff_sets desc,
                 b.sets_ganados desc,
                 hh.h2h_wins desc,
                 b.diff_games desc,
                 b.perfil_id asc
      ) as pos_grupo
    from base b
    join h2h hh on hh.perfil_id = b.perfil_id
  ),
  clasificados as (
    select grupo, perfil_id, puntos, sets_ganados, partidos_jugados, pos_grupo,
           false as es_mejor_tercero
    from ranking
    where pos_grupo <= v_clasificados_por_grupo
  ),
  terceros_rankeados as (
    select grupo, perfil_id, puntos, sets_ganados, partidos_jugados, pos_grupo,
           row_number() over (
             order by puntos desc, sets_ganados desc, partidos_jugados asc, grupo asc, perfil_id asc
           ) as rank_tercero
    from ranking
    where pos_grupo = v_clasificados_por_grupo + 1
  ),
  mejores_terceros as (
    select grupo, perfil_id, puntos, sets_ganados, partidos_jugados, pos_grupo,
           true as es_mejor_tercero
    from terceros_rankeados
    where v_incluir_mejores_terceros
      and rank_tercero <= v_cantidad_mejores_terceros
  ),
  todos as (
    select * from clasificados
    union all
    select * from mejores_terceros
  ),
  seeded as (
    select *,
      row_number() over (
        order by
          es_mejor_tercero asc,
          pos_grupo asc,
          puntos desc,
          sets_ganados desc,
          partidos_jugados asc,
          grupo asc,
          perfil_id asc
      ) as seed
    from todos
  )
  select
    array_agg(s.perfil_id order by s.seed),
    count(*)::integer,
    count(distinct s.grupo)::integer
  into v_seeded, v_total, v_grupos_fuente
  from seeded s;

  if v_total < 2 then
    raise exception 'No hay suficientes clasificados para playoffs (%).', v_total;
  end if;
  if (v_total & (v_total - 1)) <> 0 then
    raise exception 'Los clasificados totales (%) deben ser potencia de 2 para armar cruces directos.', v_total;
  end if;

  v_total_rondas   := log(2, v_total)::integer;
  v_grupo_playoffs := format('%s_PLAYOFFS', v_grupo_base);

  v_grupo_playoffs_id := public.upsert_torneo_grupo(
    p_torneo_id, v_categoria, v_grupo_playoffs, 'Playoffs', 'PLAYOFFS', 1, v_grupo_base_id, false
  );

  delete from public.torneo_estado
  where torneo_id = p_torneo_id and categoria = v_categoria and grupo = v_grupo_playoffs;

  insert into public.torneo_estado (torneo_id, categoria, grupo, estado, current_participantes)
  values (p_torneo_id, v_categoria, v_grupo_playoffs, 'LOCKED', v_total);

  v_match_ids := array[]::uuid[];
  for i in 1..(v_total - 1) loop
    v_match_ids := array_append(v_match_ids, gen_random_uuid());
  end loop;

  v_offset := 0;
  for v_ronda in 1..v_total_rondas loop
    v_num_matches := v_total / (2 ^ v_ronda);
    for v_pos in 1..v_num_matches loop
      v_flat_idx := v_offset + v_pos;
      if v_ronda = 1 then
        v_j1 := v_seeded[2 * v_pos - 1];
        v_j2 := v_seeded[v_total - (2 * v_pos - 1) + 1];
      else
        v_j1 := null;
        v_j2 := null;
      end if;
      insert into public.partidos (
        id, torneo_id, categoria, grupo, jornada,
        jugador1_id, jugador2_id, estado,
        ronda, posicion_bracket, bracket_tipo
      ) values (
        v_match_ids[v_flat_idx], p_torneo_id, v_categoria, v_grupo_playoffs, v_ronda,
        v_j1, v_j2, 'programado', v_ronda, v_pos, 'eliminacion_directa'
      );
      v_partidos := v_partidos + 1;
    end loop;
    v_offset := v_offset + v_num_matches;
  end loop;

  v_offset := 0;
  for v_ronda in 1..(v_total_rondas - 1) loop
    v_num_matches   := v_total / (2 ^ v_ronda);
    v_offset_next   := v_offset + v_num_matches;
    for v_pos in 1..v_num_matches loop
      v_flat_idx      := v_offset + v_pos;
      v_flat_idx_next := v_offset_next + ceil(v_pos::numeric / 2)::integer;
      update public.partidos set siguiente_partido_id = v_match_ids[v_flat_idx_next]
      where id = v_match_ids[v_flat_idx];
    end loop;
    v_offset := v_offset + v_num_matches;
  end loop;

  update public.partidos
  set stage_name = public.calculate_stage_name(p_torneo_id, ronda)
  where torneo_id = p_torneo_id and categoria = v_categoria
    and grupo = v_grupo_playoffs and bracket_tipo = 'eliminacion_directa';

  return query select v_categoria, v_grupo_playoffs, v_grupos_fuente, v_total, v_partidos;
end;
$$;

-- ── 6. generar_playoffs_eliminacion_directa_equipos_torneo (sin chequeo previo) ─
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
  IF NOT public.puede_administrar_torneo(p_torneo_id) THEN
    RAISE EXCEPTION 'Permiso denegado: no administras este torneo.';
  END IF;

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

-- ── 7. iniciar_torneo_en_curso (sin chequeo previo) ─────────────────
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
  IF NOT public.puede_administrar_torneo(p_torneo_id) THEN
    RAISE EXCEPTION 'Permiso denegado: no administras este torneo.';
  END IF;

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

-- ── 8. crear_equipo_dobles: reemplazar is_admin() por el helper acotado ─
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
  IF NOT public.puede_administrar_torneo(p_torneo_id) THEN
    RAISE EXCEPTION 'Permiso denegado: no administras este torneo.';
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

-- ── 9. eliminar_equipo_dobles: mover el gate a despues de resolver torneo_id ─
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
  SELECT * INTO v_equipo FROM public.torneo_equipos WHERE id = p_equipo_id;
  IF NOT FOUND THEN
    RETURN 'Equipo no encontrado.';
  END IF;

  IF NOT public.puede_administrar_torneo(v_equipo.torneo_id) THEN
    RAISE EXCEPTION 'Permiso denegado: no administras este torneo.';
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

-- ── 10. admin_forzar_resultado_partido: mover el gate a despues del SELECT ─
CREATE OR REPLACE FUNCTION public.admin_forzar_resultado_partido(
  p_partido_id  uuid,
  p_ganador_id  uuid,
  p_sets_json   jsonb,
  p_motivo      text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partido   public.partidos%ROWTYPE;
  v_set_row   jsonb;
  v_sets_j1   integer := 0;
  v_sets_j2   integer := 0;
  v_pts_j1    integer := 0;
  v_pts_j2    integer := 0;
  v_resultado text;
  v_titulo    text;
  v_set1_j1   integer; v_set1_j2 integer;
  v_set2_j1   integer; v_set2_j2 integer;
  v_set3_j1   integer; v_set3_j2 integer;
  v_idx       integer := 0;
  v_ya_registrado boolean;
BEGIN
  SELECT * INTO v_partido
  FROM public.partidos
  WHERE id = p_partido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partido no encontrado: %', p_partido_id;
  END IF;

  IF NOT public.puede_administrar_torneo(v_partido.torneo_id) THEN
    RAISE EXCEPTION 'Permiso denegado: no administras este torneo.';
  END IF;

  IF p_ganador_id NOT IN (v_partido.jugador1_id, v_partido.jugador2_id) THEN
    RAISE EXCEPTION 'El ganador debe ser uno de los dos jugadores del partido.';
  END IF;

  FOR v_set_row IN SELECT value FROM jsonb_array_elements(p_sets_json) LOOP
    v_idx := v_idx + 1;
    IF COALESCE((v_set_row->>'p1')::integer, 0) > COALESCE((v_set_row->>'p2')::integer, 0) THEN
      v_sets_j1 := v_sets_j1 + 1;
    ELSIF COALESCE((v_set_row->>'p2')::integer, 0) > COALESCE((v_set_row->>'p1')::integer, 0) THEN
      v_sets_j2 := v_sets_j2 + 1;
    END IF;
    IF    v_idx = 1 THEN
      v_set1_j1 := (v_set_row->>'p1')::integer; v_set1_j2 := (v_set_row->>'p2')::integer;
    ELSIF v_idx = 2 THEN
      v_set2_j1 := (v_set_row->>'p1')::integer; v_set2_j2 := (v_set_row->>'p2')::integer;
    ELSIF v_idx = 3 THEN
      v_set3_j1 := (v_set_row->>'p1')::integer; v_set3_j2 := (v_set_row->>'p2')::integer;
    END IF;
  END LOOP;

  v_resultado := FORMAT('%s-%s', v_sets_j1, v_sets_j2);

  IF p_ganador_id = v_partido.jugador1_id THEN
    v_pts_j1 := CASE WHEN v_sets_j2 = 0 THEN 3 ELSE 2 END;
    v_pts_j2 := CASE WHEN v_sets_j2 = 1 THEN 1 ELSE 0 END;
  ELSE
    v_pts_j2 := CASE WHEN v_sets_j1 = 0 THEN 3 ELSE 2 END;
    v_pts_j1 := CASE WHEN v_sets_j1 = 1 THEN 1 ELSE 0 END;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.torneo_partidos_historial h WHERE h.partido_id = p_partido_id
  ) INTO v_ya_registrado;

  UPDATE public.torneo_propuestas_partido
  SET estado = 'confirmado', debe_confirmar_por = NULL, updated_at = now()
  WHERE partido_id = p_partido_id
    AND estado IN ('discrepancia', 'pendiente');

  UPDATE public.partidos
  SET estado        = 'finalizado',
      resultado     = v_resultado,
      ganador_id    = p_ganador_id,
      sets_jugador1 = v_sets_j1,
      sets_jugador2 = v_sets_j2,
      set1_j1 = v_set1_j1, set1_j2 = v_set1_j2,
      set2_j1 = v_set2_j1, set2_j2 = v_set2_j2,
      set3_j1 = v_set3_j1, set3_j2 = v_set3_j2,
      updated_at    = now()
  WHERE id = p_partido_id;

  IF NOT v_ya_registrado THEN
    SELECT titulo INTO v_titulo FROM public.torneos WHERE id = v_partido.torneo_id;

    INSERT INTO public.torneo_partidos_historial (
      partido_id, torneo_id, torneo_titulo, categoria, grupo,
      jugador1_perfil_id, jugador2_perfil_id, ganador_perfil_id,
      sets_json, sets_jugador1, sets_jugador2,
      puntos_jugador1, puntos_jugador2,
      cargado_por_perfil_id, registrado_por, cargado_en,
      stage_name, ronda
    ) VALUES (
      v_partido.id,
      v_partido.torneo_id::integer,
      v_titulo,
      COALESCE(v_partido.categoria, ''),
      COALESCE(v_partido.grupo, ''),
      v_partido.jugador1_id,
      v_partido.jugador2_id,
      p_ganador_id,
      p_sets_json,
      v_sets_j1, v_sets_j2,
      v_pts_j1,  v_pts_j2,
      auth.uid(), auth.uid(), now(),
      v_partido.stage_name,
      v_partido.ronda
    );

    IF COALESCE(v_partido.grupo, '') <> '' AND v_partido.bracket_tipo IS NULL THEN
      UPDATE public.torneo_jugadores tj
      SET
        puntos = COALESCE(tj.puntos, 0)
          + CASE WHEN tj.perfil_id = v_partido.jugador1_id THEN v_pts_j1
                 WHEN tj.perfil_id = v_partido.jugador2_id THEN v_pts_j2
                 ELSE 0 END,
        sets_ganados = COALESCE(tj.sets_ganados, 0)
          + CASE WHEN tj.perfil_id = v_partido.jugador1_id THEN v_sets_j1
                 WHEN tj.perfil_id = v_partido.jugador2_id THEN v_sets_j2
                 ELSE 0 END,
        sets_perdidos = COALESCE(tj.sets_perdidos, 0)
          + CASE WHEN tj.perfil_id = v_partido.jugador1_id THEN v_sets_j2
                 WHEN tj.perfil_id = v_partido.jugador2_id THEN v_sets_j1
                 ELSE 0 END,
        partidos_jugados = COALESCE(tj.partidos_jugados, 0) + 1
      WHERE tj.torneo_id = v_partido.torneo_id
        AND tj.categoria = v_partido.categoria
        AND tj.grupo     = v_partido.grupo
        AND tj.perfil_id IN (v_partido.jugador1_id, v_partido.jugador2_id);
    END IF;
  END IF;

  RETURN FORMAT(
    'OK: Partido %s forzado. Ganador: %s. Resultado: %s. Historial: %s. Motivo: %s',
    p_partido_id,
    p_ganador_id,
    v_resultado,
    CASE WHEN v_ya_registrado THEN 'ya existía' ELSE 'insertado' END,
    COALESCE(p_motivo, 'sin motivo')
  );
END;
$$;

-- ── 11. admin_resetear_disputa: resolver torneo_id antes de gatear ──
CREATE OR REPLACE FUNCTION public.admin_resetear_disputa(
  p_partido_id  uuid,
  p_motivo      text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows integer;
  v_torneo_id bigint;
BEGIN
  SELECT torneo_id INTO v_torneo_id FROM public.partidos WHERE id = p_partido_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partido no encontrado: %', p_partido_id;
  END IF;

  IF NOT public.puede_administrar_torneo(v_torneo_id) THEN
    RAISE EXCEPTION 'Permiso denegado: no administras este torneo.';
  END IF;

  UPDATE public.torneo_propuestas_partido
  SET estado             = 'pendiente',
      sets_json_j1       = NULL,
      sets_json_j2       = NULL,
      debe_confirmar_por = NULL,
      updated_at         = now()
  WHERE partido_id = p_partido_id
    AND estado     = 'discrepancia';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    UPDATE public.partidos
    SET estado      = 'programado',
        ganador_id  = NULL,
        resultado   = NULL,
        set1_j1 = NULL, set1_j2 = NULL,
        set2_j1 = NULL, set2_j2 = NULL,
        set3_j1 = NULL, set3_j2 = NULL,
        updated_at  = now()
    WHERE id     = p_partido_id
      AND estado NOT IN ('finalizado');
  END IF;

  RETURN FORMAT(
    'OK: Disputa del partido %s reseteada (%s filas). Motivo: %s',
    p_partido_id,
    v_rows,
    COALESCE(p_motivo, 'sin motivo')
  );
END;
$$;

-- ── 12. admin_marcar_wo_equipo: mover el gate a despues del SELECT ──
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
  SELECT * INTO v_partido FROM public.partidos WHERE id = p_partido_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partido no encontrado: %', p_partido_id;
  END IF;

  IF NOT public.puede_administrar_torneo(v_partido.torneo_id) THEN
    RAISE EXCEPTION 'Permiso denegado: no administras este torneo.';
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
