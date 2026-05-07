-- ============================================================
-- Modificar trigger para permitir sin límite máximo
-- max_participantes = NULL significa "sin límite máximo"
-- ============================================================

create or replace function public.validar_cupo_torneo_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_real integer := 0;
begin
  -- Solo forzar mínimo si max_participantes tiene valor (no NULL)
  if new.max_participantes is not null then
    new.max_participantes := greatest(2, new.max_participantes);
  end if;

  select count(distinct tj.perfil_id)::integer
    into v_current_real
  from public.torneo_jugadores tj
  where tj.torneo_id = new.torneo_id
    and tj.categoria = new.categoria
    and tj.grupo = new.grupo;

  new.current_participantes := v_current_real;

  -- Solo validar límite si max_participantes tiene valor (no NULL)
  if new.max_participantes is not null and new.max_participantes < v_current_real then
    raise exception
      'No se puede bajar max_participantes a % porque hay % participantes reales en %/%/%.',
      new.max_participantes,
      v_current_real,
      new.torneo_id,
      new.categoria,
      new.grupo;
  end if;

  -- Solo cambiar estado si hay límite máximo definido
  if new.max_participantes is not null then
    if coalesce(new.estado, 'RECRUITING') = 'RECRUITING' and v_current_real >= new.max_participantes then
      new.estado := 'LOCKED';
    elsif coalesce(new.estado, 'RECRUITING') = 'LOCKED'
          and v_current_real < new.max_participantes
          and coalesce(new.sorteo_realizado, false) = false then
      -- Si se amplia el cupo y todavia no hubo sorteo, se reabre inscripcion.
      new.estado := 'RECRUITING';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;