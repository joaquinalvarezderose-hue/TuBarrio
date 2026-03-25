-- Endurece la carga de resultados para que los propios jugadores confirmen
-- un partido puntual sin mezclar torneos concurrentes.
-- Ejecutar despues de:
-- 1) 2026-03-25_partidos_scope_hardening.sql
-- 2) 2026-03-22_register_participant_rpc.sql

create extension if not exists pgcrypto;

alter table if exists public.torneo_partidos_historial
  add column if not exists partido_id uuid;

create unique index if not exists uq_torneo_partidos_historial_partido_id
  on public.torneo_partidos_historial (partido_id)
  where partido_id is not null;

alter table if exists public.torneo_propuestas_partido
  add column if not exists partido_id uuid,
  add column if not exists jornada integer,
  add column if not exists ultimo_cargado_por uuid;

update public.torneo_propuestas_partido
set jornada = coalesce(jornada, 1)
where jornada is null;

alter table if exists public.torneo_propuestas_partido
  alter column jornada set default 1,
  alter column jornada set not null;

create unique index if not exists uq_torneo_propuestas_partido_id
  on public.torneo_propuestas_partido (partido_id)
  where partido_id is not null;

create index if not exists idx_torneo_propuestas_scope
  on public.torneo_propuestas_partido (torneo_id, categoria, grupo, jornada, estado);

create or replace function public.proponer_resultado_partido(
  p_partido_id uuid,
  p_reportado_por uuid,
  p_sets_json jsonb
)
returns table (
  partido_id uuid,
  propuesta_id uuid,
  estado_propuesta text,
  partido_estado text,
  coincidio boolean,
  confirmacion_completa boolean,
  mensaje text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partido public.partidos%rowtype;
  v_propuesta public.torneo_propuestas_partido%rowtype;
  v_sets_j1 jsonb;
  v_sets_j2 jsonb;
  v_sets_player1 integer := 0;
  v_sets_player2 integer := 0;
  v_pts1 integer := 0;
  v_pts2 integer := 0;
  v_winner uuid;
  v_historial_insertado boolean := false;
  v_match_pair_key text;
  v_resultado text;
begin
  if p_partido_id is null or p_reportado_por is null then
    raise exception 'Debes indicar partido_id y reportado_por.';
  end if;

  if p_sets_json is null or jsonb_typeof(p_sets_json) <> 'array' or jsonb_array_length(p_sets_json) < 2 then
    raise exception 'El marcador debe enviarse como un arreglo JSON con al menos 2 sets.';
  end if;

  select * into v_partido
  from public.partidos p
  where p.id = p_partido_id
  for update;

  if not found then
    raise exception 'No existe el partido %.', p_partido_id;
  end if;

  if v_partido.torneo_id is null or v_partido.categoria is null or v_partido.grupo is null then
    raise exception 'El partido % no tiene scope completo. Ejecuta primero 2026-03-25_partidos_scope_hardening.sql.', p_partido_id;
  end if;

  if p_reportado_por not in (v_partido.jugador1_id, v_partido.jugador2_id) then
    raise exception 'Solo puede cargar el resultado uno de los jugadores del partido.';
  end if;

  if v_partido.estado = 'finalizado' then
    return query
    select
      v_partido.id,
      null::uuid,
      'confirmado'::text,
      v_partido.estado,
      true,
      true,
      'El partido ya estaba finalizado.';
    return;
  end if;

  v_match_pair_key := format(
    'PARTIDO:%s|T:%s|C:%s|G:%s|J:%s',
    v_partido.id,
    v_partido.torneo_id,
    v_partido.categoria,
    v_partido.grupo,
    coalesce(v_partido.jornada, 1)
  );

  select * into v_propuesta
  from public.torneo_propuestas_partido tpp
  where tpp.partido_id = p_partido_id
  for update;

  if not found then
    insert into public.torneo_propuestas_partido (
      torneo_id,
      categoria,
      grupo,
      partido_id,
      jornada,
      jugador1_perfil_id,
      jugador2_perfil_id,
      sets_json_j1,
      sets_json_j2,
      estado,
      match_pair_key,
      ultimo_cargado_por,
      updated_at
    )
    values (
      v_partido.torneo_id,
      v_partido.categoria,
      v_partido.grupo,
      v_partido.id,
      coalesce(v_partido.jornada, 1),
      v_partido.jugador1_id,
      v_partido.jugador2_id,
      case when p_reportado_por = v_partido.jugador1_id then p_sets_json else null end,
      case when p_reportado_por = v_partido.jugador2_id then p_sets_json else null end,
      'pendiente',
      v_match_pair_key,
      p_reportado_por,
      now()
    )
    returning * into v_propuesta;
  else
    update public.torneo_propuestas_partido
    set sets_json_j1 = case when p_reportado_por = v_partido.jugador1_id then p_sets_json else sets_json_j1 end,
        sets_json_j2 = case when p_reportado_por = v_partido.jugador2_id then p_sets_json else sets_json_j2 end,
        ultimo_cargado_por = p_reportado_por,
        estado = 'pendiente',
        updated_at = now()
    where partido_id = p_partido_id
    returning * into v_propuesta;
  end if;

  if v_partido.estado = 'programado' then
    update public.partidos
    set estado = 'en_curso'
    where id = p_partido_id;
    v_partido.estado := 'en_curso';
  end if;

  v_sets_j1 := v_propuesta.sets_json_j1;
  v_sets_j2 := v_propuesta.sets_json_j2;

  if v_sets_j1 is null or v_sets_j2 is null then
    return query
    select
      v_partido.id,
      v_propuesta.id,
      'pendiente'::text,
      v_partido.estado,
      false,
      false,
      'Resultado enviado. Falta la carga del rival para confirmar el partido.';
    return;
  end if;

  if v_sets_j1 <> v_sets_j2 then
    update public.torneo_propuestas_partido
    set estado = 'discrepancia',
        updated_at = now()
    where id = v_propuesta.id
    returning * into v_propuesta;

    return query
    select
      v_partido.id,
      v_propuesta.id,
      v_propuesta.estado,
      v_partido.estado,
      false,
      false,
      'Los dos jugadores cargaron marcadores distintos. Se requiere correccion manual.';
    return;
  end if;

  select
    coalesce(sum(case when (set_row->>'p1')::integer > (set_row->>'p2')::integer then 1 else 0 end), 0),
    coalesce(sum(case when (set_row->>'p2')::integer > (set_row->>'p1')::integer then 1 else 0 end), 0)
  into v_sets_player1, v_sets_player2
  from jsonb_array_elements(v_sets_j1) set_row;

  if v_sets_player1 = v_sets_player2 then
    raise exception 'El marcador propuesto no define un ganador valido.';
  end if;

  if v_sets_player1 > v_sets_player2 then
    v_winner := v_partido.jugador1_id;
    v_pts1 := case when v_sets_player2 = 0 then 3 else 2 end;
    v_pts2 := case when v_sets_player2 = 1 then 1 else 0 end;
  else
    v_winner := v_partido.jugador2_id;
    v_pts2 := case when v_sets_player1 = 0 then 3 else 2 end;
    v_pts1 := case when v_sets_player1 = 1 then 1 else 0 end;
  end if;

  v_resultado := format('%s-%s', v_sets_player1, v_sets_player2);

  with historial_insert as (
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
    )
    values (
      v_partido.id,
      v_partido.torneo_id::integer,
      null,
      v_partido.categoria,
      v_partido.grupo,
      v_partido.jugador1_id,
      v_partido.jugador2_id,
      v_winner,
      v_sets_j1,
      v_sets_player1,
      v_sets_player2,
      v_pts1,
      v_pts2,
      'PARTIDO:' || v_partido.id::text,
      p_reportado_por,
      now()
    )
    on conflict (external_match_key) do nothing
    returning 1
  )
  select exists(select 1 from historial_insert)
  into v_historial_insertado;

  if v_historial_insertado then
    update public.torneo_jugadores
    set puntos = puntos + v_pts1,
        partidos_jugados = partidos_jugados + 1,
        sets_ganados = sets_ganados + v_sets_player1
    where torneo_id = v_partido.torneo_id
      and categoria = v_partido.categoria
      and grupo = v_partido.grupo
      and perfil_id = v_partido.jugador1_id;

    update public.torneo_jugadores
    set puntos = puntos + v_pts2,
        partidos_jugados = partidos_jugados + 1,
        sets_ganados = sets_ganados + v_sets_player2
    where torneo_id = v_partido.torneo_id
      and categoria = v_partido.categoria
      and grupo = v_partido.grupo
      and perfil_id = v_partido.jugador2_id;
  end if;

  update public.partidos
  set estado = 'finalizado',
      resultado = v_resultado,
      ganador_id = v_winner
  where id = v_partido.id
  returning * into v_partido;

  update public.torneo_propuestas_partido
  set estado = 'confirmado',
      confirmado_en = now(),
      updated_at = now()
  where id = v_propuesta.id
  returning * into v_propuesta;

  return query
  select
    v_partido.id,
    v_propuesta.id,
    v_propuesta.estado,
    v_partido.estado,
    true,
    true,
    case when v_historial_insertado
      then 'Resultado confirmado por ambos jugadores. El partido ya impacta en tabla e historial.'
      else 'El resultado ya habia sido confirmado previamente.'
    end;
end;
$$;

comment on function public.proponer_resultado_partido(uuid, uuid, jsonb)
is 'Permite que cada jugador cargue el resultado de un partido puntual. Solo cuando ambos envian el mismo marcador se actualizan historial, tabla y estado del partido.';
