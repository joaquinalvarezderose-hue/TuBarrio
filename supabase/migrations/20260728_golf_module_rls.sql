-- ============================================================
-- Modulo de Torneos de Golf - RLS
--
-- Mismo patron ya usado para tenis (20260429_rls_partidos_jugadores_perfiles.sql,
-- 20260727_07_rls_organizador_scope.sql): lectura abierta a
-- authenticated, escritura de catalogos/config gateada por
-- is_admin() / puede_administrar_torneo() (funciones existentes,
-- no se tocan), y escritura de datos "oficiales" de scorecard
-- solo a traves de RPC SECURITY DEFINER (no hay policy de
-- INSERT/UPDATE directa para jugadores sobre rondas_golf/scorecard).
-- ============================================================

ALTER TABLE public.canchas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hoyos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.torneo_golf_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rondas_golf ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scorecard ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- canchas / hoyos: catalogo compartido, lectura abierta,
-- escritura solo admin.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "canchas_select_autenticado" ON public.canchas;
CREATE POLICY "canchas_select_autenticado" ON public.canchas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "canchas_insert_admin" ON public.canchas;
CREATE POLICY "canchas_insert_admin" ON public.canchas
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "canchas_update_admin" ON public.canchas;
CREATE POLICY "canchas_update_admin" ON public.canchas
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "canchas_delete_admin" ON public.canchas;
CREATE POLICY "canchas_delete_admin" ON public.canchas
  FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "hoyos_select_autenticado" ON public.hoyos;
CREATE POLICY "hoyos_select_autenticado" ON public.hoyos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "hoyos_insert_admin" ON public.hoyos;
CREATE POLICY "hoyos_insert_admin" ON public.hoyos
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "hoyos_update_admin" ON public.hoyos;
CREATE POLICY "hoyos_update_admin" ON public.hoyos
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "hoyos_delete_admin" ON public.hoyos;
CREATE POLICY "hoyos_delete_admin" ON public.hoyos
  FOR DELETE TO authenticated USING (public.is_admin());

-- ------------------------------------------------------------
-- torneo_golf_config: lectura abierta, escritura del organizador
-- dueno del torneo (o admin), via puede_administrar_torneo().
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "torneo_golf_config_select_autenticado" ON public.torneo_golf_config;
CREATE POLICY "torneo_golf_config_select_autenticado" ON public.torneo_golf_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "torneo_golf_config_insert_admin" ON public.torneo_golf_config;
CREATE POLICY "torneo_golf_config_insert_admin" ON public.torneo_golf_config
  FOR INSERT TO authenticated WITH CHECK (public.puede_administrar_torneo(torneo_id));

DROP POLICY IF EXISTS "torneo_golf_config_update_admin" ON public.torneo_golf_config;
CREATE POLICY "torneo_golf_config_update_admin" ON public.torneo_golf_config
  FOR UPDATE TO authenticated
  USING (public.puede_administrar_torneo(torneo_id))
  WITH CHECK (public.puede_administrar_torneo(torneo_id));

DROP POLICY IF EXISTS "torneo_golf_config_delete_admin" ON public.torneo_golf_config;
CREATE POLICY "torneo_golf_config_delete_admin" ON public.torneo_golf_config
  FOR DELETE TO authenticated USING (public.puede_administrar_torneo(torneo_id));

-- ------------------------------------------------------------
-- rondas_golf: lectura abierta a authenticated (necesaria para
-- que un jugador vea a sus companeros de flight). Escritura
-- "oficial" solo via RPC asignar_tee_time (SECURITY DEFINER).
-- El organizador/admin puede corregir directo si hace falta.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "rondas_golf_select_autenticado" ON public.rondas_golf;
CREATE POLICY "rondas_golf_select_autenticado" ON public.rondas_golf
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "rondas_golf_insert_admin" ON public.rondas_golf;
CREATE POLICY "rondas_golf_insert_admin" ON public.rondas_golf
  FOR INSERT TO authenticated WITH CHECK (public.puede_administrar_torneo(torneo_id));

DROP POLICY IF EXISTS "rondas_golf_update_admin" ON public.rondas_golf;
CREATE POLICY "rondas_golf_update_admin" ON public.rondas_golf
  FOR UPDATE TO authenticated
  USING (public.puede_administrar_torneo(torneo_id))
  WITH CHECK (public.puede_administrar_torneo(torneo_id));

DROP POLICY IF EXISTS "rondas_golf_delete_admin" ON public.rondas_golf;
CREATE POLICY "rondas_golf_delete_admin" ON public.rondas_golf
  FOR DELETE TO authenticated USING (public.puede_administrar_torneo(torneo_id));

-- ------------------------------------------------------------
-- scorecard: lectura abierta (leaderboard, confirmaciones
-- cruzadas). Nunca INSERT/UPDATE directo para jugadores -- todo
-- pasa por cargar_hoyo_scorecard / confirmar_hoyo_scorecard
-- (SECURITY DEFINER). El organizador/admin puede corregir
-- directo (mismo criterio que admin_forzar_resultado_partido).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "scorecard_select_autenticado" ON public.scorecard;
CREATE POLICY "scorecard_select_autenticado" ON public.scorecard
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "scorecard_update_admin" ON public.scorecard;
CREATE POLICY "scorecard_update_admin" ON public.scorecard
  FOR UPDATE TO authenticated
  USING (
    public.puede_administrar_torneo(
      (SELECT r.torneo_id FROM public.rondas_golf r WHERE r.id = ronda_id)
    )
  )
  WITH CHECK (
    public.puede_administrar_torneo(
      (SELECT r.torneo_id FROM public.rondas_golf r WHERE r.id = ronda_id)
    )
  );

DROP POLICY IF EXISTS "scorecard_delete_admin" ON public.scorecard;
CREATE POLICY "scorecard_delete_admin" ON public.scorecard
  FOR DELETE TO authenticated
  USING (
    public.puede_administrar_torneo(
      (SELECT r.torneo_id FROM public.rondas_golf r WHERE r.id = ronda_id)
    )
  );

-- Sin policy de INSERT para authenticated a proposito: todas las
-- filas de scorecard se crean via cargar_hoyo_scorecard (SECURITY
-- DEFINER), que bypassea RLS como dueno de la funcion. El admin
-- tampoco necesita insertar filas directo (solo corregir/borrar).
