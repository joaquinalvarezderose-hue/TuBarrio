-- Inicio manual de torneo luego de sorteo/fixture automatico.
-- Solo cambia estado a EN_CURSO; no agenda fechas de partidos.

create or replace function public.iniciar_torneo_manual(
  p_torneo_id bigint,
  p_categoria text,
  p_grupo text,
  p_inicio timestamptz default now(),
  p_minutos_entre_partidos integer default 0
)
returns table (
  torneo_id bigint,
  categoria text,
  grupo text,
  estado_antes text,
  estado_despues text,
  partidos_programados integer,
  inicio_aplicado timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado_antes text;
  v_partidos integer := 0;
  v_inicio_real timestamptz;
begin
  select te.estado
    into v_estado_antes
  from public.torneo_estado te
  where te.torneo_id = p_torneo_id
    and te.categoria = p_categoria
    and te.grupo = p_grupo
  for update;

  if not found then
    raise exception 'No existe torneo_estado para %/%/%.', p_torneo_id, p_categoria, p_grupo;
  end if;

  select count(*)::integer
    into v_partidos
  from public.partidos p
  where p.torneo_id = p_torneo_id
    and p.categoria = p_categoria
    and p.grupo = p_grupo
    and coalesce(p.jornada, 1) = 1;

  if v_partidos = 0 then
    raise exception 'No hay fixture cargado para %/%/%. Ejecuta primero el sorteo.', p_torneo_id, p_categoria, p_grupo;
  end if;

  update public.torneo_estado te
  set estado = 'EN_CURSO',
      updated_at = now()
  where te.torneo_id = p_torneo_id
    and te.categoria = p_categoria
    and te.grupo = p_grupo
  returning te.updated_at into v_inicio_real;

  return query
  select
    p_torneo_id,
    p_categoria,
    p_grupo,
    v_estado_antes,
    'EN_CURSO'::text,
    0,
    v_inicio_real;
end;
$$;

comment on function public.iniciar_torneo_manual(bigint, text, text, timestamptz, integer)
is 'Inicia torneo en EN_CURSO sin modificar fecha_programada; el fixture de sorteo se preserva tal cual.';
