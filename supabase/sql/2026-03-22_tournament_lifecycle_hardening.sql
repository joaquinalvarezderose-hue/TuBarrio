-- Endurece la capa de datos para el ciclo de vida de torneos.
-- Ejecutar en Supabase SQL Editor.

-- 1) Evita duplicar inscripciones del mismo usuario en un mismo torneo.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tournament_participants'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'tournament_participants_tournament_user_key'
  ) then
    alter table public.tournament_participants
      add constraint tournament_participants_tournament_user_key
      unique (tournament_id, user_id);
  end if;
end $$;

-- 2) Reglas de cupo en torneos.
alter table if exists public.tournaments
  alter column current_participants set default 0;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tournaments'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'tournaments_participants_non_negative_chk'
  ) then
    alter table public.tournaments
      add constraint tournaments_participants_non_negative_chk
      check (current_participants >= 0 and max_participants > 0);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tournaments'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'tournaments_participants_capacity_chk'
  ) then
    alter table public.tournaments
      add constraint tournaments_participants_capacity_chk
      check (current_participants <= max_participants);
  end if;
end $$;

-- 3) Reglas base de tabla matches.
alter table if exists public.matches
  alter column round set default 1;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'matches'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'matches_round_positive_chk'
  ) then
    alter table public.matches
      add constraint matches_round_positive_chk
      check (round >= 1);
  end if;
end $$;

-- Si la columna status existe como texto, dejamos default de negocio.
-- Si es enum y no contiene 'SCHEDULED', ajustar al valor permitido.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matches'
      and column_name = 'status'
      and data_type in ('text', 'character varying')
  ) then
    execute 'alter table public.matches alter column status set default ''SCHEDULED''';
  end if;
exception when others then
  raise notice 'No se pudo aplicar default en matches.status: %', sqlerrm;
end $$;

-- 4) Índices recomendados.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tournament_participants'
  ) then
    create index if not exists idx_tournament_participants_tournament_id
      on public.tournament_participants (tournament_id);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'matches'
  ) then
    create index if not exists idx_matches_tournament_round
      on public.matches (tournament_id, round);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'matches'
  ) then
    create index if not exists idx_matches_players
      on public.matches (player1_id, player2_id);
  end if;
end $$;
