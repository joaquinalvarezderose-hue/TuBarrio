-- Configuracion y armado de playoffs por eliminacion directa.
-- Fecha: 2026-04-10

create extension if not exists pgcrypto;

alter table if exists public.torneo_configuracion
  add column if not exists clasificados_por_grupo integer not null default 2 check (clasificados_por_grupo >= 1),
  add column if not exists crear_playoffs_eliminacion_directa boolean not null default false;

update public.torneo_configuracion
set clasificados_por_grupo = greatest(1, coalesce(clasificados_por_grupo, 2)),
    crear_playoffs_eliminacion_directa = coalesce(crear_playoffs_eliminacion_directa, false)
where true;

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
  v_clasificados_por_grupo integer := 2;
  v_habilitar_playoffs boolean := false;
  v_grupo_playoffs text;
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
    coalesce(nullif(trim(tc.grupo_base), ''), format('TORNEO_%s', p_torneo_id)),
    greatest(1, coalesce(tc.clasificados_por_grupo, 2)),
    coalesce(tc.crear_playoffs_eliminacion_directa, false)
    into v_grupo_base, v_clasificados_por_grupo, v_habilitar_playoffs
  from public.torneo_configuracion tc
  where tc.torneo_id = p_torneo_id;

  v_grupo_base := coalesce(nullif(trim(coalesce(p_grupo_base, v_grupo_base, '')), ''), format('TORNEO_%s', p_torneo_id));

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

comment on function public.generar_playoffs_eliminacion_directa_torneo(bigint, text, text)
is 'Toma los mejores N por grupo (configurable) y arma cruces de playoffs en eliminacion directa (jornada 1) sobre el grupo *_PLAYOFFS.';
