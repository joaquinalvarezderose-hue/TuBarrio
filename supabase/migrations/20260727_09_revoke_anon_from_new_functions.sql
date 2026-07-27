-- ============================================================
-- FIX: este proyecto tiene default privileges que otorgan EXECUTE a
-- `anon` sobre toda funcion NUEVA creada en el schema public (mismo
-- hallazgo que 20260721_dobles_fix_function_grants_revoke_anon.sql).
-- `REVOKE ALL ... FROM PUBLIC` no alcanza a ese grant explicito por
-- rol (PUBLIC != anon), asi que las 6 funciones nuevas de este batch
-- quedaron expuestas a usuarios no autenticados sin querer.
--
-- Confirmado via Supabase security advisors post-aplicacion.
-- ============================================================

REVOKE ALL ON FUNCTION public.is_organizador() FROM anon;
REVOKE ALL ON FUNCTION public.puede_administrar_torneo(bigint) FROM anon;

REVOKE ALL ON FUNCTION public.crear_torneo(
  text, text, date, date, text, text, integer, integer, integer, integer, integer, boolean, boolean, integer
) FROM anon;

REVOKE ALL ON FUNCTION public.actualizar_configuracion_torneo(
  bigint, text, text, date, date, text, integer, integer, integer, integer, integer, boolean, boolean, integer
) FROM anon;

REVOKE ALL ON FUNCTION public.archivar_torneo(bigint, boolean, boolean) FROM anon;

REVOKE ALL ON FUNCTION public.asignar_rol_organizador(uuid, boolean) FROM anon;
