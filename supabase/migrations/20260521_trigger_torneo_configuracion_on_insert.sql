create or replace function public.create_default_torneo_configuracion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.torneo_configuracion (
    torneo_id,
    max_participantes_por_grupo,
    grupo_base,
    max_participantes_total,
    clasificados_por_grupo,
    crear_playoffs_eliminacion_directa
  )
  values (
    new.id,
    4,
    format('TORNEO_%s', new.id),
    null,
    2,
    false
  )
  on conflict (torneo_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_create_torneo_configuracion_on_insert on public.torneos;
create trigger trg_create_torneo_configuracion_on_insert
after insert on public.torneos
for each row execute function public.create_default_torneo_configuracion();
