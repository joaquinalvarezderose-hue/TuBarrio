-- Corrige el flujo de aprobacion manual para que use el RPC transaccional
-- de registro y ciclo de vida del torneo.
--
-- Problema que resuelve:
-- - El trigger anterior insertaba en torneo_jugadores y solo recalculaba current_participantes.
-- - No disparaba la logica de LOCKED/IN_PROGRESS ni el armado de fixture del RPC.
-- - Resultado: cupo lleno pero torneo seguia en RECRUITING.

create or replace function public.procesar_inscripcion_aprobada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria text;
  v_grupo text;
  v_max_participantes integer := 8;
  v_current integer := 0;
  v_needs_fallback boolean := false;
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

  v_grupo := nullif(trim(coalesce(new.grupo, '')), '');
  if v_grupo is null then
    v_grupo := format('TORNEO_%s', new.torneo_id);
  end if;

  select te.max_participantes
    into v_max_participantes
  from public.torneo_estado te
  where te.torneo_id = new.torneo_id
    and te.categoria = v_categoria
    and te.grupo = v_grupo
  order by te.updated_at desc
  limit 1;

  v_max_participantes := greatest(2, coalesce(v_max_participantes, 8));

  -- Persistimos el scope resuelto para mantener consistencia historica.
  new.categoria := v_categoria;
  new.grupo := v_grupo;

  begin
    perform 1
    from public.registrar_participante_y_sortear_si_lleno(
      new.torneo_id,
      new.perfil_id,
      v_categoria,
      v_grupo,
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
      -- Fallback defensivo si el RPC aun no existe o no puede crear cruces por esquema legacy.
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
        v_grupo,
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
        v_grupo,
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
        and tj.grupo = v_grupo;

      update public.torneo_estado te
      set current_participantes = v_current,
          estado = case
            when te.estado = 'RECRUITING' and v_current >= te.max_participantes then 'LOCKED'
            else te.estado
          end,
          updated_at = now()
      where te.torneo_id = new.torneo_id
        and te.categoria = v_categoria
        and te.grupo = v_grupo;
  end if;

  return new;
end;
$$;

-- Reconciliacion final: sincroniza estado/cupo por inscripciones aprobadas.
-- Evita quedar en RECRUITING cuando ya no hay nuevos updates que disparen trigger.
with approved as (
  select
    i.torneo_id,
    coalesce(nullif(trim(i.categoria), ''), t.subtitulo, 'General') as categoria,
    coalesce(nullif(trim(i.grupo), ''), format('TORNEO_%s', i.torneo_id)) as grupo,
    count(distinct i.perfil_id)::integer as approved_count
  from public.inscripciones_torneo i
  left join public.torneos t on t.id = i.torneo_id
  where i.estado = 'pagado_aprobado'
  group by i.torneo_id,
           coalesce(nullif(trim(i.categoria), ''), t.subtitulo, 'General'),
           coalesce(nullif(trim(i.grupo), ''), format('TORNEO_%s', i.torneo_id))
)
update public.torneo_estado te
set current_participantes = a.approved_count,
    estado = case
      when a.approved_count >= te.max_participantes and te.estado = 'RECRUITING' then 'LOCKED'
      else te.estado
    end,
    updated_at = now()
from approved a
where te.torneo_id = a.torneo_id
  and te.categoria = a.categoria
  and te.grupo = a.grupo;

drop trigger if exists trg_procesar_inscripcion_aprobada on public.inscripciones_torneo;
create trigger trg_procesar_inscripcion_aprobada
before insert or update on public.inscripciones_torneo
for each row
when (new.estado = 'pagado_aprobado')
execute function public.procesar_inscripcion_aprobada();

-- Backfill idempotente para casos ya aprobados antes de este fix.
do $$
declare
  r record;
  v_categoria text;
  v_grupo text;
  v_max_participantes integer;
  v_current integer;
begin
  for r in
    select i.torneo_id, i.perfil_id, i.categoria, i.grupo
    from public.inscripciones_torneo i
    where i.estado = 'pagado_aprobado'
  loop
    v_categoria := nullif(trim(coalesce(r.categoria, '')), '');
    if v_categoria is null then
      select t.subtitulo
        into v_categoria
      from public.torneos t
      where t.id = r.torneo_id
      limit 1;
    end if;
    v_categoria := coalesce(v_categoria, 'General');

    v_grupo := nullif(trim(coalesce(r.grupo, '')), '');
    if v_grupo is null then
      v_grupo := format('TORNEO_%s', r.torneo_id);
    end if;

    select te.max_participantes
      into v_max_participantes
    from public.torneo_estado te
    where te.torneo_id = r.torneo_id
      and te.categoria = v_categoria
      and te.grupo = v_grupo
    order by te.updated_at desc
    limit 1;

    v_max_participantes := greatest(2, coalesce(v_max_participantes, 8));

    -- Limpieza defensiva: elimina duplicados exactos por mismo jugador/scope.
    with ranked as (
      select
        tj.id,
        row_number() over (
          partition by tj.torneo_id, tj.perfil_id, tj.categoria, tj.grupo
          order by tj.id
        ) as rn
      from public.torneo_jugadores tj
      where tj.torneo_id = r.torneo_id
        and tj.categoria = v_categoria
        and tj.grupo = v_grupo
    )
    delete from public.torneo_jugadores tj
    using ranked
    where tj.id = ranked.id
      and ranked.rn > 1;

    begin
      perform 1
      from public.registrar_participante_y_sortear_si_lleno(
        r.torneo_id,
        r.perfil_id,
        v_categoria,
        v_grupo,
        v_max_participantes
      );
    exception
      when undefined_function then
        insert into public.torneo_estado (
          torneo_id,
          categoria,
          grupo,
          estado,
          max_participantes,
          current_participantes
        )
        values (
          r.torneo_id,
          v_categoria,
          v_grupo,
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
          r.perfil_id,
          v_categoria,
          v_grupo,
          0,
          0,
          0,
          r.torneo_id
        )
        on conflict do nothing;

        select count(distinct tj.perfil_id)::integer
          into v_max_participantes
        from public.torneo_jugadores tj
        where tj.torneo_id = r.torneo_id
          and tj.categoria = v_categoria
          and tj.grupo = v_grupo;

        update public.torneo_estado te
        set current_participantes = v_max_participantes,
            estado = case
              when te.estado = 'RECRUITING' and v_max_participantes >= te.max_participantes then 'LOCKED'
              else te.estado
            end,
            updated_at = now()
        where te.torneo_id = r.torneo_id
          and te.categoria = v_categoria
          and te.grupo = v_grupo;
      when others then
        if sqlerrm ilike '%La tabla public.partidos no tiene las columnas esperadas%' then
          insert into public.torneo_estado (
            torneo_id,
            categoria,
            grupo,
            estado,
            max_participantes,
            current_participantes
          )
          values (
            r.torneo_id,
            v_categoria,
            v_grupo,
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
            r.perfil_id,
            v_categoria,
            v_grupo,
            0,
            0,
            0,
            r.torneo_id
          )
          on conflict do nothing;

          select count(distinct tj.perfil_id)::integer
            into v_max_participantes
          from public.torneo_jugadores tj
          where tj.torneo_id = r.torneo_id
            and tj.categoria = v_categoria
            and tj.grupo = v_grupo;

          update public.torneo_estado te
          set current_participantes = v_max_participantes,
              estado = case
                when te.estado = 'RECRUITING' and v_max_participantes >= te.max_participantes then 'LOCKED'
                else te.estado
              end,
              updated_at = now()
          where te.torneo_id = r.torneo_id
            and te.categoria = v_categoria
            and te.grupo = v_grupo;
        elsif sqlerrm ilike '%supero el cupo configurado%' then
          select count(distinct tj.perfil_id)::integer
            into v_current
          from public.torneo_jugadores tj
          where tj.torneo_id = r.torneo_id
            and tj.categoria = v_categoria
            and tj.grupo = v_grupo;

          update public.torneo_estado te
          set current_participantes = v_current,
              estado = case
                when v_current >= te.max_participantes then 'LOCKED'
                else te.estado
              end,
              updated_at = now()
          where te.torneo_id = r.torneo_id
            and te.categoria = v_categoria
            and te.grupo = v_grupo;
        else
          raise;
        end if;
    end;

    update public.inscripciones_torneo i
    set categoria = v_categoria,
        grupo = v_grupo,
        aprobado_en = coalesce(i.aprobado_en, now())
    where i.torneo_id = r.torneo_id
      and i.perfil_id = r.perfil_id
      and i.estado = 'pagado_aprobado';
  end loop;
end;
$$;
