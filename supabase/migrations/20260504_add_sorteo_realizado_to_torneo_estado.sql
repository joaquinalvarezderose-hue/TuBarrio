-- Agrega la columna sorteo_realizado a torneo_estado si no existe.
-- Esta columna es requerida por registrar_participante_y_sortear_si_lleno
-- y otras funciones de sorteo/fixture.

alter table public.torneo_estado
  add column if not exists sorteo_realizado boolean not null default false;
