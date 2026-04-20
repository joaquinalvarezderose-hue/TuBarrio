-- Agregar límite total de participantes al torneo
-- Fecha: 2026-04-20

alter table public.torneo_configuracion
add column if not exists max_participantes_total integer check (max_participantes_total >= 2);

-- Actualizar registros existentes con null (sin límite)
update public.torneo_configuracion
set max_participantes_total = null
where max_participantes_total is null;