-- Fix: el Ranking General colapsaba Tercera/Segunda/Intermedia en una sola pestaña
-- porque los 3 torneos compartían el mismo torneos.subtitulo ("Singles Caballeros"),
-- valor que actúa como "categoria" en toda la cadena de tablas del torneo.
-- Se asigna un subtitulo distinto por torneo y se hace backfill de categoria
-- en todas las tablas que ya guardaron el valor viejo, filtrado por torneo_id.

-- 1. Subtítulo distinto por torneo (fuente para futuros grupos/partidos)
UPDATE public.torneos SET subtitulo = 'Tercera'    WHERE id = 8;
UPDATE public.torneos SET subtitulo = 'Segunda'    WHERE id = 9;
UPDATE public.torneos SET subtitulo = 'Intermedia' WHERE id = 10;
UPDATE public.torneos SET subtitulo = 'Damas'      WHERE id = 11;

-- 2. Backfill de categoria en tablas dependientes, scoped por torneo_id
UPDATE public.torneo_jugadores        SET categoria = 'Tercera'    WHERE torneo_id = 8;
UPDATE public.torneo_estado           SET categoria = 'Tercera'    WHERE torneo_id = 8;
UPDATE public.torneo_grupos           SET categoria = 'Tercera'    WHERE torneo_id = 8;
UPDATE public.partidos                SET categoria = 'Tercera'    WHERE torneo_id = 8;
UPDATE public.torneo_partidos_historial SET categoria = 'Tercera'  WHERE torneo_id = 8;
UPDATE public.inscripciones_torneo    SET categoria = 'Tercera'    WHERE torneo_id = 8;
UPDATE public.torneo_propuestas_partido SET categoria = 'Tercera'  WHERE torneo_id = 8;
UPDATE public.torneo_configuracion    SET categoria = 'Tercera'    WHERE torneo_id = 8;

UPDATE public.torneo_jugadores        SET categoria = 'Segunda'    WHERE torneo_id = 9;
UPDATE public.torneo_estado           SET categoria = 'Segunda'    WHERE torneo_id = 9;
UPDATE public.torneo_grupos           SET categoria = 'Segunda'    WHERE torneo_id = 9;
UPDATE public.partidos                SET categoria = 'Segunda'    WHERE torneo_id = 9;
UPDATE public.torneo_partidos_historial SET categoria = 'Segunda'  WHERE torneo_id = 9;
UPDATE public.inscripciones_torneo    SET categoria = 'Segunda'    WHERE torneo_id = 9;
UPDATE public.torneo_propuestas_partido SET categoria = 'Segunda'  WHERE torneo_id = 9;
UPDATE public.torneo_configuracion    SET categoria = 'Segunda'    WHERE torneo_id = 9;

UPDATE public.torneo_jugadores        SET categoria = 'Intermedia' WHERE torneo_id = 10;
UPDATE public.torneo_estado           SET categoria = 'Intermedia' WHERE torneo_id = 10;
UPDATE public.torneo_grupos           SET categoria = 'Intermedia' WHERE torneo_id = 10;
UPDATE public.partidos                SET categoria = 'Intermedia' WHERE torneo_id = 10;
UPDATE public.torneo_partidos_historial SET categoria = 'Intermedia' WHERE torneo_id = 10;
UPDATE public.inscripciones_torneo    SET categoria = 'Intermedia' WHERE torneo_id = 10;
UPDATE public.torneo_propuestas_partido SET categoria = 'Intermedia' WHERE torneo_id = 10;
UPDATE public.torneo_configuracion    SET categoria = 'Intermedia' WHERE torneo_id = 10;

UPDATE public.torneo_jugadores        SET categoria = 'Damas'      WHERE torneo_id = 11;
UPDATE public.torneo_estado           SET categoria = 'Damas'      WHERE torneo_id = 11;
UPDATE public.torneo_grupos           SET categoria = 'Damas'      WHERE torneo_id = 11;
UPDATE public.partidos                SET categoria = 'Damas'      WHERE torneo_id = 11;
UPDATE public.torneo_partidos_historial SET categoria = 'Damas'    WHERE torneo_id = 11;
UPDATE public.inscripciones_torneo    SET categoria = 'Damas'      WHERE torneo_id = 11;
UPDATE public.torneo_propuestas_partido SET categoria = 'Damas'    WHERE torneo_id = 11;
UPDATE public.torneo_configuracion    SET categoria = 'Damas'      WHERE torneo_id = 11;
