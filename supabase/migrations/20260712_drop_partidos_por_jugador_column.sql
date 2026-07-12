-- partidos_por_jugador: columna muerta, nunca leida por ninguna funcion.
-- El fixture (generar_fixture_round_robin_grupo) ya genera round-robin simple
-- (cada par juega una sola vez) sin depender de este valor.
-- Fecha: 2026-07-12

ALTER TABLE public.torneo_configuracion DROP COLUMN IF EXISTS partidos_por_jugador;
