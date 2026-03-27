-- Normaliza estados legacy para usar solo EN_CURSO en torneo_estado.
-- Ejecutar una vez en entornos existentes.

update public.torneo_estado
set estado = 'EN_CURSO',
    updated_at = now()
where estado = 'IN_PROGRESS';

alter table public.torneo_estado
  drop constraint if exists torneo_estado_estado_check;

alter table public.torneo_estado
  add constraint torneo_estado_estado_check
  check (estado in (
    'RECRUITING',
    'INSCRIPCION_ABIERTA',
    'INSCRIPCION_CERRADA',
    'ARMADO_FIXTURE',
    'ACTIVO',
    'EN_CURSO',
    'PLAYOFFS',
    'FINALIZADO',
    'LOCKED'
  ));
