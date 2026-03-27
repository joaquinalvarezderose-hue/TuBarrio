-- RPC transaccional en esquema en espanol.
-- Usa: torneo_jugadores, torneo_estado y (si existe) partidos.

create or replace function public.registrar_participante_y_sortear_si_lleno(
  p_torneo_id bigint,
  p_perfil_id uuid,
  p_categoria text,
  p_grupo text,
  p_max_participantes integer
)
returns table (
  torneo_id bigint,
  perfil_id uuid,
  ya_inscripto boolean,
  estado_antes text,
  estado_despues text,
  participantes_actuales integer,
  max_participantes integer,
  sorteo_disparado boolean,
  partidos_creados integer,
  byes uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado record;
  v_ya_inscripto boolean := false;
  v_perfiles uuid[];
  v_shuffled uuid[];
  v_created integer := 0;
  v_byes uuid[] := '{}';
  v_expected_partidos integer := 0;
  v_i integer;
  v_j integer;
  v_tmp uuid;
  v_estado_antes text;
  v_can_insert_partidos boolean := false;
  v_partidos_existentes integer := 0;
begin
  insert into public.torneo_estado (torneo_id, categoria, grupo, estado, max_participantes, current_participantes)
  values (p_torneo_id, p_categoria, p_grupo, 'RECRUITING', greatest(2, p_max_participantes), 0)
  on conflict on constraint uq_torneo_estado_scope
  do update
  set max_participantes = excluded.max_participantes,
      updated_at = now();

  select * into v_estado
  from public.torneo_estado te
  where te.torneo_id = p_torneo_id
    and te.categoria = p_categoria
    and te.grupo = p_grupo
  for update;

  v_estado_antes := v_estado.estado;

  -- Si ya no esta en RECRUITING pero el cupo esta lleno y no hay partidos,
  -- permitimos reintentar el sorteo para recuperar estado inconsistente.
  if v_estado.estado <> 'RECRUITING' then
    select count(*)::integer into v_partidos_existentes
    from public.partidos p
    where p.torneo_id = p_torneo_id
      and p.categoria = p_categoria
      and p.grupo = p_grupo
      and coalesce(p.jornada, 1) = 1;

    if not (v_estado.current_participantes >= v_estado.max_participantes and coalesce(v_estado.sorteo_realizado, false) = false and v_partidos_existentes = 0) then
      return query
      select
        p_torneo_id,
        p_perfil_id,
        false,
        v_estado_antes,
        v_estado.estado,
        v_estado.current_participantes,
        v_estado.max_participantes,
        false,
        0,
        '{}'::uuid[];
      return;
    end if;
  end if;

  if v_estado.estado <> 'RECRUITING' and coalesce(v_estado.sorteo_realizado, false) = false then
    update public.torneo_estado
    set estado = 'RECRUITING', updated_at = now()
    where public.torneo_estado.torneo_id = p_torneo_id
      and public.torneo_estado.categoria = p_categoria
      and public.torneo_estado.grupo = p_grupo
    returning * into v_estado;
  end if;

  if v_estado.estado <> 'RECRUITING' then
    return query
    select
      p_torneo_id,
      p_perfil_id,
      false,
      v_estado_antes,
      v_estado.estado,
      v_estado.current_participantes,
      v_estado.max_participantes,
      false,
      0,
      '{}'::uuid[];
    return;
  end if;

  select exists (
    select 1
    from public.torneo_jugadores tj
    where tj.perfil_id = p_perfil_id
      and tj.torneo_id = p_torneo_id
      and tj.categoria = p_categoria
      and tj.grupo = p_grupo
  ) into v_ya_inscripto;

  if not v_ya_inscripto then
    insert into public.torneo_jugadores (torneo_id, perfil_id, categoria, grupo, puntos, partidos_jugados, sets_ganados)
    values (p_torneo_id, p_perfil_id, p_categoria, p_grupo, 0, 0, 0);
  end if;

  update public.torneo_estado te
  set current_participantes = (
        select count(*)::integer
        from public.torneo_jugadores tj
        where tj.torneo_id = p_torneo_id
          and tj.categoria = p_categoria
          and tj.grupo = p_grupo
      ),
      updated_at = now()
  where te.torneo_id = p_torneo_id
    and te.categoria = p_categoria
    and te.grupo = p_grupo
  returning * into v_estado;

  if v_estado.current_participantes > v_estado.max_participantes then
    raise exception 'El torneo %/%/% supero el cupo configurado: % inscriptos para % lugares.',
      p_torneo_id,
      p_categoria,
      p_grupo,
      v_estado.current_participantes,
      v_estado.max_participantes;
  end if;

  if v_ya_inscripto and v_estado.current_participantes < v_estado.max_participantes then
    return query
    select
      p_torneo_id,
      p_perfil_id,
      true,
      v_estado_antes,
      v_estado.estado,
      v_estado.current_participantes,
      v_estado.max_participantes,
      false,
      0,
      '{}'::uuid[];
    return;
  end if;

  if v_estado.current_participantes < v_estado.max_participantes then
    return query
    select
      p_torneo_id,
      p_perfil_id,
      false,
      v_estado_antes,
      v_estado.estado,
      v_estado.current_participantes,
      v_estado.max_participantes,
      false,
      0,
      '{}'::uuid[];
    return;
  end if;

  update public.torneo_estado
  set estado = 'LOCKED', updated_at = now()
  where public.torneo_estado.torneo_id = p_torneo_id
    and public.torneo_estado.categoria = p_categoria
    and public.torneo_estado.grupo = p_grupo;

  select array_agg(tj.perfil_id) into v_perfiles
  from public.torneo_jugadores tj
  where tj.torneo_id = p_torneo_id
    and tj.categoria = p_categoria
    and tj.grupo = p_grupo;

  v_shuffled := coalesce(v_perfiles, '{}');
  v_expected_partidos := floor(coalesce(array_length(v_shuffled, 1), 0) / 2.0)::integer;

  if array_length(v_shuffled, 1) is not null then
    for v_i in reverse array_lower(v_shuffled, 1)..array_upper(v_shuffled, 1) loop
      if v_i <= 1 then exit; end if;
      v_j := 1 + floor(random() * v_i)::int;
      v_tmp := v_shuffled[v_j];
      v_shuffled[v_j] := v_shuffled[v_i];
      v_shuffled[v_i] := v_tmp;
    end loop;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'partidos'
      and column_name in (
        'id',
        'torneo_id',
        'categoria',
        'grupo',
        'jornada',
        'jugador1_id',
        'jugador2_id',
        'fecha_programada',
        'resultado',
        'estado',
        'ganador_id'
      )
    group by table_name
    having count(*) = 10
  ) into v_can_insert_partidos;

  if not v_can_insert_partidos and v_expected_partidos > 0 then
    raise exception 'La tabla public.partidos no tiene las columnas esperadas para crear cruces automaticamente.';
  end if;

  if v_can_insert_partidos then
    select count(*)::integer into v_partidos_existentes
    from public.partidos p
    where p.torneo_id = p_torneo_id
      and p.categoria = p_categoria
      and p.grupo = p_grupo
      and coalesce(p.jornada, 1) = 1;

    if v_expected_partidos > 0 and v_partidos_existentes = v_expected_partidos then
      update public.torneo_estado
      set estado = 'LOCKED',
          sorteo_realizado = true,
          updated_at = now()
      where public.torneo_estado.torneo_id = p_torneo_id
        and public.torneo_estado.categoria = p_categoria
        and public.torneo_estado.grupo = p_grupo
      returning * into v_estado;

      return query
      select
        p_torneo_id,
        p_perfil_id,
        v_ya_inscripto,
        v_estado_antes,
        v_estado.estado,
        v_estado.current_participantes,
        v_estado.max_participantes,
        false,
        0,
        '{}'::uuid[];
      return;
    elsif v_expected_partidos > 0 and v_partidos_existentes > 0 then
      raise exception 'Se detectaron % partidos existentes para %/%/%, pero el fixture esperado es de % partidos. Limpia los partidos existentes antes de reintentar el sorteo.',
        v_partidos_existentes,
        p_torneo_id,
        p_categoria,
        p_grupo,
        v_expected_partidos;
    end if;
  end if;

  if array_length(v_shuffled, 1) is not null then
    v_i := 1;
    while v_i <= array_length(v_shuffled, 1) loop
      if v_i = array_length(v_shuffled, 1) then
        v_byes := array_append(v_byes, v_shuffled[v_i]);
      else
        if v_can_insert_partidos then
          begin
            insert into public.partidos (id, torneo_id, categoria, grupo, jornada, jugador1_id, jugador2_id, fecha_programada, resultado, estado, ganador_id)
            values (
              (
                substr(md5(random()::text || clock_timestamp()::text), 1, 8) || '-' ||
                substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
                substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
                substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
                substr(md5(random()::text || clock_timestamp()::text), 1, 12)
              )::uuid,
              p_torneo_id,
              p_categoria,
              p_grupo,
              1,
              v_shuffled[v_i],
              v_shuffled[v_i + 1],
              null,
              'PENDIENTE',
              'programado',
              null
            );
            v_created := v_created + 1;
          exception when others then
            raise exception 'No se pudo insertar en partidos: %', sqlerrm;
          end;
        end if;
      end if;
      v_i := v_i + 2;
    end loop;
  end if;

  if coalesce(array_length(v_shuffled, 1), 0) >= 2 and v_created = 0 and coalesce(array_length(v_byes, 1), 0) = 0 then
    raise exception 'El sorteo se ejecuto pero no se pudo crear ningun partido en public.partidos.';
  end if;

  update public.torneo_estado
  set estado = 'LOCKED',
      sorteo_realizado = true,
      updated_at = now()
  where public.torneo_estado.torneo_id = p_torneo_id
    and public.torneo_estado.categoria = p_categoria
    and public.torneo_estado.grupo = p_grupo
  returning * into v_estado;

  return query
  select
    p_torneo_id,
    p_perfil_id,
    false,
    v_estado_antes,
    v_estado.estado,
    v_estado.current_participantes,
    v_estado.max_participantes,
    true,
    v_created,
    v_byes;
end;
$$;

comment on function public.registrar_participante_y_sortear_si_lleno(bigint, uuid, text, text, integer)
is 'Inscribe jugador en torneo_jugadores y al llenarse crea fixture automatico, dejando estado LOCKED hasta inicio manual.';
