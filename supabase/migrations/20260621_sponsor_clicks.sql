-- Tabla para registrar cada click en banners de sponsors
create table if not exists public.sponsor_clicks (
  id           uuid primary key default gen_random_uuid(),
  sponsor_id   text not null,
  sponsor_name text not null,
  user_id      uuid references public.perfiles(id) on delete set null,
  clicked_at   timestamptz not null default now()
);

-- Índices para consultas frecuentes (por sponsor y por fecha)
create index if not exists idx_sponsor_clicks_sponsor_id   on public.sponsor_clicks (sponsor_id);
create index if not exists idx_sponsor_clicks_clicked_at   on public.sponsor_clicks (clicked_at desc);

-- Grants de tabla: anon puede insertar, authenticated puede leer
grant insert on public.sponsor_clicks to anon, authenticated;
grant select on public.sponsor_clicks to authenticated;

-- RLS
alter table public.sponsor_clicks enable row level security;

-- Cualquier visitante (anon o autenticado) puede registrar un click
create policy "sponsor_clicks_insert_all"
  on public.sponsor_clicks
  for insert
  to anon, authenticated
  with check (true);

-- Solo admin puede leer (datos de facturación, no para usuarios comunes)
create policy "sponsor_clicks_select_admin"
  on public.sponsor_clicks
  for select
  to authenticated
  using (public.is_admin());
