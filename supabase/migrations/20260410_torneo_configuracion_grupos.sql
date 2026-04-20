-- Configuracion por torneo para division en grupos y sorteo diferido.
-- Fecha: 2026-04-10

create table if not exists public.torneo_configuracion (
  torneo_id bigint primary key references public.torneos(id) on delete cascade,
  jugadores_por_grupo integer not null default 4 check (jugadores_por_grupo >= 2),
  sortear_grupos_en_sorteo boolean not null default false,
  grupo_base text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Agregar columna max_participantes_total si no existe
alter table public.torneo_configuracion
add column if not exists max_participantes_total integer check (max_participantes_total >= 2);

drop trigger if exists trg_torneo_configuracion_updated_at on public.torneo_configuracion;
create trigger trg_torneo_configuracion_updated_at
before update on public.torneo_configuracion
for each row execute function public.set_updated_at();

alter table public.torneo_configuracion enable row level security;

drop policy if exists "torneo_configuracion_select_todos" on public.torneo_configuracion;
create policy "torneo_configuracion_select_todos"
  on public.torneo_configuracion for select
  using (true);

drop policy if exists "torneo_configuracion_insert_admin" on public.torneo_configuracion;
create policy "torneo_configuracion_insert_admin"
  on public.torneo_configuracion for insert
  with check (public.is_admin());

drop policy if exists "torneo_configuracion_update_admin" on public.torneo_configuracion;
create policy "torneo_configuracion_update_admin"
  on public.torneo_configuracion for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "torneo_configuracion_delete_admin" on public.torneo_configuracion;
create policy "torneo_configuracion_delete_admin"
  on public.torneo_configuracion for delete
  using (public.is_admin());

insert into public.torneo_configuracion (torneo_id, jugadores_por_grupo, max_participantes_total, sortear_grupos_en_sorteo, grupo_base)
select t.id, 4, null, false, format('TORNEO_%s', t.id)
from public.torneos t
on conflict (torneo_id) do nothing;

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
  v_shuffled uuid[];
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
  select array_agg(tj.perfil_id order by tj.perfil_id)
    into v_perfiles
  from public.torneo_jugadores tj
  where tj.torneo_id = p_torneo_id
    and tj.categoria = p_categoria
    and tj.grupo = p_grupo;

  v_shuffled := coalesce(v_perfiles, '{}');

  if coalesce(array_length(v_shuffled, 1), 0) < 2 then
    return 0;
  end if;

  v_expected_partidos := (array_length(v_shuffled, 1) * greatest(array_length(v_shuffled, 1) - 1, 0)) / 2;

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

      if v_j1 is null or v_j2 is null then
        continue;
      end if;

      insert into public.partidos (
        id,
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
      )
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
    end loop;

    if v_slots > 2 then
      v_tmp := v_work[v_slots];
      for v_i in reverse 3..v_slots loop
        v_work[v_i] := v_work[v_i - 1];
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

comment on function public.generar_fixture_round_robin_grupo(bigint, text, text)
is 'Genera fixture round robin completo para un grupo ya poblado en torneo_jugadores.';

create or replace function public.sortear_grupos_y_fixture_torneo(
  p_torneo_id bigint,
  p_categoria text default null,
  p_grupo_base text default null
)
returns table (
  categoria text,
  grupo_base text,
  jugadores_por_grupo integer,
  grupos_creados integer,
  jugadores_sorteados integer,
  partidos_creados integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria text;
  v_grupo_base text;
  v_jugadores_por_grupo integer := 4;
  v_perfiles uuid[];
  v_total integer := 0;
  v_grupos integer := 0;
  v_base_size integer := 0;
  v_remainder integer := 0;
  v_group_idx integer := 0;
  v_start integer := 1;
  v_group_size integer := 0;
  v_end integer := 0;
  v_grupo text;
  v_partidos integer := 0;
  v_has_existing boolean := false;
  v_member uuid;
  v_members uuid[];
begin
  v_categoria := nullif(trim(coalesce(p_categoria, '')), '');
  if v_categoria is null then
    select t.subtitulo
      into v_categoria
    from public.torneos t
    where t.id = p_torneo_id
    limit 1;
  end if;
  v_categoria := coalesce(v_categoria, 'General');

  select
    greatest(2, coalesce(tc.jugadores_por_grupo, 4)),
    coalesce(nullif(trim(tc.grupo_base), ''), format('TORNEO_%s', p_torneo_id))
    into v_jugadores_por_grupo, v_grupo_base
  from public.torneo_configuracion tc
  where tc.torneo_id = p_torneo_id;

  v_jugadores_por_grupo := greatest(2, coalesce(v_jugadores_por_grupo, 4));

  v_grupo_base := coalesce(nullif(trim(coalesce(p_grupo_base, v_grupo_base, '')), ''), format('TORNEO_%s', p_torneo_id));

  select array_agg(i.perfil_id order by random())
    into v_perfiles
  from public.inscripciones_torneo i
  where i.torneo_id = p_torneo_id
    and coalesce(nullif(trim(i.categoria), ''), v_categoria) = v_categoria
    and i.estado = 'pagado_aprobado';

  v_total := coalesce(array_length(v_perfiles, 1), 0);

  if v_total < 2 then
    raise exception 'Se necesitan al menos 2 jugadores aprobados para sortear el torneo.';
  end if;

  select exists (
    select 1
    from public.torneo_partidos_historial h
    where h.torneo_id = p_torneo_id
      and h.categoria = v_categoria
      and (h.grupo = v_grupo_base or h.grupo like (v_grupo_base || '\\_G%') escape '\\')
  ) into v_has_existing;

  if v_has_existing then
    raise exception 'Ya existe historial para %/%. No se puede re-sortear automaticamente.', p_torneo_id, v_categoria;
  end if;

  select exists (
    select 1
    from public.torneo_propuestas_partido p
    where p.torneo_id = p_torneo_id
      and p.categoria = v_categoria
      and (p.grupo = v_grupo_base or p.grupo like (v_grupo_base || '\\_G%') escape '\\')
  ) into v_has_existing;

  if v_has_existing then
    raise exception 'Ya existen propuestas de resultados para %/%. Limpialas antes de re-sortear.', p_torneo_id, v_categoria;
  end if;

  select exists (
    select 1
    from public.partidos p
    where p.torneo_id = p_torneo_id
      and p.categoria = v_categoria
      and (p.grupo = v_grupo_base or p.grupo like (v_grupo_base || '\\_G%') escape '\\')
  ) into v_has_existing;

  if v_has_existing then
    raise exception 'Ya existen partidos para %/%. Limpialos antes de re-sortear.', p_torneo_id, v_categoria;
  end if;

  delete from public.torneo_jugadores tj
  where tj.torneo_id = p_torneo_id
    and tj.categoria = v_categoria
    and (tj.grupo = v_grupo_base or tj.grupo like (v_grupo_base || '\\_G%') escape '\\');

  delete from public.torneo_estado te
  where te.torneo_id = p_torneo_id
    and te.categoria = v_categoria
    and (te.grupo = v_grupo_base or te.grupo like (v_grupo_base || '\\_G%') escape '\\');

  v_grupos := ceil(v_total::numeric / v_jugadores_por_grupo::numeric)::integer;
  v_base_size := floor(v_total::numeric / v_grupos::numeric)::integer;
  v_remainder := mod(v_total, v_grupos);

  for v_group_idx in 1..v_grupos loop
    v_group_size := v_base_size + case when v_group_idx <= v_remainder then 1 else 0 end;
    v_end := v_start + v_group_size - 1;
    v_members := v_perfiles[v_start:v_end];
    v_grupo := case when v_group_idx = 1 then v_grupo_base else format('%s_G%s', v_grupo_base, v_group_idx) end;

    insert into public.torneo_estado (
      torneo_id,
      categoria,
      grupo,
      estado,
      max_participantes,
      current_participantes,
      sorteo_realizado
    )
    values (
      p_torneo_id,
      v_categoria,
      v_grupo,
      'LOCKED',
      greatest(2, v_group_size),
      v_group_size,
      true
    );

    foreach v_member in array v_members loop
      insert into public.torneo_jugadores (
        torneo_id,
        perfil_id,
        categoria,
        grupo,
        puntos,
        partidos_jugados,
        sets_ganados
      )
      values (
        p_torneo_id,
        v_member,
        v_categoria,
        v_grupo,
        0,
        0,
        0
      );
    end loop;

    update public.inscripciones_torneo i
    set categoria = v_categoria,
        grupo = v_grupo,
        updated_at = now()
    where i.torneo_id = p_torneo_id
      and i.estado = 'pagado_aprobado'
      and i.perfil_id = any(v_members);

    v_partidos := v_partidos + public.generar_fixture_round_robin_grupo(p_torneo_id, v_categoria, v_grupo);
    v_start := v_end + 1;
  end loop;

  return query
  select v_categoria, v_grupo_base, v_jugadores_por_grupo, v_grupos, v_total, v_partidos;
end;
$$;

comment on function public.sortear_grupos_y_fixture_torneo(bigint, text, text)
is 'Sortea la division por grupos usando inscripciones aprobadas y genera el fixture round robin completo para cada grupo.';

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
  v_jugadores_por_grupo integer := 8;
  v_sortear_grupos_en_sorteo boolean := false;
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

  select
    greatest(2, coalesce(tc.jugadores_por_grupo, 8)),
    coalesce(tc.sortear_grupos_en_sorteo, false),
    coalesce(nullif(trim(tc.grupo_base), ''), format('TORNEO_%s', new.torneo_id))
    into v_jugadores_por_grupo, v_sortear_grupos_en_sorteo, v_grupo_base
  from public.torneo_configuracion tc
  where tc.torneo_id = new.torneo_id;

  v_jugadores_por_grupo := greatest(2, coalesce(v_jugadores_por_grupo, 8));
  v_sortear_grupos_en_sorteo := coalesce(v_sortear_grupos_en_sorteo, false);
  v_grupo_base := coalesce(v_grupo_base, format('TORNEO_%s', new.torneo_id));
  v_max_participantes := v_jugadores_por_grupo;

  if v_sortear_grupos_en_sorteo then
    new.categoria := v_categoria;
    new.grupo := v_grupo_base;

    insert into public.torneo_estado (
      torneo_id,
      categoria,
      grupo,
      estado,
      max_participantes,
      current_participantes,
      sorteo_realizado
    )
    values (
      new.torneo_id,
      v_categoria,
      v_grupo_base,
      'RECRUITING',
      v_max_participantes,
      0,
      false
    )
    on conflict on constraint uq_torneo_estado_scope
    do update set
      max_participantes = greatest(public.torneo_estado.max_participantes, excluded.max_participantes),
      updated_at = now();

    select count(distinct i.perfil_id)::integer
      into v_current
    from public.inscripciones_torneo i
    where i.torneo_id = new.torneo_id
      and coalesce(nullif(trim(i.categoria), ''), v_categoria) = v_categoria
      and i.estado = 'pagado_aprobado';

    update public.torneo_estado te
    set current_participantes = v_current,
        estado = 'RECRUITING',
        sorteo_realizado = false,
        updated_at = now()
    where te.torneo_id = new.torneo_id
      and te.categoria = v_categoria
      and te.grupo = v_grupo_base;

    return new;
  end if;

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
is 'Trigger de aprobacion: si el torneo difiere grupos al sorteo, conserva grupo base y espera al sorteo; si no, registra y sortea por grupo al completar cupo.';
