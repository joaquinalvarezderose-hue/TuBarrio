-- Performance indexes for torneo_partidos_historial and partidos
-- These tables were missing composite indexes causing sequential scans
-- on H2H lookups in Standings.tsx and the perfiles_publicos view subquery

-- H2H pair lookup: SELECT ... WHERE jugador1_id = X AND jugador2_id = Y
CREATE INDEX IF NOT EXISTS idx_historial_jugadores
  ON torneo_partidos_historial (jugador1_id, jugador2_id);

-- Stats by winner within a tournament (ganador stats query)
CREATE INDEX IF NOT EXISTS idx_historial_ganador_torneo
  ON torneo_partidos_historial (ganador_id, torneo_id);

-- Per-player history across tournaments (profile stats hook)
CREATE INDEX IF NOT EXISTS idx_historial_jugador1_torneo
  ON torneo_partidos_historial (jugador1_id, torneo_id);

CREATE INDEX IF NOT EXISTS idx_historial_jugador2_torneo
  ON torneo_partidos_historial (jugador2_id, torneo_id);

-- Speeds up the EXISTS subquery in perfiles_publicos view that checks
-- whether two players have faced each other (WhatsApp visibility logic)
CREATE INDEX IF NOT EXISTS idx_partidos_par_jugadores_finalizado
  ON partidos (jugador1_id, jugador2_id)
  WHERE estado = 'finalizado';
