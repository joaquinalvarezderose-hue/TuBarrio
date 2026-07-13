-- Agrega columna user_nombre para ver el nombre del usuario sin hacer JOIN a perfiles
alter table public.pwa_installs
  add column if not exists user_nombre text;
