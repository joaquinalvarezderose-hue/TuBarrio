-- Quita el FK de user_id para evitar fallas silenciosas cuando el usuario
-- existe en auth.users pero no tiene perfil en public.perfiles todavía.
alter table public.sponsor_clicks
  drop constraint if exists sponsor_clicks_user_id_fkey;
