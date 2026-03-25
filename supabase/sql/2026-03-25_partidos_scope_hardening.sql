-- Endurece public.partidos y public.torneo_jugadores para que cada dato quede
-- asociado al torneo real.
-- Ejecutar antes de volver a crear la RPC.

alter table if exists public.torneo_jugadores
  add column if not exists torneo_id bigint;

update public.torneo_jugadores
set torneo_id = substring(grupo from 'TORNEO_([0-9]+)')::bigint
where torneo_id is null
  and grupo ~ 'TORNEO_[0-9]+';

create index if not exists idx_torneo_jugadores_scope
  on public.torneo_jugadores (torneo_id, categoria, grupo, perfil_id);

alter table if exists public.partidos
  add column if not exists torneo_id bigint,
  add column if not exists categoria text,
  add column if not exists grupo text,
  add column if not exists jornada integer;

update public.partidos
set jornada = coalesce(jornada, 1)
where jornada is null;

alter table if exists public.partidos
  alter column jornada set default 1,
  alter column jornada set not null;

create index if not exists idx_partidos_torneo_scope
  on public.partidos (torneo_id, categoria, grupo, jornada, estado);

create index if not exists idx_partidos_torneo_jugadores
  on public.partidos (torneo_id, categoria, grupo, jugador1_id, jugador2_id);

create unique index if not exists uq_partidos_programados_scope_pair
  on public.partidos (
    torneo_id,
    categoria,
    grupo,
    jornada,
    least(jugador1_id, jugador2_id),
    greatest(jugador1_id, jugador2_id)
  )
  where estado = 'programado';