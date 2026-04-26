-- Corrige RPCs de carga/validacion para que impacten siempre en:
-- 1) partidos (estado + sets + ganador)
-- 2) torneo_partidos_historial
-- 3) torneo_jugadores (puntos/PJ/sets)

create extension if not exists pgcrypto;

alter table if exists public.torneo_propuestas_partido
  add column if not exists partido_id uuid,
  add column if not exists jornada integer,
  add column if not exists ultimo_cargado_por uuid;

create unique index if not exists uq_torneo_propuestas_partido_id
  on public.torneo_propuestas_partido (partido_id)
  where partido_id is not null;

alter table if exists public.torneo_partidos_historial
  add column if not exists partido_id uuid;

create unique index if not exists uq_torneo_partidos_historial_partido_id
  on public.torneo_partidos_historial (partido_id)
  where partido_id is not null;

alter table if exists public.partidos
  add column if not exists set1_j1 integer,
  add column if not exists set1_j2 integer,
  add column if not exists set2_j1 integer,
  add column if not exists set2_j2 integer,
  add column if not exists set3_j1 integer,
  add column if not exists set3_j2 integer;

create or replace function public.enviar_resultado_seguro(
  p_partido_id uuid,
  p_user_id uuid,
  p_set1_j1 integer,
  p_set1_j2 integer,
  p_set2_j1 integer,
  p_set2_j2 integer,
  p_set3_j1 integer,
  p_set3_j2 integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partido public.partidos%rowtype;
  v_propuesta public.torneo_propuestas_partido%rowtype;
  v_match_pair_key text;
  v_sets jsonb;
begin
  if p_partido_id is null or p_user_id is null then
    return 'Partido o usuario invalido.';
  end if;

  if p_set1_j1 is null or p_set1_j2 is null or p_set2_j1 is null or p_set2_j2 is null then
    return 'Faltan sets obligatorios para enviar el resultado.';
  end if;

  select *
  into v_partido
  from public.partidos p
  where p.id = p_partido_id
  for update;

  if not found then
    return 'Partido no encontrado.';
  end if;

  if p_user_id not in (v_partido.jugador1_id, v_partido.jugador2_id) then
    return 'Solo los jugadores del partido pueden cargar resultado.';
  end if;

  if coalesce(v_partido.estado, '') = 'finalizado' then
    return 'Este partido ya esta finalizado.';
  end if;

  v_match_pair_key := format(
    'PARTIDO:%s|T:%s|C:%s|G:%s|J:%s',
    v_partido.id,
    v_partido.torneo_id,
    coalesce(v_partido.categoria, ''),
    coalesce(v_partido.grupo, ''),
    coalesce(v_partido.jornada, 1)
  );

  v_sets := jsonb_build_array(
    jsonb_build_object('p1', greatest(0, coalesce(p_set1_j1, 0)), 'p2', greatest(0, coalesce(p_set1_j2, 0))),
    jsonb_build_object('p1', greatest(0, coalesce(p_set2_j1, 0)), 'p2', greatest(0, coalesce(p_set2_j2, 0))),
    jsonb_build_object('p1', greatest(0, coalesce(p_set3_j1, 0)), 'p2', greatest(0, coalesce(p_set3_j2, 0)))
  );

  select *
  into v_propuesta
  from public.torneo_propuestas_partido tpp
  where tpp.partido_id = p_partido_id
  for update;

  if not found then
    insert into public.torneo_propuestas_partido (
      torneo_id,
      categoria,
      grupo,
      jugador1_perfil_id,
      jugador2_perfil_id,
      match_pair_key,
      partido_id,
      jornada,
      ultimo_cargado_por,
      sets_json_j1,
      sets_json_j2,
      estado,
      updated_at
    )
    values (
      coalesce(v_partido.torneo_id, 0)::integer,
      coalesce(v_partido.categoria, ''),
      coalesce(v_partido.grupo, ''),
      v_partido.jugador1_id,
      v_partido.jugador2_id,
      v_match_pair_key,
      v_partido.id,
      coalesce(v_partido.jornada, 1),
      p_user_id,
      case when p_user_id = v_partido.jugador1_id then v_sets else null end,
      case when p_user_id = v_partido.jugador2_id then v_sets else null end,
      'pendiente',
      now()
    );
  else
    update public.torneo_propuestas_partido
    set sets_json_j1 = case when p_user_id = v_partido.jugador1_id then v_sets else sets_json_j1 end,
        sets_json_j2 = case when p_user_id = v_partido.jugador2_id then v_sets else sets_json_j2 end,
        ultimo_cargado_por = p_user_id,
        estado = 'pendiente',
        updated_at = now()
    where partido_id = p_partido_id;
  end if;

  update public.partidos
  set estado = 'esperando_validacion',
      set1_j1 = greatest(0, coalesce(p_set1_j1, 0)),
      set1_j2 = greatest(0, coalesce(p_set1_j2, 0)),
      set2_j1 = greatest(0, coalesce(p_set2_j1, 0)),
      set2_j2 = greatest(0, coalesce(p_set2_j2, 0)),
      set3_j1 = case when p_set3_j1 is null then null else greatest(0, p_set3_j1) end,
      set3_j2 = case when p_set3_j2 is null then null else greatest(0, p_set3_j2) end
  where id = p_partido_id;

  return 'OK';
end;
$$;

create or replace function public.validar_resultado_seguro(
  p_partido_id uuid,
  p_user_id uuid,
  p_accion text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partido public.partidos%rowtype;
  v_propuesta public.torneo_propuestas_partido%rowtype;
  v_set_row jsonb;
  v_sets jsonb;
  v_existing_historial_id uuid;
  v_sets_j1 integer := 0;
  v_sets_j2 integer := 0;
  v_pts_j1 integer := 0;
  v_pts_j2 integer := 0;
  v_winner uuid;
  v_resultado text;
  v_historial_insertado boolean := false;
  v_scope_updates integer := 0;
begin
  if p_partido_id is null or p_user_id is null then
    return 'Partido o usuario invalido.';
  end if;

  select *
  into v_partido
  from public.partidos p
  where p.id = p_partido_id
  for update;

  if not found then
    return 'Partido no encontrado.';
  end if;

  if p_user_id not in (v_partido.jugador1_id, v_partido.jugador2_id) then
    return 'Solo los jugadores del partido pueden validar resultado.';
  end if;

  if p_user_id <> v_partido.jugador2_id then
    return 'Solo el Jugador 2 puede confirmar o rechazar este resultado.';
  end if;

  select *
  into v_propuesta
  from public.torneo_propuestas_partido tpp
  where tpp.partido_id = p_partido_id
  for update;

  if lower(coalesce(p_accion, '')) = 'rechazar' then
    update public.partidos
    set estado = 'programado',
        resultado = null,
        ganador_id = null,
        set1_j1 = null,
        set1_j2 = null,
        set2_j1 = null,
        set2_j2 = null,
        set3_j1 = null,
        set3_j2 = null
    where id = p_partido_id;

    if found and v_propuesta.id is not null then
      update public.torneo_propuestas_partido
      set estado = 'discrepancia',
          sets_json_j1 = null,
          sets_json_j2 = null,
          updated_at = now()
      where id = v_propuesta.id;
    end if;

    return 'OK_RECHAZADO';
  end if;

  if lower(coalesce(p_accion, '')) <> 'confirmar' then
    return 'Accion invalida.';
  end if;

  if coalesce(v_partido.estado, '') not in ('esperando_validacion', 'finalizado') then
    return 'El partido no esta esperando validacion.';
  end if;

  select h.id
  into v_existing_historial_id
  from public.torneo_partidos_historial h
  where h.partido_id = p_partido_id
  limit 1;

  if v_propuesta.id is not null then
    v_sets := coalesce(v_propuesta.sets_json_j1, v_propuesta.sets_json_j2);
  end if;

  if v_sets is null and v_partido.set1_j1 is not null and v_partido.set1_j2 is not null and v_partido.set2_j1 is not null and v_partido.set2_j2 is not null then
    v_sets := jsonb_build_array(
      jsonb_build_object('p1', v_partido.set1_j1, 'p2', v_partido.set1_j2),
      jsonb_build_object('p1', v_partido.set2_j1, 'p2', v_partido.set2_j2),
      jsonb_build_object('p1', coalesce(v_partido.set3_j1, 0), 'p2', coalesce(v_partido.set3_j2, 0))
    );
  end if;

  if v_sets is null then
    return 'No hay un resultado propuesto para confirmar.';
  end if;

  for v_set_row in select value from jsonb_array_elements(v_sets)
  loop
    if coalesce((v_set_row->>'p1')::integer, 0) > coalesce((v_set_row->>'p2')::integer, 0) then
      v_sets_j1 := v_sets_j1 + 1;
    elsif coalesce((v_set_row->>'p2')::integer, 0) > coalesce((v_set_row->>'p1')::integer, 0) then
      v_sets_j2 := v_sets_j2 + 1;
    end if;
  end loop;

  if v_sets_j1 = v_sets_j2 then
    return 'El marcador propuesto no define un ganador valido.';
  end if;

  if v_sets_j1 > v_sets_j2 then
    v_winner := v_partido.jugador1_id;
    v_pts_j1 := case when v_sets_j2 = 0 then 3 else 2 end;
    v_pts_j2 := case when v_sets_j2 = 1 then 1 else 0 end;
  else
    v_winner := v_partido.jugador2_id;
    v_pts_j2 := case when v_sets_j1 = 0 then 3 else 2 end;
    v_pts_j1 := case when v_sets_j1 = 1 then 1 else 0 end;
  end if;

  v_resultado := format('%s-%s', v_sets_j1, v_sets_j2);

  if v_existing_historial_id is null then
    with hist as (
      insert into public.torneo_partidos_historial (
        partido_id,
        torneo_id,
        torneo_titulo,
        categoria,
        grupo,
        jugador1_perfil_id,
        jugador2_perfil_id,
        ganador_perfil_id,
        sets_json,
        sets_jugador1,
        sets_jugador2,
        puntos_jugador1,
        puntos_jugador2,
        external_match_key,
        cargado_por_perfil_id,
        cargado_en
      ) values (
        v_partido.id,
        coalesce(v_partido.torneo_id, 0)::integer,
        null,
        coalesce(v_partido.categoria, ''),
        coalesce(v_partido.grupo, ''),
        v_partido.jugador1_id,
        v_partido.jugador2_id,
        v_winner,
        v_sets,
        v_sets_j1,
        v_sets_j2,
        v_pts_j1,
        v_pts_j2,
        'PARTIDO:' || v_partido.id::text,
        p_user_id,
        now()
      )
      on conflict (external_match_key) do nothing
      returning 1
    )
    select exists(select 1 from hist) into v_historial_insertado;

    if v_historial_insertado then
      update public.torneo_jugadores
      set puntos = coalesce(puntos, 0) + v_pts_j1,
          partidos_jugados = coalesce(partidos_jugados, 0) + 1,
          sets_ganados = coalesce(sets_ganados, 0) + v_sets_j1
      where torneo_id = v_partido.torneo_id
        and categoria = v_partido.categoria
        and grupo = v_partido.grupo
        and perfil_id = v_partido.jugador1_id;

      get diagnostics v_scope_updates = row_count;
      if v_scope_updates = 0 then
        update public.torneo_jugadores
        set puntos = coalesce(puntos, 0) + v_pts_j1,
            partidos_jugados = coalesce(partidos_jugados, 0) + 1,
            sets_ganados = coalesce(sets_ganados, 0) + v_sets_j1
        where torneo_id = v_partido.torneo_id
          and perfil_id = v_partido.jugador1_id;
      end if;

      update public.torneo_jugadores
      set puntos = coalesce(puntos, 0) + v_pts_j2,
          partidos_jugados = coalesce(partidos_jugados, 0) + 1,
          sets_ganados = coalesce(sets_ganados, 0) + v_sets_j2
      where torneo_id = v_partido.torneo_id
        and categoria = v_partido.categoria
        and grupo = v_partido.grupo
        and perfil_id = v_partido.jugador2_id;

      get diagnostics v_scope_updates = row_count;
      if v_scope_updates = 0 then
        update public.torneo_jugadores
        set puntos = coalesce(puntos, 0) + v_pts_j2,
            partidos_jugados = coalesce(partidos_jugados, 0) + 1,
            sets_ganados = coalesce(sets_ganados, 0) + v_sets_j2
        where torneo_id = v_partido.torneo_id
          and perfil_id = v_partido.jugador2_id;
      end if;
    end if;
  end if;

  update public.partidos
  set estado = 'finalizado',
      resultado = v_resultado,
      ganador_id = v_winner,
      set1_j1 = coalesce((v_sets->0->>'p1')::integer, 0),
      set1_j2 = coalesce((v_sets->0->>'p2')::integer, 0),
      set2_j1 = coalesce((v_sets->1->>'p1')::integer, 0),
      set2_j2 = coalesce((v_sets->1->>'p2')::integer, 0),
      set3_j1 = nullif(coalesce((v_sets->2->>'p1')::integer, 0), 0),
      set3_j2 = nullif(coalesce((v_sets->2->>'p2')::integer, 0), 0)
  where id = p_partido_id;

  if v_propuesta.id is not null then
    update public.torneo_propuestas_partido
    set estado = 'confirmado',
        confirmado_en = now(),
        updated_at = now()
    where id = v_propuesta.id;
  end if;

  return 'OK_CONFIRMADO';
end;
$$;

grant execute on function public.enviar_resultado_seguro(uuid, uuid, integer, integer, integer, integer, integer, integer) to authenticated, service_role;
grant execute on function public.validar_resultado_seguro(uuid, uuid, text) to authenticated, service_role;

-- Backfill opcional para partidos ya finalizados sin historial: crea historial faltante
-- y deja listo el recalculo de la tabla si hubiera resultados viejos inconsistentes.
with missing_historial as (
  select
    p.id as partido_id,
    p.torneo_id,
    p.categoria,
    p.grupo,
    p.jugador1_id,
    p.jugador2_id,
    p.ganador_id,
    coalesce(p.set1_j1, 0) as set1_j1,
    coalesce(p.set1_j2, 0) as set1_j2,
    coalesce(p.set2_j1, 0) as set2_j1,
    coalesce(p.set2_j2, 0) as set2_j2,
    coalesce(p.set3_j1, 0) as set3_j1,
    coalesce(p.set3_j2, 0) as set3_j2
  from public.partidos p
  left join public.torneo_partidos_historial h
    on h.partido_id = p.id
  where p.estado = 'finalizado'
    and h.id is null
    and p.jugador1_id is not null
    and p.jugador2_id is not null
), prepared as (
  select
    m.*,
    (case when m.set1_j1 > m.set1_j2 then 1 else 0 end
      + case when m.set2_j1 > m.set2_j2 then 1 else 0 end
      + case when m.set3_j1 > m.set3_j2 then 1 else 0 end) as sets_j1,
    (case when m.set1_j2 > m.set1_j1 then 1 else 0 end
      + case when m.set2_j2 > m.set2_j1 then 1 else 0 end
      + case when m.set3_j2 > m.set3_j1 then 1 else 0 end) as sets_j2
  from missing_historial m
), scored as (
  select
    p.*,
    case
      when p.sets_j1 > p.sets_j2 then case when p.sets_j2 = 0 then 3 else 2 end
      when p.sets_j2 > p.sets_j1 then case when p.sets_j1 = 0 then 0 else 1 end
      else 0
    end as pts_j1,
    case
      when p.sets_j2 > p.sets_j1 then case when p.sets_j1 = 0 then 3 else 2 end
      when p.sets_j1 > p.sets_j2 then case when p.sets_j2 = 0 then 0 else 1 end
      else 0
    end as pts_j2
  from prepared p
), inserted as (
  insert into public.torneo_partidos_historial (
    partido_id,
    torneo_id,
    categoria,
    grupo,
    jugador1_perfil_id,
    jugador2_perfil_id,
    ganador_perfil_id,
    sets_json,
    sets_jugador1,
    sets_jugador2,
    puntos_jugador1,
    puntos_jugador2,
    external_match_key,
    cargado_en
  )
  select
    s.partido_id,
    coalesce(s.torneo_id, 0)::integer,
    coalesce(s.categoria, ''),
    coalesce(s.grupo, ''),
    s.jugador1_id,
    s.jugador2_id,
    s.ganador_id,
    jsonb_build_array(
      jsonb_build_object('p1', s.set1_j1, 'p2', s.set1_j2),
      jsonb_build_object('p1', s.set2_j1, 'p2', s.set2_j2),
      jsonb_build_object('p1', s.set3_j1, 'p2', s.set3_j2)
    ),
    s.sets_j1,
    s.sets_j2,
    s.pts_j1,
    s.pts_j2,
    'PARTIDO:' || s.partido_id::text,
    now()
  from scored s
  on conflict (external_match_key) do nothing
  returning torneo_id, categoria, grupo, jugador1_perfil_id, jugador2_perfil_id, puntos_jugador1, puntos_jugador2, sets_jugador1, sets_jugador2
),
agg as (
  select torneo_id, categoria, grupo, jugador1_perfil_id as perfil_id,
         sum(puntos_jugador1) as puntos,
         count(*) as pj,
         sum(sets_jugador1) as sets
  from inserted
  group by torneo_id, categoria, grupo, jugador1_perfil_id
  union all
  select torneo_id, categoria, grupo, jugador2_perfil_id as perfil_id,
         sum(puntos_jugador2) as puntos,
         count(*) as pj,
         sum(sets_jugador2) as sets
  from inserted
  group by torneo_id, categoria, grupo, jugador2_perfil_id
),
agg_merged as (
  select torneo_id, categoria, grupo, perfil_id,
         sum(puntos) as puntos,
         sum(pj) as pj,
         sum(sets) as sets
  from agg
  group by torneo_id, categoria, grupo, perfil_id
)
update public.torneo_jugadores tj
set puntos = coalesce(tj.puntos, 0) + coalesce(a.puntos, 0),
    partidos_jugados = coalesce(tj.partidos_jugados, 0) + coalesce(a.pj, 0),
    sets_ganados = coalesce(tj.sets_ganados, 0) + coalesce(a.sets, 0)
from agg_merged a
where tj.torneo_id = a.torneo_id
  and tj.categoria = a.categoria
  and tj.grupo = a.grupo
  and tj.perfil_id = a.perfil_id;
