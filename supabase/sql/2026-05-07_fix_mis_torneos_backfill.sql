-- ============================================================
-- Fix: "Mis Torneos" no muestra torneos con pagado_aprobado
-- 
-- Problemas:
--   1. torneo_jugadores está vacío porque el trigger falló al
--      llamar registrar_participante_y_sortear_si_lleno()
--   2. FK faltante en inscripciones_torneo.torneo_id → torneos.id
--      impide que PostgREST resuelva el join desde el frontend
--
-- Ejecutar en Supabase SQL Editor (bloques separados)
-- ============================================================

-- ============================================================
-- BLOQUE 1: Diagnóstico — ver inscripciones aprobadas
-- ============================================================
SELECT
  i.id,
  i.torneo_id,
  i.perfil_id,
  i.estado,
  i.categoria,
  i.grupo,
  i.created_at,
  t.titulo AS torneo_titulo,
  p.nombre_completo AS jugador_nombre
FROM public.inscripciones_torneo i
LEFT JOIN public.torneos t ON t.id = i.torneo_id
LEFT JOIN public.perfiles p ON p.id = i.perfil_id
WHERE i.estado = 'pagado_aprobado'
ORDER BY i.created_at DESC;

-- ============================================================
-- BLOQUE 2: Diagnóstico — ver si FK existe
-- ============================================================
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name = 'inscripciones_torneo';

-- ============================================================
-- BLOQUE 3: Agregar FK si no existe (necesario para el join de PostgREST)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = 'inscripciones_torneo'
      AND kcu.column_name = 'torneo_id'
  ) THEN
    ALTER TABLE public.inscripciones_torneo
      ADD CONSTRAINT fk_inscripciones_torneo
      FOREIGN KEY (torneo_id) REFERENCES public.torneos(id) ON DELETE CASCADE;
    RAISE NOTICE 'FK fk_inscripciones_torneo creada correctamente';
  ELSE
    RAISE NOTICE 'FK ya existe, no se necesita crear';
  END IF;
END $$;

-- ============================================================
-- BLOQUE 4: Backfill torneo_jugadores desde inscripciones aprobadas
-- Inserta todos los jugadores con pagado_aprobado que no estén ya en torneo_jugadores
-- ============================================================
INSERT INTO public.torneo_jugadores (
  perfil_id,
  torneo_id,
  categoria,
  grupo,
  puntos,
  partidos_jugados,
  sets_ganados
)
SELECT
  i.perfil_id,
  i.torneo_id,
  COALESCE(NULLIF(TRIM(i.categoria), ''), t.subtitulo, 'General') AS categoria,
  COALESCE(NULLIF(TRIM(i.grupo), ''), FORMAT('TORNEO_%s', i.torneo_id)) AS grupo,
  0,
  0,
  0
FROM public.inscripciones_torneo i
LEFT JOIN public.torneos t ON t.id = i.torneo_id
WHERE i.estado = 'pagado_aprobado'
  AND NOT EXISTS (
    SELECT 1
    FROM public.torneo_jugadores tj
    WHERE tj.perfil_id = i.perfil_id
      AND tj.torneo_id = i.torneo_id
  )
ON CONFLICT DO NOTHING;

-- ============================================================
-- BLOQUE 5: Actualizar torneo_estado con los conteos correctos
-- ============================================================
UPDATE public.torneo_estado te
SET
  current_participantes = (
    SELECT COUNT(DISTINCT tj.perfil_id)
    FROM public.torneo_jugadores tj
    WHERE tj.torneo_id = te.torneo_id
      AND tj.categoria = te.categoria
      AND tj.grupo = te.grupo
  ),
  updated_at = NOW()
WHERE te.torneo_id IN (
  SELECT DISTINCT torneo_id FROM public.inscripciones_torneo WHERE estado = 'pagado_aprobado'
);

-- ============================================================
-- BLOQUE 6: Verificación final
-- ============================================================
SELECT
  tj.torneo_id,
  tj.perfil_id,
  tj.categoria,
  tj.grupo,
  p.nombre_completo,
  t.titulo AS torneo
FROM public.torneo_jugadores tj
JOIN public.perfiles p ON p.id = tj.perfil_id
JOIN public.torneos t ON t.id = tj.torneo_id
ORDER BY tj.torneo_id, p.nombre_completo;
