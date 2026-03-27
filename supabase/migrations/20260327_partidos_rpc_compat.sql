-- Compatibilidad minima de public.partidos para el RPC de sorteo automatico.

create extension if not exists pgcrypto;

alter table if exists public.partidos
  add column if not exists id uuid,
  add column if not exists torneo_id bigint,
  add column if not exists categoria text,
  add column if not exists grupo text,
  add column if not exists jornada integer,
  add column if not exists jugador1_id uuid,
  add column if not exists jugador2_id uuid,
  add column if not exists fecha_programada timestamptz,
  add column if not exists resultado text,
  add column if not exists estado text,
  add column if not exists ganador_id uuid;

update public.partidos
set id = gen_random_uuid()
where id is null;

update public.partidos
set jornada = coalesce(jornada, 1)
where jornada is null;

update public.partidos
set estado = coalesce(estado, 'programado')
where estado is null;

update public.partidos
set resultado = coalesce(resultado, 'PENDIENTE')
where resultado is null;

alter table if exists public.partidos
  alter column id set not null,
  alter column jornada set default 1,
  alter column jornada set not null,
  alter column estado set default 'programado',
  alter column resultado set default 'PENDIENTE';

create unique index if not exists uq_partidos_id on public.partidos (id);
create index if not exists idx_partidos_torneo_scope on public.partidos (torneo_id, categoria, grupo, jornada, estado);
create index if not exists idx_partidos_torneo_jugadores on public.partidos (torneo_id, categoria, grupo, jugador1_id, jugador2_id);

create unique index if not exists uq_partidos_programados_scope_pair
  on public.partidos (
    torneo_id,
    categoria,
    grupo,
    jornada,
    least(jugador1_id, jugador2_id),
    greatest(jugador1_id, jugador2_id)
  )
  where estado = 'programado'
    and jugador1_id is not null
    and jugador2_id is not null;
