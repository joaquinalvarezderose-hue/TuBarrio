-- Ejecutar este script en Supabase SQL Editor.
-- Objetivo: tabla de propuestas de resultado para que ambos jugadores confirmen
--           antes de que los puntos se registren oficialmente.

-- 1) Tabla de propuestas.
--    Cuando un jugador carga el resultado queda en estado 'pendiente'.
--    Cuando el rival carga exactamente los mismos sets, pasa a 'confirmado'
--    y se disparan los updates en torneo_jugadores + historial.

create table if not exists public.torneo_propuestas_partido (
  id              uuid primary key default gen_random_uuid(),
  torneo_id       integer not null,
  categoria       text not null,
  grupo           text not null,
  jugador1_perfil_id uuid not null,
  jugador2_perfil_id uuid not null,
  -- Qué marcador propuso cada jugador (null si todavía no cargó)
  sets_json_j1    jsonb,
  sets_json_j2    jsonb,
  -- Estado: pendiente | confirmado | discrepancia
  estado          text not null default 'pendiente'
                    check (estado in ('pendiente', 'confirmado', 'discrepancia')),
  -- Clave que identifica el par de jugadores en ese torneo/grupo/categoría
  -- (sin importar el marcador), para evitar propuestas duplicadas abiertas.
  match_pair_key  text not null,
  confirmado_en   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Solo puede existir UNA propuesta abierta por par de jugadores en el mismo torneo.
create unique index if not exists uq_propuesta_pair_key
  on public.torneo_propuestas_partido (match_pair_key)
  where estado = 'pendiente';

create index if not exists idx_propuestas_jugadores
  on public.torneo_propuestas_partido (jugador1_perfil_id, jugador2_perfil_id, torneo_id);

-- 2) Habilitar Realtime en la tabla de propuestas.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'torneo_propuestas_partido'
  ) then
    alter publication supabase_realtime add table public.torneo_propuestas_partido;
  end if;
end
$$;
