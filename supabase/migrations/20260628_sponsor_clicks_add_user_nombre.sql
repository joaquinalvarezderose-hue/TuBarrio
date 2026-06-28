-- Agrega columna user_nombre para registrar el nombre sin hacer JOIN a perfiles
alter table public.sponsor_clicks
  add column if not exists user_nombre text;
