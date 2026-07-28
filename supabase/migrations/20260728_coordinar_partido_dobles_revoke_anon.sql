-- ============================================================
-- COORDINAR PARTIDO — DOBLES — revoke anon — 2026-07-28
-- Las funciones nuevas del schema public reciben EXECUTE para
-- anon/authenticated por privilegios por defecto de Supabase al
-- momento de CREATE (REVOKE ALL FROM PUBLIC no alcanza ese grant
-- directo a anon). Mismo patron que
-- 20260721_dobles_fix_function_grants_revoke_anon.sql y
-- 20260727_09_revoke_anon_from_new_functions.sql.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.set_coordinacion_manual_equipo(UUID) FROM anon;
