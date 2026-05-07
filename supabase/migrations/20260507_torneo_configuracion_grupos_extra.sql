-- Add extra group-splitting configuration to torneo_configuracion.
-- Fecha: 2026-05-07

alter table public.torneo_configuracion
  add column if not exists numero_grupos integer check (numero_grupos >= 1),
  add column if not exists max_participantes_por_grupo integer check (max_participantes_por_grupo >= 2);

comment on column public.torneo_configuracion.numero_grupos is
  'Opcional: si se setea, divide las inscripciones en este número fijo de grupos.';

comment on column public.torneo_configuracion.max_participantes_por_grupo is
  'Opcional: capacidad máxima por grupo para la división automática de jugadores.';
