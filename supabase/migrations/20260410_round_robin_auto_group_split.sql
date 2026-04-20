-- Round robin completo por grupo + asignacion automatica de grupos.
-- Fecha: 2026-04-10

create or replace function public.resolver_grupo_inscripcion(
  p_torneo_id bigint,
  p_categoria text,
  p_grupo_base text,
  p_max_participantes integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_cap integer;
  v_open_group text;
  v_max_idx integer;
  v_next_idx integer;
begin
  v_base := nullif(trim(coalesce(p_grupo_base, '')), '');
  if v_base is null then
    v_base := format('TORNEO_%s', p_torneo_id);
  end if;

  v_cap := greatest(2, coalesce(p_max_participantes, 8));

  select te.grupo
    into v_open_group
  from public.torneo_estado te
  where te.torneo_id = p_torneo_id
    and te.categoria = p_categoria
    and (
      te.grupo = v_base
      or te.grupo like (v_base || '\_G%') escape '\'
    )
    and coalesce(te.estado, 'RECRUITING') = 'RECRUITING'
    and coalesce(te.current_participantes, 0) < greatest(2, coalesce(te.max_participantes, v_cap))
  order by
    case
      when te.grupo = v_base then 1
      else coalesce(nullif(substring(te.grupo from '_G([0-9]+)$'), ''), '2147483647')::integer
    end,
    te.updated_at asc
  limit 1;

  if v_open_group is not null then
    return v_open_group;
  end if;

  select coalesce(max(
    case
      when te.grupo = v_base then 1
      else coalesce(nullif(substring(te.grupo from '_G([0-9]+)$'), ''), '1')::integer
    end
  ), 0)
    into v_max_idx
  from public.torneo_estado te
  where te.torneo_id = p_torneo_id
    and te.categoria = p_categoria
    and (
      te.grupo = v_base
      or te.grupo like (v_base || '\_G%') escape '\'
    );

  v_next_idx := v_max_idx + 1;

  if v_next_idx <= 1 then
    return v_base;
  end if;

  return format('%s_G%s', v_base, v_next_idx);
end;
$$;

comment on function public.resolver_grupo_inscripcion(bigint, text, text, integer)
is 'Resuelve automaticamente el grupo destino: reutiliza grupos abiertos y crea un nuevo sufijo _G{n} cuando los existentes se llenan.';


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
  v_work uuid[];
  v_created integer := 0;
  v_byes uuid[] := '{}';
  v_expected_partidos integer := 0;
  v_i integer;
  v_j integer;
  v_round integer;
  v_rounds integer;
  v_slots integer;
  v_half integer;
  v_tmp uuid;
  v_estado_antes text;
  v_can_insert_partidos boolean := false;
  v_partidos_existentes integer := 0;
  v_j1 uuid;
  v_j2 uuid;
  v_is_bye_recorded boolean;
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

  if v_estado.estado <> 'RECRUITING' then
    select count(*)::integer into v_partidos_existentes
    from public.partidos p
    where p.torneo_id = p_torneo_id
      and p.categoria = p_categoria
      and p.grupo = p_grupo;

    if not (v_estado.current_participantes >= v_estado.max_participantes and v_partidos_existentes = 0) then
      return query
      select p_torneo_id, p_perfil_id, false, v_estado_antes, v_estado.estado,
             v_estado.current_participantes, v_estado.max_participantes, false, 0, '{}'::uuid[];
      return;
    end if;
  end if;

  if v_estado.estado <> 'RECRUITING' and v_estado.current_participantes >= v_estado.max_participantes and v_partidos_existentes = 0 then
    v_estado.estado := 'RECRUITING';
    v_estado.sorteo_realizado := false;
  end if;

  if v_estado.estado <> 'RECRUITING' then
    return query
    select p_torneo_id, p_perfil_id, false, v_estado_antes, v_estado.estado,
           v_estado.current_participantes, v_estado.max_participantes, false, 0, '{}'::uuid[];
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
      p_torneo_id, p_categoria, p_grupo, v_estado.current_participantes, v_estado.max_participantes;
  end if;

  if v_ya_inscripto and v_estado.current_participantes < v_estado.max_participantes then
    return query
    select p_torneo_id, p_perfil_id, true, v_estado_antes, v_estado.estado,
           v_estado.current_participantes, v_estado.max_participantes, false, 0, '{}'::uuid[];
    return;
  end if;

  if v_estado.current_participantes < v_estado.max_participantes then
    return query
    select p_torneo_id, p_perfil_id, false, v_estado_antes, v_estado.estado,
           v_estado.current_participantes, v_estado.max_participantes, false, 0, '{}'::uuid[];
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
  v_expected_partidos := (coalesce(array_length(v_shuffled, 1), 0) * greatest(coalesce(array_length(v_shuffled, 1), 0) - 1, 0)) / 2;

  if array_length(v_shuffled, 1) is not null then
    for v_i in reverse array_lower(v_shuffled, 1)..array_upper(v_shuffled, 1) loop
      if v_i <= 1 then
        exit;
      end if;
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
      and column_name in ('id', 'torneo_id', 'categoria', 'grupo', 'jornada', 'jugador1_id', 'jugador2_id', 'fecha_programada', 'resultado', 'estado', 'ganador_id')
    group by table_name
    having count(distinct column_name) = 11
  ) into v_can_insert_partidos;

  if not v_can_insert_partidos and v_expected_partidos > 0 then
    raise exception 'La tabla public.partidos no tiene las columnas esperadas para crear cruces automaticamente.';
  end if;

  if v_can_insert_partidos then
    select count(*)::integer into v_partidos_existentes
    from public.partidos p
    where p.torneo_id = p_torneo_id
      and p.categoria = p_categoria
      and p.grupo = p_grupo;

    if v_expected_partidos > 0 and v_partidos_existentes = v_expected_partidos then
      update public.torneo_estado
      set estado = 'LOCKED', sorteo_realizado = true, updated_at = now()
      where public.torneo_estado.torneo_id = p_torneo_id
        and public.torneo_estado.categoria = p_categoria
        and public.torneo_estado.grupo = p_grupo
      returning * into v_estado;

      return query
      select p_torneo_id, p_perfil_id, v_ya_inscripto, v_estado_antes, v_estado.estado,
             v_estado.current_participantes, v_estado.max_participantes, false, 0, '{}'::uuid[];
      return;
    elsif v_expected_partidos > 0 and v_partidos_existentes > 0 then
      raise exception 'Se detectaron % partidos existentes para %/%/%, pero el fixture esperado es de % partidos. Limpia los partidos existentes antes de reintentar el sorteo.',
        v_partidos_existentes, p_torneo_id, p_categoria, p_grupo, v_expected_partidos;
    end if;
  end if;

  if coalesce(array_length(v_shuffled, 1), 0) > 1 then
    v_work := v_shuffled;

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

        if v_j1 is null and v_j2 is null then
          continue;
        elsif v_j1 is null or v_j2 is null then
          if v_j1 is null then
            v_j1 := v_j2;
          end if;

          select exists (
            select 1
            from unnest(v_byes) as b(perfil_id)
            where b.perfil_id = v_j1
          ) into v_is_bye_recorded;

          if not v_is_bye_recorded then
            v_byes := array_append(v_byes, v_j1);
          end if;
        else
          if v_can_insert_partidos then
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
              v_round,
              v_j1,
              v_j2,
              null,
              'PENDIENTE',
              'programado',
              null
            );
            v_created := v_created + 1;
          end if;
        end if;
      end loop;

      if v_slots > 2 then
        v_tmp := v_work[v_slots];
        for v_i in reverse 3..v_slots loop
          v_work[v_i] := v_work[v_i - 1];
        end loop;
        v_work[2] := v_tmp;
      end if;
    end loop;
  end if;

  if coalesce(array_length(v_shuffled, 1), 0) >= 2 and v_created = 0 then
    raise exception 'El sorteo round robin se ejecuto pero no se pudo crear ningun partido en public.partidos.';
  end if;

  update public.torneo_estado
  set estado = 'LOCKED', sorteo_realizado = true, updated_at = now()
  where public.torneo_estado.torneo_id = p_torneo_id
    and public.torneo_estado.categoria = p_categoria
    and public.torneo_estado.grupo = p_grupo
  returning * into v_estado;

  return query
  select p_torneo_id, p_perfil_id, false, v_estado_antes, v_estado.estado,
         v_estado.current_participantes, v_estado.max_participantes, true, v_created, v_byes;
end;
$$;

comment on function public.registrar_participante_y_sortear_si_lleno(bigint, uuid, text, text, integer)
is 'Inscribe jugador en el grupo y, al completar cupo, genera fixture round robin completo (todas las jornadas) para ese grupo.';


create or replace function public.procesar_inscripcion_aprobada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria text;
  v_grupo_base text;
  v_grupo_resuelto text;
  v_max_participantes integer := 8;
  v_current integer := 0;
  v_needs_fallback boolean := false;
begin
  if new.estado <> 'pagado_aprobado' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.estado = 'pagado_aprobado' then
    return new;
  end if;

  if new.aprobado_en is null then
    new.aprobado_en := now();
  end if;

  v_categoria := nullif(trim(coalesce(new.categoria, '')), '');
  if v_categoria is null then
    select t.subtitulo
      into v_categoria
    from public.torneos t
    where t.id = new.torneo_id
    limit 1;
  end if;
  v_categoria := coalesce(v_categoria, 'General');

  v_grupo_base := nullif(trim(coalesce(new.grupo, '')), '');
  if v_grupo_base is null then
    v_grupo_base := format('TORNEO_%s', new.torneo_id);
  end if;

  select te.max_participantes
    into v_max_participantes
  from public.torneo_estado te
  where te.torneo_id = new.torneo_id
    and te.categoria = v_categoria
    and te.grupo = v_grupo_base
  order by te.updated_at desc
  limit 1;

  v_max_participantes := greatest(2, coalesce(v_max_participantes, 8));

  v_grupo_resuelto := public.resolver_grupo_inscripcion(
    new.torneo_id,
    v_categoria,
    v_grupo_base,
    v_max_participantes
  );

  new.categoria := v_categoria;
  new.grupo := v_grupo_resuelto;

  begin
    perform 1
    from public.registrar_participante_y_sortear_si_lleno(
      new.torneo_id,
      new.perfil_id,
      v_categoria,
      v_grupo_resuelto,
      v_max_participantes
    );
  exception
    when undefined_function then
      v_needs_fallback := true;
    when others then
      if sqlerrm ilike '%La tabla public.partidos no tiene las columnas esperadas%' then
        v_needs_fallback := true;
      else
        raise;
      end if;
  end;

  if v_needs_fallback then
    insert into public.torneo_estado (
      torneo_id,
      categoria,
      grupo,
      estado,
      max_participantes,
      current_participantes
    )
    values (
      new.torneo_id,
      v_categoria,
      v_grupo_resuelto,
      'RECRUITING',
      v_max_participantes,
      0
    )
    on conflict on constraint uq_torneo_estado_scope do nothing;

    insert into public.torneo_jugadores (
      perfil_id,
      categoria,
      grupo,
      puntos,
      partidos_jugados,
      sets_ganados,
      torneo_id
    )
    values (
      new.perfil_id,
      v_categoria,
      v_grupo_resuelto,
      0,
      0,
      0,
      new.torneo_id
    )
    on conflict do nothing;

    select count(distinct tj.perfil_id)::integer
      into v_current
    from public.torneo_jugadores tj
    where tj.torneo_id = new.torneo_id
      and tj.categoria = v_categoria
      and tj.grupo = v_grupo_resuelto;

    update public.torneo_estado te
    set current_participantes = v_current,
        estado = case
          when te.estado = 'RECRUITING' and v_current >= te.max_participantes then 'LOCKED'
          else te.estado
        end,
        updated_at = now()
    where te.torneo_id = new.torneo_id
      and te.categoria = v_categoria
      and te.grupo = v_grupo_resuelto;
  end if;

  return new;
end;
$$;

comment on function public.procesar_inscripcion_aprobada()
is 'Trigger de aprobacion: normaliza categoria, resuelve grupo automaticamente y registra jugador con sorteo round robin al completar cupo.';
