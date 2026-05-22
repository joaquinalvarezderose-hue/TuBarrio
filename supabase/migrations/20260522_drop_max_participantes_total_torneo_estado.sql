-- Eliminar columna legacy max_participantes_total de torneo_estado.
-- Esta columna perteneció a un diseño anterior donde torneo_estado tenía
-- una fila por torneo. Hoy la tabla es per-grupo (torneo_id, categoria, grupo),
-- y el total del torneo vive en torneo_configuracion.max_participantes_total.
-- Ningún RPC, trigger ni frontend la lee o escribe actualmente.

alter table public.torneo_estado
  drop column if exists max_participantes_total;
