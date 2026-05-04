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
  categoria text,
  grupo text,
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
drop policy if exists "inscripciones_insert_own" on public.inscripciones_torneo;
create policy "inscripciones_insert_own"
on public.inscripciones_torneo
for insert
to authenticated
with check (perfil_id = auth.uid());

-- Usuarios autenticados: leer solo sus propias inscripciones
drop policy if exists "inscripciones_select_own" on public.inscripciones_torneo;
create policy "inscripciones_select_own"
on public.inscripciones_torneo
for select
to authenticated
using (perfil_id = auth.uid() or public.is_admin());

-- Usuarios autenticados: actualizar solo sus inscripciones pendientes
drop policy if exists "inscripciones_update_own_pending" on public.inscripciones_torneo;
create policy "inscripciones_update_own_pending"
on public.inscripciones_torneo
for update
to authenticated
using (perfil_id = auth.uid() and estado = 'pendiente_revision')
with check (
  perfil_id = auth.uid()
  and estado = 'pendiente_revision'
);

-- Admin: aprobar o rechazar pagos-- Admin: actualizar inscripciones
drop policy if exists "inscripciones_admin_update" on public.inscripciones_torneo;
create policy "inscripciones_admin_update"
on public.inscripciones_torneo
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Admin: opcional, permitir-- Admin: eliminar inscripciones
drop policy if exists "inscripciones_admin_delete" on public.inscripciones_torneo;
create policy "inscripciones_admin_delete"
on public.inscripciones_torneo
for delete
to authenticated
using (public.is_admin());

-- Paso 3: Trigger para activar automaticamente la inscripcion deportiva
create or replace function public.procesar_inscripcion_aprobada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria text;
  v_grupo text;
begin
  if new.estado <> 'pagado_aprobado' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.estado = 'pagado_aprobado' then
    return new;
  end if;

  v_categoria := coalesce(new.categoria, 'General');
  v_grupo := coalesce(new.grupo, 'A Confirmar');

  insert into public.torneo_jugadores (
    perfil_id,
    categoria,
    grupo,
    puntos,
    partidos_jugados,
    sets_ganados,
    torneo_id
  )
  values (
    new.perfil_id,
    v_categoria,
    v_grupo,
    0,
    0,
    0,
    new.torneo_id
  )
  on conflict do nothing;

  update public.torneo_estado
  set current_participantes = (
    select count(*)
    from public.torneo_jugadores tj
    where tj.torneo_id = new.torneo_id
  ),
  updated_at = now()
  where torneo_id = new.torneo_id;

  if new.aprobado_en is null then
    new.aprobado_en := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_procesar_inscripcion_aprobada on public.inscripciones_torneo;
create trigger trg_procesar_inscripcion_aprobada
before insert or update on public.inscripciones_torneo
for each row
when (new.estado = 'pagado_aprobado')
execute function public.procesar_inscripcion_aprobada();
