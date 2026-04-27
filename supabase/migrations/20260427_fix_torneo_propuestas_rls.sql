-- Fix RLS for torneo_propuestas_partido
-- Allow all authenticated users to read proposals (both players need to see them)
-- Allow participants to create/update proposals for their matches

-- 1. Enable RLS (if not already enabled)
alter table if exists public.torneo_propuestas_partido enable row level security;

-- 2. Drop existing policies if any
drop policy if exists "torneo_propuestas_select_todos" on public.torneo_propuestas_partido;
drop policy if exists "torneo_propuestas_insert_participante" on public.torneo_propuestas_partido;
drop policy if exists "torneo_propuestas_update_participante" on public.torneo_propuestas_partido;

-- 3. Allow anyone to SELECT proposals (both players need to see the proposal to confirm)
create policy "torneo_propuestas_select_todos"
  on public.torneo_propuestas_partido
  for select
  to authenticated, anon
  using (true);

-- 4. Allow participants of the match to INSERT proposals
-- We check if the user is one of the players in the match
create policy "torneo_propuestas_insert_participante"
  on public.torneo_propuestas_partido
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.partidos p
      where p.id = torneo_propuestas_partido.partido_id
        and (p.jugador1_id = auth.uid() or p.jugador2_id = auth.uid())
    )
  );

-- 5. Allow participants to UPDATE their match proposals
create policy "torneo_propuestas_update_participante"
  on public.torneo_propuestas_partido
  for update
  to authenticated
  using (
    exists (
      select 1 from public.partidos p
      where p.id = torneo_propuestas_partido.partido_id
        and (p.jugador1_id = auth.uid() or p.jugador2_id = auth.uid())
    )
  );

-- Alternative: If you want to disable RLS entirely for this table (simpler but less secure)
-- alter table if exists public.torneo_propuestas_partido disable row level security;
