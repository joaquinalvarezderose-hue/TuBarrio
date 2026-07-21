-- ============================================================
-- Hallazgo de revision de seguridad: este proyecto tiene default
-- privileges que otorgan EXECUTE a `anon` (y `authenticated`) sobre
-- toda funcion nueva en el schema public. Los "REVOKE ALL ... FROM
-- PUBLIC" del migration de dobles no alcanzaban a esos grants
-- explicitos por rol (PUBLIC != anon), asi que quedaron expuestas a
-- `anon` sin querer. Se corrige revocando explicitamente de `anon`
-- (y de `authenticated` para las funciones puramente internas, como
-- ya hacen `_confirmar_resultado_core` / `auto_confirmar_resultados_vencidos`
-- en singles).
-- ============================================================

-- Funciones internas: solo postgres (owner) + service_role, ni anon ni authenticated
REVOKE ALL ON FUNCTION public._confirmar_resultado_equipo_core(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_confirmar_resultados_equipos_vencidos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_confirmar_resultados_equipos_vencidos() TO service_role;
REVOKE ALL ON FUNCTION public.trg_torneo_equipos_no_jugador_duplicado_fn() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.promover_ganador_bracket_equipo() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalizar_grupo_equipos_si_completo() FROM PUBLIC, anon, authenticated, service_role;

-- Funciones internas llamadas desde otras RPCs (mismo patron que generar_fixture_round_robin_grupo / jugador_clasifica_en_fase_grupos): authenticated + service_role, sin anon
REVOKE ALL ON FUNCTION public.generar_fixture_round_robin_grupo_equipos(bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generar_fixture_round_robin_grupo_equipos(bigint, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.equipo_clasifica_en_fase_grupos(bigint, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_clasifica_en_fase_grupos(bigint, text, uuid) TO authenticated, service_role;

-- RPCs de uso normal (admin o jugador autenticado): authenticated + service_role, sin anon
REVOKE ALL ON FUNCTION public.crear_equipo_dobles(bigint, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_equipo_dobles(bigint, text, uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.eliminar_equipo_dobles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_equipo_dobles(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.sortear_grupos_y_fixture_equipos_torneo(bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sortear_grupos_y_fixture_equipos_torneo(bigint, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.generar_playoffs_eliminacion_directa_equipos_torneo(bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generar_playoffs_eliminacion_directa_equipos_torneo(bigint, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.enviar_resultado_seguro_equipo(uuid, uuid, integer, integer, integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enviar_resultado_seguro_equipo(uuid, uuid, integer, integer, integer, integer, integer, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.validar_resultado_seguro_equipo(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validar_resultado_seguro_equipo(uuid, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_marcar_wo_equipo(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_marcar_wo_equipo(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.obtener_estado_equipo_torneo(bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_estado_equipo_torneo(bigint, uuid) TO authenticated, service_role;
