-- Limpieza segura para volver a probar un torneo puntual.
-- Edita las 3 variables del bloque antes de ejecutar.
-- Orden recomendado:
-- 1) Ejecutar 2026-03-25_partidos_scope_hardening.sql
-- 2) Ejecutar 2026-03-22_register_participant_rpc.sql
-- 3) Ejecutar este script solo si quieres resetear un torneo de prueba

do $$
declare
  v_torneo_id bigint := 1;
  v_categoria text := 'LIBRE';
  v_grupo text := 'A';
begin
  delete from public.torneo_propuestas_partido
  where torneo_id = v_torneo_id
    and categoria = v_categoria
    and grupo = v_grupo;

  delete from public.torneo_partidos_historial
  where torneo_id = v_torneo_id
    and categoria = v_categoria
    and grupo = v_grupo;

  delete from public.partidos
  where torneo_id = v_torneo_id
    and categoria = v_categoria
    and grupo = v_grupo;

  delete from public.torneo_jugadores
  where torneo_id = v_torneo_id
    and categoria = v_categoria
    and grupo = v_grupo;

  delete from public.torneo_estado
  where torneo_id = v_torneo_id
    and categoria = v_categoria
    and grupo = v_grupo;
end;
$$;