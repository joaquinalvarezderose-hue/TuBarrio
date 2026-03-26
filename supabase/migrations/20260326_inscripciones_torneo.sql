-- Paso 1: Tabla de inscripciones para flujo manual de transferencias
create table if not exists public.inscripciones_torneo (
  id uuid primary key default gen_random_uuid(),
  torneo_id bigint not null,
  perfil_id uuid not null,
  estado text not null default 'pendiente_revision'
    check (estado in ('pendiente_revision', 'pagado_aprobado', 'rechazado')),
  monto numeric(10,2) not null,
  moneda text not null default 'ARS',
  metodo_pago text not null default 'transferencia_alias',
  alias_destino text not null,
  whatsapp_destino text not null,
  referencia_manual text,
  comprobante_url text,
  aprobado_por uuid,
  aprobado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_inscripcion_torneo_perfil unique (torneo_id, perfil_id),
  constraint fk_inscripcion_perfil
    foreign key (perfil_id) references public.perfiles(id) on delete cascade,
  constraint fk_inscripcion_aprobado_por
    foreign key (aprobado_por) references public.perfiles(id) on delete set null
);

create index if not exists idx_inscripciones_perfil on public.inscripciones_torneo(perfil_id);
create index if not exists idx_inscripciones_estado on public.inscripciones_torneo(estado);
create index if not exists idx_inscripciones_torneo on public.inscripciones_torneo(torneo_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_inscripciones_updated_at on public.inscripciones_torneo;
create trigger trg_inscripciones_updated_at
before update on public.inscripciones_torneo
for each row
execute function public.set_updated_at();

-- Paso 2: RLS para flujo usuario/admin
alter table public.inscripciones_torneo enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = auth.uid()
      and coalesce(p.rol, '') in ('admin', 'organizador')
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Usuarios autenticados: crear su propia inscripción
create policy if not exists "inscripciones_insert_own"
on public.inscripciones_torneo
for insert
to authenticated
with check (perfil_id = auth.uid());

-- Usuarios autenticados: leer solo sus propias inscripciones
create policy if not exists "inscripciones_select_own"
on public.inscripciones_torneo
for select
to authenticated
using (perfil_id = auth.uid() or public.is_admin());

-- Usuarios autenticados: permitir solo ajustes menores mientras siga pendiente
create policy if not exists "inscripciones_update_own_pending"
on public.inscripciones_torneo
for update
to authenticated
using (perfil_id = auth.uid() and estado = 'pendiente_revision')
with check (
  perfil_id = auth.uid()
  and estado = 'pendiente_revision'
);

-- Admin: aprobar o rechazar pagos manualmente
create policy if not exists "inscripciones_admin_update"
on public.inscripciones_torneo
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Admin: opcional, permitir borrar registros inválidos
create policy if not exists "inscripciones_admin_delete"
on public.inscripciones_torneo
for delete
to authenticated
using (public.is_admin());
