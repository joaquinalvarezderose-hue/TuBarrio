-- Lifecycle triggers for block-based tournament start and automatic playoff creation.
-- Fecha: 2026-05-08

create or replace function public.iniciar_torneo_en_curso(
  p_torneo_id bigint,
  p_categoria text default null,
  p_grupo_base text default null
)
returns table (
  torneo_id bigint,
  categoria text,
  grupo_base text,
  grupos_actualizados integer,
  partidos_creados integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria text;
  v_grupo_base text;
  v_sortear_grupos_en_sorteo boolean := false;
  v_grupos_actualizados integer := 0;
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
    coalesce(tc.sortear_grupos_en_sorteo, false)
    into v_grupo_base, v_sortear_grupos_en_sorteo
  from public.torneo_configuracion tc
  where tc.torneo_id = p_torneo_id;

  v_grupo_base := coalesce(nullif(trim(coalesce(p_grupo_base, v_grupo_base, '')), ''), format('TORNEO_%s', p_torneo_id));

  if v_sortear_grupos_en_sorteo then
    if not exists (
      select 1
      from public.torneo_estado te
      where te.torneo_id = p_torneo_id
        and te.categoria = v_categoria
        and te.grupo = v_grupo_base
        and coalesce(te.sorteo_realizado, false) = true
    ) then
      perform public.sortear_grupos_y_fixture_torneo(p_torneo_id, v_categoria, v_grupo_base);
    end if;
  end if;

  update public.torneo_estado te
  set estado = 'EN_CURSO',
      updated_at = now()
  where te.torneo_id = p_torneo_id
    and te.categoria = v_categoria
    and (
      te.grupo = v_grupo_base
      or te.grupo like (v_grupo_base || '\_G%') escape '\'
    )
    and te.estado in ('RECRUITING', 'LOCKED');

  get diagnostics v_grupos_actualizados = row_count;

  return query
  select p_torneo_id, v_categoria, v_grupo_base, v_grupos_actualizados, 0;
end;
$$;

comment on function public.iniciar_torneo_en_curso(bigint, text, text)
is 'Inicia un torneo de grupos en EN_CURSO. Si el torneo esta configurado para sorteo diferido, ejecuta el sorteo y genera fixture antes de iniciar.';

create or replace function public.generar_playoffs_al_finalizar_grupos(
  p_torneo_id bigint,
  p_categoria text default null,
  p_grupo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria text;
  v_grupo text;
  v_grupo_base text;
  v_habilitar_playoffs boolean := false;
  v_has_open_groups boolean := false;
  v_has_playoffs boolean := false;
  v_has_stage boolean := false;
begin
  if pg_trigger_depth() > 1 then
    return;
  end if;

  v_categoria := nullif(trim(coalesce(p_categoria, '')), '');
  if v_categoria is null then
    select t.subtitulo
      into v_categoria
    from public.torneos t
    where t.id = p_torneo_id
    limit 1;
  end if;
  v_categoria := coalesce(v_categoria, 'General');

  v_grupo := nullif(trim(coalesce(p_grupo, '')), '');
  if v_grupo is null then
    v_grupo := format('TORNEO_%s', p_torneo_id);
  end if;

  select
    coalesce(nullif(trim(tc.grupo_base), ''), format('TORNEO_%s', p_torneo_id)),
    coalesce(tc.crear_playoffs_eliminacion_directa, false)
    into v_grupo_base, v_habilitar_playoffs
  from public.torneo_configuracion tc
  where tc.torneo_id = p_torneo_id;

  v_grupo_base := coalesce(v_grupo_base, format('TORNEO_%s', p_torneo_id));

  if v_grupo like '%_G%' then
    v_grupo_base := regexp_replace(v_grupo, '_G[0-9]+$', '');
  else
    v_grupo_base := v_grupo;
  end if;

  if v_grupo_base like '%PLAYOFFS%' then
    return;
  end if;

  if not v_habilitar_playoffs then
    return;
  end if;

  select exists (
    select 1
    from public.torneo_estado te
    where te.torneo_id = p_torneo_id
      and te.categoria = v_categoria
      and (
        te.grupo = v_grupo_base
        or te.grupo like (v_grupo_base || '\_G%') escape '\'
      )
  ) into v_has_stage;

  if not v_has_stage then
    return;
  end if;

  select exists (
    select 1
    from public.torneo_estado te
    where te.torneo_id = p_torneo_id
      and te.categoria = v_categoria
      and (
        te.grupo = v_grupo_base
        or te.grupo like (v_grupo_base || '\_G%') escape '\'
      )
      and te.estado <> 'FINALIZADO'
  ) into v_has_open_groups;

  if v_has_open_groups then
    return;
  end if;

  select exists (
    select 1
    from public.partidos p
    where p.torneo_id = p_torneo_id
      and p.categoria = v_categoria
      and p.grupo = format('%s_PLAYOFFS', v_grupo_base)
  ) into v_has_playoffs;

  if v_has_playoffs then
    return;
  end if;

  select exists (
    select 1
    from public.torneo_partidos_historial h
    where h.torneo_id = p_torneo_id
      and h.categoria = v_categoria
      and h.grupo = format('%s_PLAYOFFS', v_grupo_base)
  ) into v_has_playoffs;

  if v_has_playoffs then
    return;
  end if;

  perform public.generar_playoffs_eliminacion_directa_torneo(p_torneo_id, v_categoria, v_grupo_base);
end;
$$;

comment on function public.generar_playoffs_al_finalizar_grupos(bigint, text, text)
is 'Genera automáticamente los playoffs de eliminacion directa cuando todos los grupos de la fase preliminar quedaron finalizados.';

create or replace function public.trg_iniciar_torneo_en_curso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo_base text;
  v_sortear_grupos_en_sorteo boolean := false;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.estado <> 'EN_CURSO' or old.estado <> 'RECRUITING' then
    return new;
  end if;

  v_grupo_base := nullif(trim(coalesce(new.grupo, '')), '');
  if v_grupo_base is null then
    v_grupo_base := format('TORNEO_%s', new.torneo_id);
  end if;

  select
    coalesce(nullif(trim(tc.grupo_base), ''), format('TORNEO_%s', new.torneo_id)),
    coalesce(tc.sortear_grupos_en_sorteo, false)
    into v_grupo_base, v_sortear_grupos_en_sorteo
  from public.torneo_configuracion tc
  where tc.torneo_id = new.torneo_id;

  if not v_sortear_grupos_en_sorteo then
    return new;
  end if;

  if new.grupo <> v_grupo_base then
    return new;
  end if;

  perform public.iniciar_torneo_en_curso(new.torneo_id, new.categoria, v_grupo_base);

  return new;
end;
$$;

drop trigger if exists trg_iniciar_torneo_en_curso on public.torneo_estado;
create trigger trg_iniciar_torneo_en_curso
after update of estado
on public.torneo_estado
for each row
execute function public.trg_iniciar_torneo_en_curso();

create or replace function public.trg_generar_playoffs_al_finalizar_grupos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.estado <> 'FINALIZADO' or old.estado = 'FINALIZADO' then
    return new;
  end if;

  if new.grupo like '%PLAYOFFS%' then
    return new;
  end if;

  perform public.generar_playoffs_al_finalizar_grupos(new.torneo_id, new.categoria, new.grupo);

  return new;
end;
$$;

drop trigger if exists trg_generar_playoffs_al_finalizar_grupos on public.torneo_estado;
create trigger trg_generar_playoffs_al_finalizar_grupos
after update of estado
on public.torneo_estado
for each row
execute function public.trg_generar_playoffs_al_finalizar_grupos();
