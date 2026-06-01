alter table public.torneo_propuestas_partido
  add column if not exists categoria text not null default '';
