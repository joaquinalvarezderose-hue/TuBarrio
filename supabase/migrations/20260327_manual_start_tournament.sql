-- Inicio manual de torneo luego de sorteo/fixture automatico.
-- Permite definir fecha/hora de arranque sin perder el sorteo automatico.

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
  v_programados integer := 0;
  v_gap integer := greatest(0, coalesce(p_minutos_entre_partidos, 0));
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

  with ordered as (
    select
      p.id,
      row_number() over (order by coalesce(p.fecha_programada, 'infinity'::timestamptz), p.id) as rn
    from public.partidos p
    where p.torneo_id = p_torneo_id
      and p.categoria = p_categoria
      and p.grupo = p_grupo
      and coalesce(p.jornada, 1) = 1
      and p.estado in ('programado', 'en_curso')
  )
  update public.partidos p
  set fecha_programada = coalesce(
        p.fecha_programada,
        p_inicio + ((ordered.rn - 1) * v_gap) * interval '1 minute'
      )
  from ordered
  where p.id = ordered.id
    and p.fecha_programada is null;

  get diagnostics v_programados = row_count;

  update public.torneo_estado te
  set estado = 'EN_CURSO',
      updated_at = now()
  where te.torneo_id = p_torneo_id
    and te.categoria = p_categoria
    and te.grupo = p_grupo;

  return query
  select
    p_torneo_id,
    p_categoria,
    p_grupo,
    v_estado_antes,
    'EN_CURSO'::text,
    v_programados,
    p_inicio;
end;
$$;

comment on function public.iniciar_torneo_manual(bigint, text, text, timestamptz, integer)
is 'Inicia torneo en EN_CURSO y asigna fecha_programada a partidos sin horario, preservando fixture generado por sorteo.';
