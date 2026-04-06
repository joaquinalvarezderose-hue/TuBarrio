-- Mejora de performance para Mis Torneos / Fixture.
-- Seguro para ejecutar varias veces.

create index if not exists idx_partidos_torneo_scope_estado_jornada
  on public.partidos (torneo_id, categoria, grupo, estado, jornada);

create index if not exists idx_partidos_torneo_scope_fecha
  on public.partidos (torneo_id, categoria, grupo, fecha_programada);

create index if not exists idx_torneo_jugadores_torneo_perfil
  on public.torneo_jugadores (torneo_id, perfil_id);

create index if not exists idx_torneo_jugadores_torneo_scope
  on public.torneo_jugadores (torneo_id, categoria, grupo);

create index if not exists idx_torneo_estado_torneo_scope
  on public.torneo_estado (torneo_id, categoria, grupo);

create index if not exists idx_torneo_historial_torneo_scope_partido
  on public.torneo_partidos_historial (torneo_id, categoria, grupo, partido_id);

create index if not exists idx_torneo_propuestas_torneo_scope_partido
  on public.torneo_propuestas_partido (torneo_id, categoria, grupo, partido_id);
