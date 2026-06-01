CREATE OR REPLACE FUNCTION public.enviar_resultado_seguro(p_partido_id uuid, p_user_id uuid, p_set1_j1 integer, p_set1_j2 integer, p_set2_j1 integer, p_set2_j2 integer, p_set3_j1 integer, p_set3_j2 integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_partido public.partidos%rowtype;
  v_propuesta public.torneo_propuestas_partido%rowtype;
  v_match_pair_key text;
  v_sets jsonb;
  v_debe_confirmar uuid;
  v_min_jornada integer;
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

  -- Enforce jornada ordering for round-robin matches only
  if coalesce(v_partido.bracket_tipo, '') != 'eliminacion_directa' then
    select min(p.jornada)
    into v_min_jornada
    from public.partidos p
    where p.torneo_id = v_partido.torneo_id
      and p.categoria = v_partido.categoria
      and (p.jugador1_id = p_user_id or p.jugador2_id = p_user_id)
      and coalesce(p.bracket_tipo, '') != 'eliminacion_directa'
      and p.estado != 'finalizado';

    if v_min_jornada is not null and v_partido.jornada > v_min_jornada then
      return 'Debes completar la jornada ' || v_min_jornada || ' antes de cargar este resultado.';
    end if;
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
      jugador1_id,
      jugador2_id,
      jugador1_perfil_id,
      jugador2_perfil_id,
      match_pair_key,
      partido_id,
      jornada,
      ultimo_cargado_por,
      debe_confirmar_por,
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
      v_partido.jugador1_id,
      v_partido.jugador2_id,
      v_match_pair_key,
      v_partido.id,
      coalesce(v_partido.jornada, 1),
      p_user_id,
      v_debe_confirmar,
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
        debe_confirmar_por = v_debe_confirmar,
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
$function$;
