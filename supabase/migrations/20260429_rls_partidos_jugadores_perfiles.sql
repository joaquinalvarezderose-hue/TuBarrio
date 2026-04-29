-- ============================================================
-- RLS: partidos, torneo_jugadores, perfiles
--
-- Reglas:
--   partidos
--     SELECT  → sos jugador del partido  OR  participás en el torneo (para ver bracket completo)
--     INSERT  → solo admin  (el sistema/RPCs crean los partidos)
--     UPDATE  → solo admin  (resultados se cargan vía RPC confirmar_resultado_partido)
--     DELETE  → solo admin
--
--   torneo_jugadores
--     SELECT  → cualquier autenticado puede ver la tabla de posiciones del grupo
--     INSERT  → solo admin / SECURITY DEFINER RPCs (aprobar inscripción)
--     UPDATE  → solo admin
--     DELETE  → solo admin
--
--   perfiles
--     SELECT  → autenticado puede leer cualquier perfil (nombre, whatsapp visible para rivales)
--     INSERT  → solo el propio usuario puede crear su perfil
--     UPDATE  → solo el propio usuario puede editar su perfil  OR  admin
--     DELETE  → solo admin
-- ============================================================


-- ============================================================
-- 1. PARTIDOS
-- ============================================================
alter table public.partidos enable row level security;

-- SELECT: sos jugador del partido O participás en el torneo
drop policy if exists "partidos_select_participante"          on public.partidos;
drop policy if exists "partidos_select_all"                   on public.partidos;
drop policy if exists "partidos_select_torneos_participante"  on public.partidos;

create policy "partidos_select_torneos_participante"
  on public.partidos
  for select
  to authenticated
  using (
    -- Sos uno de los jugadores del partido
    (jugador1_id = auth.uid() OR jugador2_id = auth.uid())
    OR
    -- O estás inscripto en el torneo (necesario para ver el bracket completo)
    EXISTS (
      SELECT 1 FROM public.torneo_jugadores tj
      WHERE tj.torneo_id = partidos.torneo_id
        AND tj.perfil_id = auth.uid()
    )
  );

-- INSERT / UPDATE / DELETE → solo admin
drop policy if exists "partidos_insert_admin" on public.partidos;
create policy "partidos_insert_admin"
  on public.partidos
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "partidos_update_admin" on public.partidos;
create policy "partidos_update_admin"
  on public.partidos
  for update
  to authenticated
  using    (public.is_admin())
  with check (public.is_admin());

drop policy if exists "partidos_delete_admin" on public.partidos;
create policy "partidos_delete_admin"
  on public.partidos
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================
-- 2. TORNEO_JUGADORES
-- ============================================================
alter table public.torneo_jugadores enable row level security;

-- SELECT: cualquier autenticado puede leer (necesario para tabla de posiciones,
--         para el RPC de bracket, y para que el propio jugador vea su grupo)
drop policy if exists "torneo_jugadores_select_autenticado" on public.torneo_jugadores;
create policy "torneo_jugadores_select_autenticado"
  on public.torneo_jugadores
  for select
  to authenticated
  using (true);

-- INSERT / UPDATE / DELETE → solo admin
--   Los RPCs que crean/actualizan filas son SECURITY DEFINER y
--   corren como el rol del propietario de la función (bypassean RLS).
drop policy if exists "torneo_jugadores_insert_admin" on public.torneo_jugadores;
create policy "torneo_jugadores_insert_admin"
  on public.torneo_jugadores
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "torneo_jugadores_update_admin" on public.torneo_jugadores;
create policy "torneo_jugadores_update_admin"
  on public.torneo_jugadores
  for update
  to authenticated
  using    (public.is_admin())
  with check (public.is_admin());

drop policy if exists "torneo_jugadores_delete_admin" on public.torneo_jugadores;
create policy "torneo_jugadores_delete_admin"
  on public.torneo_jugadores
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================
-- 3. PERFILES
-- ============================================================
alter table public.perfiles enable row level security;

-- SELECT: cualquier autenticado puede leer perfiles
--   (nombre y whatsapp se necesitan para mostrar datos del rival)
drop policy if exists "perfiles_select_autenticado" on public.perfiles;
create policy "perfiles_select_autenticado"
  on public.perfiles
  for select
  to authenticated
  using (true);

-- INSERT: solo el propio usuario puede crear su perfil
drop policy if exists "perfiles_insert_own" on public.perfiles;
create policy "perfiles_insert_own"
  on public.perfiles
  for insert
  to authenticated
  with check (id = auth.uid());

-- UPDATE: el propio usuario edita su perfil, o admin edita cualquiera
drop policy if exists "perfiles_update_own_or_admin" on public.perfiles;
create policy "perfiles_update_own_or_admin"
  on public.perfiles
  for update
  to authenticated
  using    (id = auth.uid() OR public.is_admin())
  with check (id = auth.uid() OR public.is_admin());

-- DELETE: solo admin
drop policy if exists "perfiles_delete_admin" on public.perfiles;
create policy "perfiles_delete_admin"
  on public.perfiles
  for delete
  to authenticated
  using (public.is_admin());
