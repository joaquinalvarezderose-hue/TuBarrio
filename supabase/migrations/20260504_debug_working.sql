-- ============================================================
-- Debug stage_name calculation - Working version
-- ============================================================

-- Simple debug function to see what's happening
CREATE OR REPLACE FUNCTION public.debug_stage_name(p_torneo_id BIGINT)
RETURNS TABLE(
  partido_id UUID,
  ronda INTEGER,
  bracket_tipo TEXT,
  stage_name_actual TEXT,
  max_ronda_torneo INTEGER,
  calculated_stage_name TEXT,
  calculation_debug TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.ronda,
    p.bracket_tipo,
    p.stage_name as stage_name_actual,
    COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) as max_ronda_torneo,
    CASE 
      WHEN p.ronda = COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) THEN 'Final'
      WHEN p.ronda = COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) - 1 
           AND COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) >= 3 THEN 'Semifinal'
      WHEN p.ronda = COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) - 2 
           AND COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) >= 4 THEN 'Cuartos de Final'
      WHEN p.ronda = COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) - 3 
           AND COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) >= 5 THEN 'Octavos de Final'
      WHEN p.ronda = COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) - 4 
           AND COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) >= 6 THEN 'Dieciseisavos de Final'
      ELSE 'Ronda ' || p.ronda::TEXT
    END as calculated_stage_name,
    'Ronda ' || p.ronda::TEXT || ' de ' || COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0)::TEXT ||
    CASE 
      WHEN p.ronda = COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) THEN ' -> Final'
      WHEN p.ronda = COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) - 1 
           AND COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) >= 3 THEN ' -> Semifinal'
      WHEN p.ronda = COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) - 2 
           AND COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) >= 4 THEN ' -> Cuartos de Final'
      WHEN p.ronda = COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) - 3 
           AND COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) >= 5 THEN ' -> Octavos de Final'
      WHEN p.ronda = COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) - 4 
           AND COALESCE((SELECT MAX(p2.ronda) FROM partidos p2 WHERE p2.torneo_id = p_torneo_id AND p2.bracket_tipo = 'eliminacion_directa'), 0) >= 6 THEN ' -> Dieciseisavos de Final'
      ELSE ' -> Ronda ' || p.ronda::TEXT
    END as calculation_debug
  FROM partidos p
  WHERE p.torneo_id = p_torneo_id 
    AND p.bracket_tipo = 'eliminacion_directa' 
    AND p.ronda IS NOT NULL
  ORDER BY p.ronda DESC;
END;
$$ LANGUAGE plpgsql;

-- Even simpler debug - just show raw data
CREATE OR REPLACE FUNCTION public.simple_debug()
RETURNS TABLE(
  torneo_id BIGINT,
  max_ronda INTEGER,
  partidos_por_ronda TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    partidos.torneo_id,
    MAX(partidos.ronda) as max_ronda,
    (
      SELECT STRING_AGG(ronda_count.ronda_text, ', ' ORDER BY ronda_count.ronda DESC)
      FROM (
        SELECT 
          p_inner.ronda::TEXT || '(' || COUNT(*)::TEXT || ')' as ronda_text,
          p_inner.ronda
        FROM partidos p_inner 
        WHERE p_inner.torneo_id = partidos.torneo_id 
          AND p_inner.bracket_tipo = 'eliminacion_directa' 
          AND p_inner.ronda IS NOT NULL
        GROUP BY p_inner.ronda
      ) ronda_count
    ) as partidos_por_ronda
  FROM partidos 
  WHERE partidos.bracket_tipo = 'eliminacion_directa' 
    AND partidos.ronda IS NOT NULL
  GROUP BY partidos.torneo_id
  ORDER BY partidos.torneo_id;
END;
$$ LANGUAGE plpgsql;

-- Show debug immediately
DO $$
DECLARE
  rec RECORD;
  detail_rec RECORD;
BEGIN
  RAISE NOTICE '=== TOURNAMENT DEBUG ===';
  FOR rec IN SELECT * FROM public.simple_debug()
  LOOP
    RAISE NOTICE 'Torneo %: Max ronda %, partidos: %', 
      rec.torneo_id, 
      rec.max_ronda, 
      rec.partidos_por_ronda;
  END LOOP;
  
  -- Show detailed for first tournament
  FOR rec IN SELECT * FROM public.simple_debug() LIMIT 1
  LOOP
    RAISE NOTICE '=== DETAILED DEBUG FOR TOURNAMENT % ===', rec.torneo_id;
    FOR detail_rec IN SELECT * FROM public.debug_stage_name(rec.torneo_id)
    LOOP
      RAISE NOTICE 'Partido %: % -> % [%]', 
        detail_rec.partido_id,
        detail_rec.calculation_debug,
        COALESCE(detail_rec.stage_name_actual, 'NULL'),
        detail_rec.calculated_stage_name;
    END LOOP;
    RAISE NOTICE '=== END DETAILED DEBUG ===';
  END LOOP;
  
  RAISE NOTICE '=== END DEBUG ===';
END $$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.debug_stage_name(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.simple_debug() TO authenticated;
