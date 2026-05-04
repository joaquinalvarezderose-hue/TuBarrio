-- ============================================================
-- Trigger: crear perfil automáticamente al registrarse un usuario
-- Se dispara en auth.users (schema auth) con SECURITY DEFINER
-- para bypassear RLS y crear la fila aunque la sesión no esté confirmada.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (
    id,
    email,
    nombre_completo,
    whatsapp,
    rol
  )
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'nombre_completo',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'whatsapp',
    'jugador'
  )
  on conflict (id) do update
    set
      email           = excluded.email,
      nombre_completo = coalesce(excluded.nombre_completo, public.perfiles.nombre_completo),
      whatsapp        = coalesce(excluded.whatsapp, public.perfiles.whatsapp);

  return new;
exception
  when others then
    -- Nunca abortar el signup por un fallo en la creación del perfil
    raise warning 'handle_new_user: no se pudo crear perfil para %. Error: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
