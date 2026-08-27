-- ============================================================
-- Guarda contra archivado prematuro de torneos (torneos.activo).
--
-- Incidente 2026-08-25: el torneo 8 quedo con activo=false mientras
-- los playoffs recien se generaban (ningun partido de la llave jugado
-- todavia). Eso hizo que Tournaments.tsx tratara el torneo como
-- finalizado para TODOS sus inscriptos ("Gran participacion" / 0
-- Activos), bloqueando el acceso al panel. La causa fue una edicion
-- manual en el Table Editor de Supabase (tras un intento de DELETE
-- fallido por FK con inscripciones_torneo), no un bug de la app --
-- pero el flag activo tampoco tenia ninguna proteccion a nivel de
-- base de datos contra este tipo de error, sin importar de donde
-- venga el UPDATE (app, RPC, dashboard, SQL directo).
--
-- Esta funcion bloquea la transicion activo:true -> false salvo que:
--   1) el torneo se esta cancelando explicitamente (cancelado=true), o
--   2) ya tiene un campeon declarado en playoffs (torneo_estado
--      con grupo like '%_PLAYOFFS' y estado='FINALIZADO'), o
--   3) no tiene playoffs configurados pero todos sus grupos de fase
--      regular ya finalizaron, o
--   4) el torneo nunca llego a arrancar (sin filas en torneo_estado
--      ni en partidos) -- no hay nada que proteger.
-- En cualquier otro caso, exige usar "Cancelar torneo" en lugar de
-- "Archivar".
-- ============================================================

create or replace function public.guard_torneo_activo_desactivacion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.activo = false and OLD.activo = true then

    if COALESCE(NEW.cancelado, false) = true then
      return NEW;
    end if;

    if exists (
      select 1 from public.torneo_estado te
      where te.torneo_id = NEW.id
        and te.grupo like '%_PLAYOFFS'
        and te.estado = 'FINALIZADO'
    ) then
      return NEW;
    end if;

    if not exists (
      select 1 from public.torneo_estado te
      where te.torneo_id = NEW.id and te.grupo like '%_PLAYOFFS'
    )
    and exists (
      select 1 from public.torneo_estado te where te.torneo_id = NEW.id
    )
    and not exists (
      select 1 from public.torneo_estado te
      where te.torneo_id = NEW.id and te.estado <> 'FINALIZADO'
    ) then
      return NEW;
    end if;

    if not exists (select 1 from public.torneo_estado te where te.torneo_id = NEW.id)
       and not exists (select 1 from public.partidos p where p.torneo_id = NEW.id) then
      return NEW;
    end if;

    raise exception 'No se puede archivar un torneo con partidos en curso o playoffs sin definir. Si queres darlo de baja igual, marcalo como "Cancelar torneo".'
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_guard_torneo_activo_desactivacion on public.torneos;
create trigger trg_guard_torneo_activo_desactivacion
before update of activo on public.torneos
for each row
execute function public.guard_torneo_activo_desactivacion();

comment on function public.guard_torneo_activo_desactivacion() is
'Bloquea archivar (activo=false) un torneo que todavia tiene competencia en curso (grupos sin finalizar o playoffs sin campeon declarado), sin importar si el UPDATE viene de la app, un RPC o el dashboard de Supabase. Ver incidente torneo 8, 2026-08-25.';
