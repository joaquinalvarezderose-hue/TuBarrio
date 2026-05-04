-- ============================================================
-- Adaptar código para nueva estructura de base de datos
-- ============================================================

-- 1. Actualizar RPC obtener_estado_jugador_torneo para nueva estructura
CREATE OR REPLACE FUNCTION public.obtener_estado_jugador_torneo(p_perfil_id UUID, p_torneo_id BIGINT)
RETURNS JSON AS $$
DECLARE
    v_result JSON;
    v_stats JSON;
    v_next_match JSON;
    v_bracket_history JSON;
    v_eliminated BOOLEAN DEFAULT FALSE;
    v_champion BOOLEAN DEFAULT FALSE;
    v_waiting_next_round BOOLEAN DEFAULT FALSE;
    v_stage_name TEXT;
    v_max_ronda INTEGER;
BEGIN
    -- Verificar si el jugador está inscrito en el torneo
    IF NOT EXISTS (
        SELECT 1 FROM public.torneo_jugadores tj 
        WHERE tj.perfil_id = p_perfil_id AND tj.torneo_id = p_torneo_id
    ) THEN
        RETURN json_build_object(
            'status', 'not_participating',
            'message', 'No estás inscrito en este torneo'
        );
    END IF;
    
    -- Estadísticas generales del jugador en el torneo
    SELECT json_build_object(
        'partidos_jugados', COALESCE(COUNT(ph.id), 0),
        'partidos_ganados', COALESCE(COUNT(CASE WHEN ph.ganador_id = p_perfil_id THEN 1 END), 0),
        'partidos_perdidos', COALESCE(COUNT(CASE WHEN ph.ganador_id != p_perfil_id AND ph.ganador_id IS NOT NULL THEN 1 END), 0),
        'ronda_maxima_jugada', COALESCE(MAX(ph.ronda), 0),
        'categoria', tj.categoria,
        'grupo', tj.grupo
    ) INTO v_stats
    FROM public.torneo_jugadores tj
    LEFT JOIN public.torneo_partidos_historial ph ON ph.torneo_id = tj.torneo_id 
        AND (ph.jugador1_id = p_perfil_id OR ph.jugador2_id = p_perfil_id)
    WHERE tj.perfil_id = p_perfil_id AND tj.torneo_id = p_torneo_id;
    
    -- Buscar próximo partido programado
    SELECT json_build_object(
        'partido_id', p.id,
        'jugador1', json_build_object('id', p.jugador1_id, 'nombre', COALESCE(perf1.nombre_completo, 'Por definir')),
        'jugador2', json_build_object('id', p.jugador2_id, 'nombre', COALESCE(perf2.nombre_completo, 'Por definir')),
        'fecha_programada', p.fecha_programada,
        'ronda', p.ronda,
        'stage_name', p.stage_name,
        'bracket_tipo', p.bracket_tipo
    ) INTO v_next_match
    FROM public.partidos p
    LEFT JOIN public.perfiles perf1 ON perf1.id = p.jugador1_id
    LEFT JOIN public.perfiles perf2 ON perf2.id = p.jugador2_id
    WHERE p.torneo_id = p_torneo_id 
        AND p.estado = 'programado'
        AND (p.jugador1_id = p_perfil_id OR p.jugador2_id = p_perfil_id)
    ORDER BY p.fecha_programada ASC
    LIMIT 1;
    
    -- Si hay próximo partido, devolver esa información
    IF v_next_match IS NOT NULL THEN
        RETURN json_build_object(
            'status', 'has_next_match',
            'stats', v_stats,
            'next_match', v_next_match
        );
    END IF;
    
    -- Análisis del bracket para determinar estado del jugador
    SELECT MAX(p.ronda) INTO v_max_ronda
    FROM public.partidos p
    WHERE p.torneo_id = p_torneo_id AND p.bracket_tipo = 'eliminacion_directa';
    
    -- Verificar si el jugador fue eliminado
    SELECT EXISTS(
        SELECT 1 FROM public.torneo_partidos_historial ph
        WHERE ph.torneo_id = p_torneo_id 
            AND (ph.jugador1_id = p_perfil_id OR ph.jugador2_id = p_perfil_id)
            AND ph.ganador_id IS NOT NULL 
            AND ph.ganador_id != p_perfil_id
            AND ph.bracket_tipo = 'eliminacion_directa'
    ) INTO v_eliminated;
    
    -- Verificar si el jugador es el campeón
    SELECT EXISTS(
        SELECT 1 FROM public.torneo_partidos_historial ph
        WHERE ph.torneo_id = p_torneo_id 
            AND (ph.jugador1_id = p_perfil_id OR ph.jugador2_id = p_perfil_id)
            AND ph.ronda = v_max_ronda
            AND ph.ganador_id = p_perfil_id
            AND ph.bracket_tipo = 'eliminacion_directa'
    ) INTO v_champion;
    
    -- Determinar stage_name basado en la última ronda jugada
    SELECT p.stage_name INTO v_stage_name
    FROM public.torneo_partidos_historial p
    WHERE p.torneo_id = p_torneo_id 
        AND (p.jugador1_id = p_perfil_id OR p.jugador2_id = p_perfil_id)
        AND p.bracket_tipo = 'eliminacion_directa'
    ORDER BY p.ronda DESC
    LIMIT 1;
    
    -- Construir respuesta según estado
    IF v_champion THEN
        RETURN json_build_object(
            'status', 'champion',
            'message', '¡Felicidades! Eres el campeón del torneo',
            'stats', v_stats,
            'stage_name', 'Campeón'
        );
    ELSIF v_eliminated THEN
        RETURN json_build_object(
            'status', 'eliminated',
            'message', 'Has sido eliminado del torneo',
            'stats', v_stats,
            'stage_name', COALESCE(v_stage_name, 'Eliminado')
        );
    ELSE
        RETURN json_build_object(
            'status', 'waiting_next_round',
            'message', 'Esperando próximo oponente',
            'stats', v_stats,
            'stage_name', COALESCE(v_stage_name, 'En competencia')
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Crear función para calcular stage_name automáticamente
CREATE OR REPLACE FUNCTION public.calcular_stage_name(p_torneo_id BIGINT, p_ronda INTEGER)
RETURNS TEXT AS $$
DECLARE
    v_max_ronda INTEGER;
BEGIN
    -- Obtener la ronda máxima del torneo
    SELECT MAX(ronda) INTO v_max_ronda
    FROM public.partidos
    WHERE torneo_id = p_torneo_id AND bracket_tipo = 'eliminacion_directa';
    
    -- Calcular stage_name basado en la ronda
    IF v_max_ronda IS NULL THEN
        RETURN 'Ronda ' || p_ronda::TEXT;
    END IF;
    
    CASE 
        WHEN p_ronda = v_max_ronda THEN RETURN 'Final';
        WHEN p_ronda = v_max_ronda - 1 AND v_max_ronda >= 3 THEN RETURN 'Semifinal';
        WHEN p_ronda = v_max_ronda - 2 AND v_max_ronda >= 4 THEN RETURN 'Cuartos de Final';
        WHEN p_ronda = v_max_ronda - 3 AND v_max_ronda >= 5 THEN RETURN 'Octavos de Final';
        WHEN p_ronda = v_max_ronda - 4 AND v_max_ronda >= 6 THEN RETURN 'Dieciseisavos de Final';
        ELSE RETURN 'Ronda ' || p_ronda::TEXT;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- 3. Actualizar todos los stage_name existentes
UPDATE public.partidos 
SET stage_name = public.calcular_stage_name(torneo_id, ronda)
WHERE bracket_tipo = 'eliminacion_directa' AND stage_name IS NULL;

-- 4. Crear trigger para actualizar stage_name automáticamente
CREATE OR REPLACE FUNCTION public.actualizar_stage_name_trigger()
RETURNS TRIGGER AS $$
BEGIN
    -- Si es un partido de eliminación directa y tiene ronda
    IF NEW.bracket_tipo = 'eliminacion_directa' AND NEW.ronda IS NOT NULL THEN
        NEW.stage_name := public.calcular_stage_name(NEW.torneo_id, NEW.ronda);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_actualizar_stage_name ON public.partidos;
CREATE TRIGGER trigger_actualizar_stage_name
BEFORE INSERT OR UPDATE ON public.partidos
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_stage_name_trigger();

-- 5. Debug functions actualizadas
CREATE OR REPLACE FUNCTION public.debug_stage_names(p_torneo_id BIGINT)
RETURNS TABLE(
    partido_id UUID,
    ronda INTEGER,
    stage_name_actual TEXT,
    stage_name_calculado TEXT,
    bracket_tipo TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.ronda,
        p.stage_name,
        public.calcular_stage_name(p.torneo_id, p.ronda),
        p.bracket_tipo
    FROM public.partidos p
    WHERE p.torneo_id = p_torneo_id 
        AND p.bracket_tipo = 'eliminacion_directa'
    ORDER BY p.ronda DESC;
END;
$$ LANGUAGE plpgsql;

-- 6. Verificar datos actuales
DO $$
DECLARE
    rec RECORD;
BEGIN
    RAISE NOTICE '=== VERIFICACIÓN DE DATOS ===';
    
    -- Mostrar torneos
    FOR rec IN SELECT id, titulo FROM public.torneos ORDER BY id
    LOOP
        RAISE NOTICE 'Torneo %: %', rec.id, rec.titulo;
    END LOOP;
    
    -- Mostrar partidos con stage_names
    FOR rec IN SELECT torneo_id, COUNT(*) as total, COUNT(CASE WHEN stage_name IS NOT NULL THEN 1 END) as con_stage_name 
              FROM public.partidos 
              WHERE bracket_tipo = 'eliminacion_directa' 
              GROUP BY torneo_id
    LOOP
        RAISE NOTICE 'Torneo %: % partidos totales, % con stage_name', rec.torneo_id, rec.total, rec.con_stage_name;
    END LOOP;
    
    RAISE NOTICE '=== FIN VERIFICACIÓN ===';
END $$;

-- 7. Grant permissions
GRANT EXECUTE ON FUNCTION public.obtener_estado_jugador_torneo(UUID, BIGINT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.calcular_stage_name(BIGINT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.debug_stage_names(BIGINT) TO authenticated, anon;

RAISE NOTICE 'Código adaptado exitosamente para nueva estructura de base de datos';
