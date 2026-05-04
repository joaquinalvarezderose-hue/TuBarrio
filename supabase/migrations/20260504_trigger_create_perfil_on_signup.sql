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
    nombre_completo,
    whatsapp,
    rol
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'nombre_completo',
      split_part(coalesce(new.email, new.raw_user_meta_data->>'email', 'usuario'), '@', 1)
    ),
    new.raw_user_meta_data->>'whatsapp',
    'jugador'
  )
  on conflict (id) do update
    set
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

-- Permitir email nulo temporalmente (el frontend lo completa en el insert posterior)
alter table public.perfiles alter column email drop not null;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
