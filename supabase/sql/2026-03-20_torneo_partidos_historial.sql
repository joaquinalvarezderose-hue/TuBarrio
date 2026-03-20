-- Ejecutar este script en Supabase SQL Editor.
-- Objetivo: historial de partidos + base consistente para estadisticas del torneo.

create extension if not exists pgcrypto;

-- 1) Asegurar columnas base en torneo_jugadores.
alter table if exists public.torneo_jugadores
  add column if not exists puntos integer;

alter table if exists public.torneo_jugadores
  add column if not exists partidos_jugados integer;

alter table if exists public.torneo_jugadores
  add column if not exists sets_ganados integer;

update public.torneo_jugadores
set
  puntos = coalesce(puntos, 0),
  partidos_jugados = coalesce(partidos_jugados, 0),
  sets_ganados = coalesce(sets_ganados, 0)
where puntos is null
   or partidos_jugados is null
   or sets_ganados is null;

alter table if exists public.torneo_jugadores
  alter column puntos set default 0,
  alter column partidos_jugados set default 0,
  alter column sets_ganados set default 0,
  alter column puntos set not null,
  alter column partidos_jugados set not null,
  alter column sets_ganados set not null;

create index if not exists idx_torneo_jugadores_lookup
  on public.torneo_jugadores (categoria, grupo, perfil_id);

-- 2) Historial de partidos para trazabilidad y prevencion de doble carga.
create table if not exists public.torneo_partidos_historial (
  id uuid primary key default gen_random_uuid(),
  torneo_id integer not null,
  torneo_titulo text,
  categoria text not null,
  grupo text not null,
  jugador1_perfil_id uuid,
  jugador2_perfil_id uuid,
  ganador_perfil_id uuid,
  sets_json jsonb not null,
  sets_jugador1 integer not null default 0,
  sets_jugador2 integer not null default 0,
  puntos_jugador1 integer not null default 0,
  puntos_jugador2 integer not null default 0,
  external_match_key text not null,
  cargado_por_perfil_id uuid,
  cargado_en timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists uq_torneo_partidos_external_match_key
  on public.torneo_partidos_historial (external_match_key);

create index if not exists idx_torneo_partidos_lookup
  on public.torneo_partidos_historial (torneo_id, categoria, grupo, cargado_en desc);

-- 3) Realtime (si usas Supabase Realtime para auto-refresh en frontend).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'torneo_jugadores'
  ) then
    alter publication supabase_realtime add table public.torneo_jugadores;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'torneo_partidos_historial'
  ) then
    alter publication supabase_realtime add table public.torneo_partidos_historial;
  end if;
end
$$;
