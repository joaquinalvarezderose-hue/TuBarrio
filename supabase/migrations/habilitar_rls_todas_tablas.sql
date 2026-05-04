-- ============================================================
-- Habilitar RLS y crear políticas para todas las tablas
-- ============================================================

DO $$
DECLARE
    table_rec RECORD;
    sql_text TEXT;
BEGIN
    RAISE NOTICE '=== HABILITANDO RLS EN TODAS LAS TABLAS ===';
    
    -- Lista de tablas que necesitan RLS
    FOR table_rec IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('schema_migrations')
        ORDER BY table_name
    LOOP
        -- Habilitar RLS en cada tabla
        sql_text := format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_rec.table_name);
        BEGIN
            EXECUTE sql_text;
            RAISE NOTICE 'RLS habilitado en tabla: %', table_rec.table_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error habilitando RLS en %: %', table_rec.table_name, SQLERRM;
        END;
    END LOOP;
    
    RAISE NOTICE '=== CREANDO POLÍTICAS RLS ===';
END $$;

-- ============================================================
-- Políticas RLS específicas por tabla
-- ============================================================

-- 1. Tabla TORNEOS (lectura pública)
DROP POLICY IF EXISTS "Public read access to torneos" ON public.torneos;
CREATE POLICY "Public read access to torneos" ON public.torneos
    FOR SELECT USING (true);

-- 2. Tabla PERFILES
DROP POLICY IF EXISTS "Users can view own profile" ON public.perfiles;
CREATE POLICY "Users can view own profile" ON public.perfiles
    FOR SELECT USING (auth.uid()::text = id::text);

DROP POLICY IF EXISTS "Users can update own profile" ON public.perfiles;
CREATE POLICY "Users can update own profile" ON public.perfiles
    FOR UPDATE USING (auth.uid()::text = id::text);

DROP POLICY IF EXISTS "Public read access to perfiles" ON public.perfiles;
CREATE POLICY "Public read access to perfiles" ON public.perfiles
    FOR SELECT USING (true);

-- 3. Tabla TORNEO_ESTADO
DROP POLICY IF EXISTS "Public read access to torneo_estado" ON public.torneo_estado;
CREATE POLICY "Public read access to torneo_estado" ON public.torneo_estado
    FOR SELECT USING (true);

-- 4. Tabla TORNEO_CONFIGURACION
DROP POLICY IF EXISTS "Public read access to torneo_configuracion" ON public.torneo_configuracion;
CREATE POLICY "Public read access to torneo_configuracion" ON public.torneo_configuracion
    FOR SELECT USING (true);

-- 5. Tabla TORNEO_JUGADORES
DROP POLICY IF EXISTS "Users can view own tournament participation" ON public.torneo_jugadores;
CREATE POLICY "Users can view own tournament participation" ON public.torneo_jugadores
    FOR SELECT USING (auth.uid()::text = perfil_id::text);

DROP POLICY IF EXISTS "Users can insert own tournament participation" ON public.torneo_jugadores;
CREATE POLICY "Users can insert own tournament participation" ON public.torneo_jugadores
    FOR INSERT WITH CHECK (auth.uid()::text = perfil_id::text);

DROP POLICY IF EXISTS "Public read access to torneo_jugadores" ON public.torneo_jugadores;
CREATE POLICY "Public read access to torneo_jugadores" ON public.torneo_jugadores
    FOR SELECT USING (true);

-- 6. Tabla INSCRIPCIONES_TORNEO
DROP POLICY IF EXISTS "Users can view their own tournament enrollments" ON public.inscripciones_torneo;
CREATE POLICY "Users can view their own tournament enrollments" ON public.inscripciones_torneo
    FOR SELECT USING (auth.uid()::text = perfil_id::text);

DROP POLICY IF EXISTS "Users can insert their own tournament enrollments" ON public.inscripciones_torneo;
CREATE POLICY "Users can insert their own tournament enrollments" ON public.inscripciones_torneo
    FOR INSERT WITH CHECK (auth.uid()::text = perfil_id::text);

DROP POLICY IF EXISTS "Users can update their own pending enrollments" ON public.inscripciones_torneo;
CREATE POLICY "Users can update their own pending enrollments" ON public.inscripciones_torneo
    FOR UPDATE USING (auth.uid()::text = perfil_id::text AND estado = 'pendiente_revision');

-- 7. Tabla PARTIDOS
DROP POLICY IF EXISTS "Public read access to partidos" ON public.partidos;
CREATE POLICY "Public read access to partidos" ON public.partidos
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can view own matches" ON public.partidos;
CREATE POLICY "Users can view own matches" ON public.partidos
    FOR SELECT USING (auth.uid()::text = jugador1_id::text OR auth.uid()::text = jugador2_id::text);

-- 8. Tabla RESULTADOS_PARTIDOS
DROP POLICY IF EXISTS "Users can view own match results" ON public.resultados_partidos;
CREATE POLICY "Users can view own match results" ON public.resultados_partidos
    FOR SELECT USING (auth.uid()::text = jugador1_id::text OR auth.uid()::text = jugador2_id::text);

DROP POLICY IF EXISTS "Users can insert own match results" ON public.resultados_partidos;
CREATE POLICY "Users can insert own match results" ON public.resultados_partidos
    FOR INSERT WITH CHECK (auth.uid()::text = jugador1_id::text OR auth.uid()::text = jugador2_id::text);

-- 9. Tabla TORNEO_GRUPOS
DROP POLICY IF EXISTS "Public read access to torneo_grupos" ON public.torneo_grupos;
CREATE POLICY "Public read access to torneo_grupos" ON public.torneo_grupos
    FOR SELECT USING (true);

-- 10. Tabla TORNEO_GRUPOS_CATALOGO
DROP POLICY IF EXISTS "Public read access to torneo_grupos_catalogo" ON public.torneo_grupos_catalogo;
CREATE POLICY "Public read access to torneo_grupos_catalogo" ON public.torneo_grupos_catalogo
    FOR SELECT USING (true);

-- 11. Tabla TORNEO_PROPUESTAS
DROP POLICY IF EXISTS "Users can view own tournament proposals" ON public.torneo_propuestas;
CREATE POLICY "Users can view own tournament proposals" ON public.torneo_propuestas
    FOR SELECT USING (auth.uid()::text = perfil_id::text);

DROP POLICY IF EXISTS "Users can insert own tournament proposals" ON public.torneo_propuestas;
CREATE POLICY "Users can insert own tournament proposals" ON public.torneo_propuestas
    FOR INSERT WITH CHECK (auth.uid()::text = perfil_id::text);

-- ============================================================
-- Verificación final
-- ============================================================

DO $$
DECLARE
    table_rec RECORD;
    policy_rec RECORD;
    rls_enabled BOOLEAN;
    policy_count INTEGER;
BEGIN
    RAISE NOTICE '=== VERIFICACIÓN FINAL DE RLS ===';
    
    FOR table_rec IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('schema_migrations')
        ORDER BY table_name
    LOOP
        -- Verificar si RLS está habilitado
        SELECT rowsecurity INTO rls_enabled
        FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = table_rec.table_name;
        
        -- Contar políticas
        SELECT COUNT(*) INTO policy_count
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = table_rec.table_name;
        
        RAISE NOTICE 'Tabla: % | RLS: % | Políticas: %', 
            table_rec.table_name, 
            CASE WHEN rls_enabled THEN '✓' ELSE '✗' END,
            policy_count;
    END LOOP;
    
    RAISE NOTICE '=== RLS CONFIGURADO COMPLETAMENTE ===';
END $$;

-- ============================================================
-- Grant permissions
-- ============================================================

-- Grant usage on authenticated role
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- Grant permissions on all tables
DO $$
DECLARE
    table_rec RECORD;
BEGIN
    FOR table_rec IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('schema_migrations')
    LOOP
        EXECUTE format('GRANT ALL ON %I TO authenticated', table_rec.table_name);
        EXECUTE format('GRANT SELECT ON %I TO anon', table_rec.table_name);
    END LOOP;
END $$;
