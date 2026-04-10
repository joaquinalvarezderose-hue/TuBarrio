-- Catalogo visible de grupos por torneo/fase.
-- Fecha: 2026-04-10

create extension if not exists pgcrypto;

create table if not exists public.torneo_grupos (
  id uuid primary key default gen_random_uuid(),
  torneo_id bigint not null references public.torneos(id) on delete cascade,
  categoria text not null,
  codigo text not null,
  nombre text not null,
  fase text not null default 'GRUPOS' check (fase in ('GRUPOS', 'PLAYOFFS')),
  orden integer not null default 1,
  grupo_padre_id uuid references public.torneo_grupos(id) on delete set null,
  es_base boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_torneo_grupos_codigo unique (torneo_id, categoria, codigo)
);

create index if not exists idx_torneo_grupos_torneo_categoria
  on public.torneo_grupos (torneo_id, categoria, fase, orden);

create index if not exists idx_torneo_grupos_padre
  on public.torneo_grupos (grupo_padre_id);

drop trigger if exists trg_torneo_grupos_updated_at on public.torneo_grupos;
create trigger trg_torneo_grupos_updated_at
before update on public.torneo_grupos
for each row execute function public.set_updated_at();

alter table public.torneo_grupos enable row level security;

drop policy if exists "torneo_grupos_select_todos" on public.torneo_grupos;
create policy "torneo_grupos_select_todos"
  on public.torneo_grupos for select
  using (true);

drop policy if exists "torneo_grupos_insert_admin" on public.torneo_grupos;
create policy "torneo_grupos_insert_admin"
  on public.torneo_grupos for insert
  with check (public.is_admin());

drop policy if exists "torneo_grupos_update_admin" on public.torneo_grupos;
create policy "torneo_grupos_update_admin"
  on public.torneo_grupos for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "torneo_grupos_delete_admin" on public.torneo_grupos;
create policy "torneo_grupos_delete_admin"
  on public.torneo_grupos for delete
  using (public.is_admin());

alter table public.torneo_configuracion
  add column if not exists grupo_base_id uuid references public.torneo_grupos(id) on delete set null;

create or replace function public.upsert_torneo_grupo(
  p_torneo_id bigint,
  p_categoria text,
  p_codigo text,
  p_nombre text default null,
  p_fase text default 'GRUPOS',
  p_orden integer default 1,
  p_grupo_padre_id uuid default null,
  p_es_base boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_categoria text;
  v_codigo text;
  v_nombre text;
  v_fase text;
begin
  v_categoria := coalesce(nullif(trim(p_categoria), ''), 'General');
  v_codigo := coalesce(nullif(trim(p_codigo), ''), format('TORNEO_%s', p_torneo_id));
  v_nombre := coalesce(nullif(trim(p_nombre), ''), replace(v_codigo, '_', ' '));
  v_fase := case when upper(coalesce(p_fase, 'GRUPOS')) = 'PLAYOFFS' then 'PLAYOFFS' else 'GRUPOS' end;

  insert into public.torneo_grupos (
    torneo_id,
    categoria,
    codigo,
    nombre,
    fase,
    orden,
    grupo_padre_id,
    es_base
  )
  values (
    p_torneo_id,
    v_categoria,
    v_codigo,
    v_nombre,
    v_fase,
    greatest(1, coalesce(p_orden, 1)),
    p_grupo_padre_id,
    coalesce(p_es_base, false)
  )
  on conflict on constraint uq_torneo_grupos_codigo
  do update set
    nombre = excluded.nombre,
    fase = excluded.fase,
    orden = excluded.orden,
    grupo_padre_id = excluded.grupo_padre_id,
    es_base = excluded.es_base,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.upsert_torneo_grupo(bigint, text, text, text, text, integer, uuid, boolean)
is 'Crea o actualiza un grupo visible de torneo y devuelve su id.';

create or replace function public.resolver_grupo_base_torneo(
  p_torneo_id bigint,
  p_categoria text default null,
  p_grupo_base text default null,
  p_grupo_base_id uuid default null
)
returns table (
  grupo_id uuid,
  grupo_codigo text,
  grupo_nombre text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria text;
  v_codigo text;
  v_nombre text;
  v_id uuid;
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

  if p_grupo_base_id is not null then
    select tg.id, tg.codigo, tg.nombre
      into v_id, v_codigo, v_nombre
    from public.torneo_grupos tg
    where tg.id = p_grupo_base_id
      and tg.torneo_id = p_torneo_id
    limit 1;
  end if;

  if v_id is null then
    select tg.id, tg.codigo, tg.nombre
      into v_id, v_codigo, v_nombre
    from public.torneo_configuracion tc
    join public.torneo_grupos tg on tg.id = tc.grupo_base_id
    where tc.torneo_id = p_torneo_id
    limit 1;
  end if;

  v_codigo := coalesce(
    nullif(trim(coalesce(p_grupo_base, v_codigo, '')), ''),
    format('TORNEO_%s', p_torneo_id)
  );

  v_nombre := coalesce(nullif(trim(coalesce(v_nombre, '')), ''), 'Grupo Base');
  v_id := public.upsert_torneo_grupo(p_torneo_id, v_categoria, v_codigo, v_nombre, 'GRUPOS', 1, null, true);

  return query
  select v_id, v_codigo, v_nombre;
end;
$$;

comment on function public.resolver_grupo_base_torneo(bigint, text, text, uuid)
is 'Resuelve o crea el grupo base visible del torneo y devuelve id/codigo/nombre.';

create or replace function public.sincronizar_torneo_configuracion_grupo_base()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria text;
  v_grupo_id uuid;
  v_grupo_codigo text;
  v_grupo_nombre text;
begin
  select t.subtitulo
    into v_categoria
  from public.torneos t
  where t.id = new.torneo_id
  limit 1;

  v_categoria := coalesce(v_categoria, 'General');

  if new.grupo_base_id is not null then
    select tg.id, tg.codigo, tg.nombre
      into v_grupo_id, v_grupo_codigo, v_grupo_nombre
    from public.torneo_grupos tg
    where tg.id = new.grupo_base_id
      and tg.torneo_id = new.torneo_id
    limit 1;

    if v_grupo_id is null then
      raise exception 'grupo_base_id % no pertenece al torneo %.', new.grupo_base_id, new.torneo_id;
    end if;

    new.grupo_base := v_grupo_codigo;
    return new;
  end if;

  select grupo_id, grupo_codigo, grupo_nombre
    into v_grupo_id, v_grupo_codigo, v_grupo_nombre
  from public.resolver_grupo_base_torneo(
    new.torneo_id,
    v_categoria,
    new.grupo_base,
    null
  );

  new.grupo_base_id := v_grupo_id;
  new.grupo_base := v_grupo_codigo;
  return new;
end;
$$;

drop trigger if exists trg_sync_torneo_configuracion_grupo_base on public.torneo_configuracion;
create trigger trg_sync_torneo_configuracion_grupo_base
before insert or update of grupo_base, grupo_base_id on public.torneo_configuracion
for each row execute function public.sincronizar_torneo_configuracion_grupo_base();

do $$
declare
  r record;
  v_grupo_id uuid;
  v_categoria text;
begin
  for r in
    select tc.torneo_id,
           tc.grupo_base,
           tc.grupo_base_id,
           t.subtitulo as categoria
    from public.torneo_configuracion tc
    left join public.torneos t on t.id = tc.torneo_id
  loop
    v_categoria := coalesce(nullif(trim(coalesce(r.categoria, '')), ''), 'General');

    select grupo_id
      into v_grupo_id
    from public.resolver_grupo_base_torneo(
      r.torneo_id,
      v_categoria,
      r.grupo_base,
      r.grupo_base_id
    );

    update public.torneo_configuracion tc
    set grupo_base_id = v_grupo_id,
        grupo_base = coalesce(nullif(trim(tc.grupo_base), ''), format('TORNEO_%s', tc.torneo_id)),
        updated_at = now()
    where tc.torneo_id = r.torneo_id;
  end loop;
end $$;

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
  v_grupo_base_id uuid;
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
  v_grupo_id uuid;
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
    tc.grupo_base_id
    into v_jugadores_por_grupo, v_grupo_base_id
  from public.torneo_configuracion tc
  where tc.torneo_id = p_torneo_id;

  select grupo_id, grupo_codigo
    into v_grupo_base_id, v_grupo_base
  from public.resolver_grupo_base_torneo(
    p_torneo_id,
    v_categoria,
    p_grupo_base,
    v_grupo_base_id
  );

  update public.torneo_configuracion tc
  set grupo_base_id = v_grupo_base_id,
      grupo_base = v_grupo_base,
      updated_at = now()
  where tc.torneo_id = p_torneo_id;

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

  delete from public.torneo_grupos tg
  where tg.torneo_id = p_torneo_id
    and tg.categoria = v_categoria
    and tg.id <> v_grupo_base_id
    and (
      tg.grupo_padre_id = v_grupo_base_id
      or tg.codigo = format('%s_PLAYOFFS', v_grupo_base)
    );

  v_grupos := ceil(v_total::numeric / v_jugadores_por_grupo::numeric)::integer;
  v_base_size := floor(v_total::numeric / v_grupos::numeric)::integer;
  v_remainder := mod(v_total, v_grupos);

  for v_group_idx in 1..v_grupos loop
    v_group_size := v_base_size + case when v_group_idx <= v_remainder then 1 else 0 end;
    v_end := v_start + v_group_size - 1;
    v_members := v_perfiles[v_start:v_end];
    v_grupo := case when v_group_idx = 1 then v_grupo_base else format('%s_G%s', v_grupo_base, v_group_idx) end;
    v_grupo_id := public.upsert_torneo_grupo(
      p_torneo_id,
      v_categoria,
      v_grupo,
      format('Grupo %s', v_group_idx),
      'GRUPOS',
      v_group_idx,
      v_grupo_base_id,
      v_group_idx = 1
    );

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

create or replace function public.procesar_inscripcion_aprobada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria text;
  v_grupo_base text;
  v_grupo_base_id uuid;
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
    tc.grupo_base_id
    into v_jugadores_por_grupo, v_sortear_grupos_en_sorteo, v_grupo_base_id
  from public.torneo_configuracion tc
  where tc.torneo_id = new.torneo_id;

  select grupo_id, grupo_codigo
    into v_grupo_base_id, v_grupo_base
  from public.resolver_grupo_base_torneo(
    new.torneo_id,
    v_categoria,
    new.grupo,
    v_grupo_base_id
  );

  v_jugadores_por_grupo := greatest(2, coalesce(v_jugadores_por_grupo, 8));
  v_sortear_grupos_en_sorteo := coalesce(v_sortear_grupos_en_sorteo, false);
  v_max_participantes := v_jugadores_por_grupo;

  update public.torneo_configuracion tc
  set grupo_base_id = v_grupo_base_id,
      grupo_base = v_grupo_base,
      updated_at = now()
  where tc.torneo_id = new.torneo_id;

  if v_sortear_grupos_en_sorteo then
    new.categoria := v_categoria;
    new.grupo := v_grupo_base;

    perform public.upsert_torneo_grupo(
      new.torneo_id,
      v_categoria,
      v_grupo_base,
      'Grupo Base',
      'GRUPOS',
      1,
      null,
      true
    );

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

  perform public.upsert_torneo_grupo(
    new.torneo_id,
    v_categoria,
    v_grupo_resuelto,
    case
      when v_grupo_resuelto = v_grupo_base then 'Grupo 1'
      else replace(v_grupo_resuelto, '_', ' ')
    end,
    'GRUPOS',
    case
      when v_grupo_resuelto = v_grupo_base then 1
      else greatest(1, coalesce(nullif(substring(v_grupo_resuelto from '_G([0-9]+)$'), ''), '1')::integer)
    end,
    v_grupo_base_id,
    v_grupo_resuelto = v_grupo_base
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

create or replace function public.generar_playoffs_eliminacion_directa_torneo(
  p_torneo_id bigint,
  p_categoria text default null,
  p_grupo_base text default null
)
returns table (
  categoria text,
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
  v_categoria text;
  v_grupo_base text;
  v_grupo_base_id uuid;
  v_clasificados_por_grupo integer := 2;
  v_habilitar_playoffs boolean := false;
  v_grupo_playoffs text;
  v_grupo_playoffs_id uuid;
  v_total integer := 0;
  v_grupos_fuente integer := 0;
  v_partidos integer := 0;
  v_has_existing boolean := false;
  v_seeded uuid[];
  v_idx integer;
  v_j1 uuid;
  v_j2 uuid;
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
    greatest(1, coalesce(tc.clasificados_por_grupo, 2)),
    coalesce(tc.crear_playoffs_eliminacion_directa, false),
    tc.grupo_base_id
    into v_clasificados_por_grupo, v_habilitar_playoffs, v_grupo_base_id
  from public.torneo_configuracion tc
  where tc.torneo_id = p_torneo_id;

  select grupo_id, grupo_codigo
    into v_grupo_base_id, v_grupo_base
  from public.resolver_grupo_base_torneo(
    p_torneo_id,
    v_categoria,
    p_grupo_base,
    v_grupo_base_id
  );

  if not v_habilitar_playoffs then
    raise exception 'Playoffs por eliminacion directa no habilitado en torneo_configuracion para torneo %.', p_torneo_id;
  end if;

  with ranking as (
    select
      tj.grupo,
      tj.perfil_id,
      coalesce(tj.puntos, 0) as puntos,
      coalesce(tj.sets_ganados, 0) as sets_ganados,
      coalesce(tj.partidos_jugados, 0) as partidos_jugados,
      row_number() over (
        partition by tj.grupo
        order by
          coalesce(tj.puntos, 0) desc,
          coalesce(tj.sets_ganados, 0) desc,
          coalesce(tj.partidos_jugados, 0) asc,
          tj.perfil_id asc
      ) as pos_grupo
    from public.torneo_jugadores tj
    where tj.torneo_id = p_torneo_id
      and tj.categoria = v_categoria
      and (
        tj.grupo = v_grupo_base
        or tj.grupo like (v_grupo_base || '\\_G%') escape '\\'
      )
  ),
  clasificados as (
    select *
    from ranking
    where pos_grupo <= v_clasificados_por_grupo
  ),
  seeded as (
    select
      c.*,
      row_number() over (
        order by
          c.pos_grupo asc,
          c.puntos desc,
          c.sets_ganados desc,
          c.partidos_jugados asc,
          c.grupo asc,
          c.perfil_id asc
      ) as seed
    from clasificados c
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

  v_grupo_playoffs := format('%s_PLAYOFFS', v_grupo_base);
  v_grupo_playoffs_id := public.upsert_torneo_grupo(
    p_torneo_id,
    v_categoria,
    v_grupo_playoffs,
    'Playoffs',
    'PLAYOFFS',
    1,
    v_grupo_base_id,
    false
  );

  select exists (
    select 1
    from public.partidos p
    where p.torneo_id = p_torneo_id
      and p.categoria = v_categoria
      and p.grupo = v_grupo_playoffs
  ) into v_has_existing;

  if v_has_existing then
    raise exception 'El playoffs % ya tiene partidos cargados. Limpialos antes de regenerar.', v_grupo_playoffs;
  end if;

  select exists (
    select 1
    from public.torneo_partidos_historial h
    where h.torneo_id = p_torneo_id
      and h.categoria = v_categoria
      and h.grupo = v_grupo_playoffs
  ) into v_has_existing;

  if v_has_existing then
    raise exception 'El playoffs % ya tiene historial cargado. Limpialo antes de regenerar.', v_grupo_playoffs;
  end if;

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
    v_grupo_playoffs,
    'LOCKED',
    v_total,
    v_total,
    true
  )
  on conflict on constraint uq_torneo_estado_scope
  do update set
    estado = 'LOCKED',
    max_participantes = excluded.max_participantes,
    current_participantes = excluded.current_participantes,
    sorteo_realizado = true,
    updated_at = now();

  for v_idx in 1..(v_total / 2) loop
    v_j1 := v_seeded[v_idx];
    v_j2 := v_seeded[v_total - v_idx + 1];

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
      gen_random_uuid(),
      p_torneo_id,
      v_categoria,
      v_grupo_playoffs,
      1,
      v_j1,
      v_j2,
      null,
      'PENDIENTE',
      'programado',
      null
    );

    v_partidos := v_partidos + 1;
  end loop;

  return query
  select v_categoria, v_grupo_playoffs, v_grupos_fuente, v_total, v_partidos;
end;
$$;
