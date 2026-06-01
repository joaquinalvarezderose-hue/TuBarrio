-- Fix group naming to properly format as "Grupo N" instead of "TORNEO X G2"
-- Date: 2026-06-01

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
  v_grupo_nombre text;
  v_grupo_numero integer;
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

  -- Properly format group name as "Grupo N" instead of replacing underscores
  if v_grupo_resuelto = v_grupo_base then
    v_grupo_nombre := 'Grupo 1';
    v_grupo_numero := 1;
  else
    v_grupo_numero := coalesce(nullif(substring(v_grupo_resuelto from '_G([0-9]+)$'), ''), '1')::integer;
    v_grupo_nombre := format('Grupo %s', v_grupo_numero);
  end if;

  perform public.upsert_torneo_grupo(
    new.torneo_id,
    v_categoria,
    v_grupo_resuelto,
    v_grupo_nombre,
    'GRUPOS',
    v_grupo_numero,
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

comment on function public.procesar_inscripcion_aprobada()
is 'Trigger de aprobacion: normaliza categoria, resuelve grupo automaticamente y registra jugador con sorteo round robin al completar cupo. Ahora con nombres de grupo correctamente formateados.';
