create table if not exists public.servicio_clicks (
  id              uuid primary key default gen_random_uuid(),
  servicio_id     uuid not null references public.marketplace_servicios(id) on delete cascade,
  servicio_titulo text not null,
  user_id         uuid references public.perfiles(id) on delete set null,
  user_nombre     text,
  tipo_evento     text not null check (tipo_evento in ('profile_view', 'whatsapp_click')),
  clicked_at      timestamptz not null default now()
);

create index idx_servicio_clicks_servicio_id on public.servicio_clicks(servicio_id);
create index idx_servicio_clicks_clicked_at  on public.servicio_clicks(clicked_at desc);
create index idx_servicio_clicks_tipo        on public.servicio_clicks(tipo_evento);

alter table public.servicio_clicks enable row level security;

create policy "insert_servicio_click" on public.servicio_clicks
  for insert to anon, authenticated with check (true);

create policy "admin_select_servicio_clicks" on public.servicio_clicks
  for select to authenticated using (public.is_admin());

grant insert on public.servicio_clicks to anon, authenticated;
grant select on public.servicio_clicks to authenticated;
