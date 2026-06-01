alter table public.torneo_propuestas_partido
  add column if not exists grupo text;
