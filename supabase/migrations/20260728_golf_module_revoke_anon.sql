-- ============================================================
-- FIX: este proyecto tiene default privileges que otorgan EXECUTE a
-- `anon` sobre toda funcion NUEVA creada en el schema public (mismo
-- hallazgo que 20260721_dobles_fix_function_grants_revoke_anon.sql y
-- 20260727_09_revoke_anon_from_new_functions.sql). `REVOKE ALL ...
-- FROM PUBLIC` no alcanza a ese grant explicito por rol (PUBLIC != anon),
-- asi que las 10 funciones del modulo de golf quedaron expuestas a
-- usuarios no autenticados sin querer.
--
-- Cada funcion ya valida auth.uid()/is_admin()/is_organizador()/
-- puede_administrar_torneo() internamente (auth.uid() es NULL para
-- anon, por lo que esos checks fallan de forma segura), asi que no
-- habia una via de escalada de privilegios real -- pero se revoca
-- explicitamente para no depender de eso, siguiendo la misma politica
-- ya aplicada al resto del proyecto.
--
-- Confirmado via Supabase security advisors + consulta directa a
-- has_function_privilege() post-aplicacion de las migraciones del
-- modulo de golf.
--
-- De paso, fija tambien el WARN "Function Search Path Mutable" sobre
-- calcular_golpes_netos (las demas funciones del modulo ya tenian
-- SET search_path = public, pg_temp; a esta se le habia escapado por
-- ser LANGUAGE plpgsql IMMUTABLE sin acceso a tablas).
-- ============================================================

REVOKE ALL ON FUNCTION public.crear_cancha_con_hoyos(text, text, jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.crear_torneo_golf(
  text, text, date, date, text, text, text, bigint, text, text, text
) FROM anon;

REVOKE ALL ON FUNCTION public.actualizar_reglas_golf(bigint, text, text, text) FROM anon;

REVOKE ALL ON FUNCTION public.asignar_tee_time(bigint, bigint, date, time, uuid[]) FROM anon;

REVOKE ALL ON FUNCTION public.calcular_golpes_netos(integer, numeric, integer) FROM anon;

REVOKE ALL ON FUNCTION public.cargar_hoyo_scorecard(uuid, bigint, integer) FROM anon;

REVOKE ALL ON FUNCTION public.confirmar_hoyo_scorecard(uuid, text) FROM anon;

REVOKE ALL ON FUNCTION public.obtener_leaderboard_golf(bigint) FROM anon;

REVOKE ALL ON FUNCTION public.iniciar_torneo_golf(bigint) FROM anon;

REVOKE ALL ON FUNCTION public.finalizar_torneo_golf(bigint) FROM anon;

-- Fijar search_path mutable en calcular_golpes_netos (recreada identica,
-- solo se agrega SET search_path).
CREATE OR REPLACE FUNCTION public.calcular_golpes_netos(
  p_golpes_brutos integer,
  p_handicap numeric,
  p_indice_dificultad integer
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hcp integer;
  v_golpes_base integer;
  v_golpes_extra integer;
BEGIN
  v_hcp := ROUND(COALESCE(p_handicap, 0))::integer;
  v_golpes_base := FLOOR(v_hcp::numeric / 18)::integer;
  v_golpes_extra := CASE WHEN p_indice_dificultad <= (v_hcp - v_golpes_base * 18) THEN 1 ELSE 0 END;
  RETURN p_golpes_brutos - (v_golpes_base + v_golpes_extra);
END;
$$;

REVOKE ALL ON FUNCTION public.calcular_golpes_netos(integer, numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_golpes_netos(integer, numeric, integer) TO authenticated;
