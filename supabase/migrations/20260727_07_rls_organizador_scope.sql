-- ============================================================
-- Extiende las policies RLS existentes de "solo admin" a
-- "admin O organizador-dueno de ese torneo especifico", usando el
-- helper unico public.puede_administrar_torneo(torneo_id).
--
-- Sin cambios: DELETE en torneos (sigue admin-only: un organizador
-- nunca borra un torneo, solo lo archiva via archivar_torneo) e
-- INSERT en torneos (sigue admin-only via RLS: la unica via para que
-- un organizador cree un torneo es el RPC SECURITY DEFINER
-- crear_torneo, que bypassea RLS corriendo como el owner de la
-- funcion -- asi se evita abrir un segundo camino de creacion sin las
-- validaciones de ese RPC).
-- ============================================================

-- ── torneos: UPDATE ──────────────────────────────────────────
DROP POLICY IF EXISTS "torneos_update_admin" ON public.torneos;
CREATE POLICY "torneos_update_admin"
  ON public.torneos FOR UPDATE
  USING (public.puede_administrar_torneo(id))
  WITH CHECK (public.puede_administrar_torneo(id));

-- ── torneo_configuracion (PK = torneo_id) ────────────────────
DROP POLICY IF EXISTS "torneo_configuracion_insert_admin" ON public.torneo_configuracion;
CREATE POLICY "torneo_configuracion_insert_admin"
  ON public.torneo_configuracion FOR INSERT
  WITH CHECK (public.puede_administrar_torneo(torneo_id));

DROP POLICY IF EXISTS "torneo_configuracion_update_admin" ON public.torneo_configuracion;
CREATE POLICY "torneo_configuracion_update_admin"
  ON public.torneo_configuracion FOR UPDATE
  USING (public.puede_administrar_torneo(torneo_id))
  WITH CHECK (public.puede_administrar_torneo(torneo_id));

-- ── torneo_estado ─────────────────────────────────────────────
DROP POLICY IF EXISTS "torneo_estado_admin_all" ON public.torneo_estado;
CREATE POLICY "torneo_estado_admin_all"
  ON public.torneo_estado
  FOR ALL
  TO authenticated
  USING (public.puede_administrar_torneo(torneo_id))
  WITH CHECK (public.puede_administrar_torneo(torneo_id));

-- ── torneo_grupos (nombres reales en prod: admin_insert/admin_update) ──
DROP POLICY IF EXISTS "torneo_grupos_admin_insert" ON public.torneo_grupos;
CREATE POLICY "torneo_grupos_admin_insert"
  ON public.torneo_grupos FOR INSERT
  WITH CHECK (public.puede_administrar_torneo(torneo_id));

DROP POLICY IF EXISTS "torneo_grupos_admin_update" ON public.torneo_grupos;
CREATE POLICY "torneo_grupos_admin_update"
  ON public.torneo_grupos FOR UPDATE
  USING (public.puede_administrar_torneo(torneo_id))
  WITH CHECK (public.puede_administrar_torneo(torneo_id));

-- ── torneo_jugadores ──────────────────────────────────────────
DROP POLICY IF EXISTS "torneo_jugadores_insert_admin" ON public.torneo_jugadores;
CREATE POLICY "torneo_jugadores_insert_admin"
  ON public.torneo_jugadores
  FOR INSERT
  TO authenticated
  WITH CHECK (public.puede_administrar_torneo(torneo_id));

DROP POLICY IF EXISTS "torneo_jugadores_update_admin" ON public.torneo_jugadores;
CREATE POLICY "torneo_jugadores_update_admin"
  ON public.torneo_jugadores
  FOR UPDATE
  TO authenticated
  USING    (public.puede_administrar_torneo(torneo_id))
  WITH CHECK (public.puede_administrar_torneo(torneo_id));

-- ── torneo_equipos ────────────────────────────────────────────
DROP POLICY IF EXISTS "torneo_equipos_insert_admin" ON public.torneo_equipos;
CREATE POLICY torneo_equipos_insert_admin ON public.torneo_equipos
  FOR INSERT
  WITH CHECK (public.puede_administrar_torneo(torneo_id));

DROP POLICY IF EXISTS "torneo_equipos_update_admin" ON public.torneo_equipos;
CREATE POLICY torneo_equipos_update_admin ON public.torneo_equipos
  FOR UPDATE
  USING (public.puede_administrar_torneo(torneo_id))
  WITH CHECK (public.puede_administrar_torneo(torneo_id));

-- ── partidos ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "partidos_insert_admin" ON public.partidos;
CREATE POLICY "partidos_insert_admin"
  ON public.partidos
  FOR INSERT
  TO authenticated
  WITH CHECK (public.puede_administrar_torneo(torneo_id));

DROP POLICY IF EXISTS "partidos_update_admin" ON public.partidos;
CREATE POLICY "partidos_update_admin"
  ON public.partidos
  FOR UPDATE
  TO authenticated
  USING    (public.puede_administrar_torneo(torneo_id))
  WITH CHECK (public.puede_administrar_torneo(torneo_id));

-- ── inscripciones_torneo (nombres reales en prod: inscripciones_select_own /
-- inscripciones_admin_update, verificados contra la base -- no los que
-- sugerian los archivos de migracion del repo) ──────────────────────
DROP POLICY IF EXISTS "inscripciones_select_own" ON public.inscripciones_torneo;
CREATE POLICY "inscripciones_select_own"
  ON public.inscripciones_torneo
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = perfil_id
    OR public.puede_administrar_torneo(torneo_id)
  );

DROP POLICY IF EXISTS "inscripciones_admin_update" ON public.inscripciones_torneo;
CREATE POLICY "inscripciones_admin_update"
  ON public.inscripciones_torneo
  FOR UPDATE
  TO authenticated
  USING (public.puede_administrar_torneo(torneo_id))
  WITH CHECK (public.puede_administrar_torneo(torneo_id));
