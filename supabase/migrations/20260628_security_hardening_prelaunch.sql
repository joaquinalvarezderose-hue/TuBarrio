-- Security hardening before launch (2026-06-28)
-- Fixes: function search_path, drops test function, revokes anon EXECUTE on SECURITY DEFINER functions,
-- removes duplicate/legacy RLS policies

-- 1. Eliminar función de testing que quedó en producción
DROP FUNCTION IF EXISTS public.reset_password_test_user(text);

-- 2. Fijar search_path en la única función SECURITY DEFINER con search_path NULL
ALTER FUNCTION public.promover_ganador_bracket() SET search_path = public, pg_temp;

-- 3. Fijar search_path en funciones sin search_path (no SECURITY DEFINER, pero flageadas por advisor)
ALTER FUNCTION public.chk_grupos_clasificados_potencia_de_2() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_valoraciones_updated_at() SET search_path = public, pg_temp;

-- 4. REVOCAR EXECUTE de anon en funciones críticas SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.admin_forzar_resultado_partido(uuid, uuid, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_resetear_disputa(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_default_torneo_configuracion() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enviar_resultado_seguro(uuid, uuid, integer, integer, integer, integer, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalizar_grupo_si_completo() FROM anon;
REVOKE EXECUTE ON FUNCTION public.jugador_clasifica_en_fase_grupos(bigint, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.obtener_estado_jugador_torneo(bigint, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.on_torneo_estado_en_curso() FROM anon;
REVOKE EXECUTE ON FUNCTION public.registrar_participante_y_sortear_si_lleno(bigint, uuid, text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sortear_grupos_y_fixture_torneo(bigint, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_inscripcion_contadores() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_ejecutar_sorteo() FROM anon;

-- 5. Eliminar política SELECT duplicada en torneos
DROP POLICY IF EXISTS "Torneos select para todos" ON public.torneos;

-- 6. Eliminar política UPDATE legacy en rol {public} en perfiles
DROP POLICY IF EXISTS "Perfiles update propio" ON public.perfiles;
