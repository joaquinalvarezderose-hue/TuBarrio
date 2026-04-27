-- ============================================================
-- Add debe_confirmar_por column and update validation logic
-- This ensures single source of truth for who must confirm
-- ============================================================

-- 1. Add the new column to track who should confirm
alter table if exists public.torneo_propuestas_partido
  add column if not exists debe_confirmar_por uuid;

-- Add index for performance
create index if not exists idx_torneo_propuestas_debe_confirmar 
  on public.torneo_propuestas_partido (debe_confirmar_por);

-- 2. Update enviar_resultado_seguro to set debe_confirmar_por
-- The logic: whoever DIDN'T send must confirm
-- If jugador1 sends, jugador2 must confirm (and vice versa)
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
  v_debe_confirmar uuid;
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

  -- Calculate who must confirm: the OTHER player
  if p_user_id = v_partido.jugador1_id then
    v_debe_confirmar := v_partido.jugador2_id;
  else
    v_debe_confirmar := v_partido.jugador1_id;
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
      debe_confirmar_por,  -- NEW: who must confirm
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
      v_debe_confirmar,  -- NEW: the other player must confirm
      case when p_user_id = v_partido.jugador1_id then v_sets else null end,
      case when p_user_id = v_partido.jugador2_id then v_sets else null end,
      'pendiente',
      now()
    );
  else
    -- If re-sending, update who must confirm (the other player)
    -- and preserve original sender logic if needed
    update public.torneo_propuestas_partido
    set sets_json_j1 = case when p_user_id = v_partido.jugador1_id then v_sets else sets_json_j1 end,
        sets_json_j2 = case when p_user_id = v_partido.jugador2_id then v_sets else sets_json_j2 end,
        ultimo_cargado_por = p_user_id,
        debe_confirmar_por = v_debe_confirmar,  -- NEW: update who must confirm
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

-- 3. Update validar_resultado_seguro to use debe_confirmar_por instead of hardcoded jugador2_id
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

  -- Fetch the proposal to check who must confirm
  select *
  into v_propuesta
  from public.torneo_propuestas_partido tpp
  where tpp.partido_id = p_partido_id
  for update;

  -- Use debe_confirmar_por if available, fallback to jugador2_id for backward compatibility
  -- If no proposal exists, only jugador2 can confirm (original behavior)
  if v_propuesta.id is not null and v_propuesta.debe_confirmar_por is not null then
    if p_user_id <> v_propuesta.debe_confirmar_por then
      return 'Solo el jugador designado puede confirmar o rechazar este resultado.';
    end if;
  elsif p_user_id <> v_partido.jugador2_id then
    -- Fallback to original hardcoded logic if debe_confirmar_por is not set
    return 'Solo el Jugador 2 puede confirmar o rechazar este resultado.';
  end if;

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
          debe_confirmar_por = null,  -- Clear who must confirm on rejection
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
        v_propuesta.match_pair_key,
        v_propuesta.ultimo_cargado_por,
        now()
      )
      returning id
    )
    select id into v_existing_historial_id from hist;
    v_historial_insertado := true;
  end if;

  update public.torneo_propuestas_partido
  set estado = 'confirmado',
      debe_confirmar_por = null,  -- Clear who must confirm after confirmation
      updated_at = now()
  where id = v_propuesta.id;

  update public.partidos
  set estado = 'finalizado',
      resultado = v_resultado,
      ganador_id = v_winner
  where id = p_partido_id;

  -- Recalc scope points if this match belongs to a group scope
  if v_partido.torneo_id is not null and coalesce(v_partido.grupo, '') <> '' then
    update public.torneo_jugadores tj
    set puntos = coalesce(tj.puntos, 0) + case when tj.perfil_id = v_partido.jugador1_id then v_pts_j1 when tj.perfil_id = v_partido.jugador2_id then v_pts_j2 else 0 end,
        sets_ganados = coalesce(tj.sets_ganados, 0) + case when tj.perfil_id = v_partido.jugador1_id then v_sets_j1 when tj.perfil_id = v_partido.jugador2_id then v_sets_j2 else 0 end,
        partidos_jugados = coalesce(tj.partidos_jugados, 0) + case when tj.perfil_id in (v_partido.jugador1_id, v_partido.jugador2_id) then 1 else 0 end
    where tj.torneo_id = v_partido.torneo_id
      and tj.categoria = v_partido.categoria
      and tj.grupo = v_partido.grupo
      and tj.perfil_id in (v_partido.jugador1_id, v_partido.jugador2_id);

    get diagnostics v_scope_updates = row_count;
  end if;

  return 'OK_CONFIRMADO';
end;
$$;

-- Grant permissions
grant execute on function public.enviar_resultado_seguro(uuid, uuid, integer, integer, integer, integer, integer, integer) to authenticated, service_role;
grant execute on function public.validar_resultado_seguro(uuid, uuid, text) to authenticated, service_role;

-- Backfill existing proposals: set debe_confirmar_por based on ultimo_cargado_por
-- If jugador1 sent last, jugador2 must confirm (and vice versa)
update public.torneo_propuestas_partido
set debe_confirmar_por = case
  when ultimo_cargado_por = jugador1_perfil_id then jugador2_perfil_id
  when ultimo_cargado_por = jugador2_perfil_id then jugador1_perfil_id
  else jugador2_perfil_id  -- fallback
end
where estado = 'pendiente'
  and debe_confirmar_por is null;
