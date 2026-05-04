-- ============================================================
-- Agregar columna 'activo' a tabla torneos si no existe.
-- Fix para: "column torneos.activo does not exist"
-- ============================================================

-- Agregar columna activo con default true (solo si no existe)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'torneos' 
        AND column_name = 'activo'
    ) THEN
        ALTER TABLE public.torneos 
        ADD COLUMN activo boolean NOT NULL DEFAULT true;
        
        RAISE NOTICE 'Columna activo agregada a tabla torneos';
    ELSE
        RAISE NOTICE 'Columna activo ya existe en tabla torneos';
    END IF;
END $$;
