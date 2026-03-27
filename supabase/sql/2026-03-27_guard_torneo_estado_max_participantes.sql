-- Guardrail de cupo para torneo_estado.
-- Regla: no permitir max_participantes menor que participantes reales del scope.

create or replace function public.validar_cupo_torneo_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_real integer := 0;
begin
  new.max_participantes := greatest(2, coalesce(new.max_participantes, 2));

  select count(distinct tj.perfil_id)::integer
    into v_current_real
  from public.torneo_jugadores tj
  where tj.torneo_id = new.torneo_id
    and tj.categoria = new.categoria
    and tj.grupo = new.grupo;

  new.current_participantes := v_current_real;

  if new.max_participantes < v_current_real then
    raise exception
      'No se puede bajar max_participantes a % porque hay % participantes reales en %/%/%.',
      new.max_participantes,
      v_current_real,
      new.torneo_id,
      new.categoria,
      new.grupo;
  end if;

  if coalesce(new.estado, 'RECRUITING') = 'RECRUITING' and v_current_real >= new.max_participantes then
    new.estado := 'LOCKED';
  elsif coalesce(new.estado, 'RECRUITING') = 'LOCKED'
        and v_current_real < new.max_participantes
        and coalesce(new.sorteo_realizado, false) = false then
    -- Si se amplia el cupo y todavia no hubo sorteo, se reabre inscripcion.
    new.estado := 'RECRUITING';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validar_cupo_torneo_estado on public.torneo_estado;
create trigger trg_validar_cupo_torneo_estado
before insert or update of max_participantes, current_participantes, estado
on public.torneo_estado
for each row
execute function public.validar_cupo_torneo_estado();
