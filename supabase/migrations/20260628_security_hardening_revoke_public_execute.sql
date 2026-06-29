-- Second pass: revoke PUBLIC execute on remaining functions still accessible by anon
-- REVOKE FROM PUBLIC + GRANT TO authenticated to ensure anon cannot call these functions

REVOKE EXECUTE ON FUNCTION public.create_default_torneo_configuracion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_default_torneo_configuracion() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.enviar_resultado_seguro(uuid, uuid, integer, integer, integer, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enviar_resultado_seguro(uuid, uuid, integer, integer, integer, integer, integer, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.finalizar_grupo_si_completo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_grupo_si_completo() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.jugador_clasifica_en_fase_grupos(bigint, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jugador_clasifica_en_fase_grupos(bigint, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.on_torneo_estado_en_curso() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.on_torneo_estado_en_curso() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.registrar_participante_y_sortear_si_lleno(bigint, uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_participante_y_sortear_si_lleno(bigint, uuid, text, text, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sortear_grupos_y_fixture_torneo(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sortear_grupos_y_fixture_torneo(bigint, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_inscripcion_contadores() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_inscripcion_contadores() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.trg_ejecutar_sorteo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trg_ejecutar_sorteo() TO authenticated;
