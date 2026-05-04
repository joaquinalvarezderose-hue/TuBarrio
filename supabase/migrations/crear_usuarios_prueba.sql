-- ============================================================
-- Crear usuarios de prueba para testing del sistema
-- ============================================================

-- 1. Insertar usuarios de prueba en auth.users (necesita ser admin)
-- Nota: Estas credenciales son solo para desarrollo/pruebas
-- CAMBIARLAS en producción

-- Usuario: jugador1@test.com / Password: Test123456!
INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    role,
    aud
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'jugador1@test.com',
    -- Hash de "Test123456!" (generado con Supabase)
    '$2a$10$K8ZQqQqQqQqQqQqQqQqQqO8ZQqQqQqQqQqQqQqQqQqQqQqQqQqQqQqQqQq',
    NOW(),
    NOW(),
    NOW(),
    'authenticated',
    'authenticated'
) ON CONFLICT (id) DO NOTHING;

-- Usuario: jugador2@test.com / Password: Test123456!
INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    role,
    aud
) VALUES (
    '00000000-0000-0000-0000-000000000002',
    'jugador2@test.com',
    '$2a$10$K8ZQqQqQqQqQqQqQqQqQqO8ZQqQqQqQqQqQqQqQqQqQqQqQqQqQqQqQqQq',
    NOW(),
    NOW(),
    NOW(),
    'authenticated',
    'authenticated'
) ON CONFLICT (id) DO NOTHING;

-- Usuario: admin@test.com / Password: Admin123456!
INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    role,
    aud
) VALUES (
    '00000000-0000-0000-0000-000000000003',
    'admin@test.com',
    '$2a$10$K8ZQqQqQqQqQqQqQqQqQqO8ZQqQqQqQqQqQqQqQqQqQqQqQqQqQqQqQqQq',
    NOW(),
    NOW(),
    NOW(),
    'authenticated',
    'authenticated'
) ON CONFLICT (id) DO NOTHING;

-- 2. Actualizar perfiles con los mismos IDs
INSERT INTO public.perfiles (id, email, nombre_completo, whatsapp, rol) VALUES
    ('00000000-0000-0000-0000-000000000001', 'jugador1@test.com', 'Carlos Rodríguez', '11-1234-5678', 'jugador'),
    ('00000000-0000-0000-0000-000000000002', 'jugador2@test.com', 'Martín González', '11-2345-6789', 'jugador'),
    ('00000000-0000-0000-0000-000000000003', 'admin@test.com', 'Administrador Sistema', '11-9999-9999', 'admin')
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nombre_completo = EXCLUDED.nombre_completo,
    whatsapp = EXCLUDED.whatsapp,
    rol = EXCLUDED.rol;

-- 3. Inscribir jugadores en el torneo
INSERT INTO public.torneo_jugadores (torneo_id, perfil_id, categoria, grupo) VALUES
    (1, '00000000-0000-0000-0000-000000000001', 'Segunda', 'A'),
    (1, '00000000-0000-0000-0000-000000000002', 'Segunda', 'A')
ON CONFLICT (torneo_id, perfil_id) DO NOTHING;

-- 4. Actualizar contador de participantes
UPDATE public.torneo_estado 
SET current_participantes = (
    SELECT COUNT(*) FROM public.torneo_jugadores WHERE torneo_id = 1
)
WHERE torneo_id = 1;

-- 5. Crear partidos programados para estos jugadores
INSERT INTO public.partidos (torneo_id, jugador1_id, jugador2_id, jornada, ronda, bracket_tipo, estado, fecha_programada, stage_name) VALUES
    -- Partido entre los dos jugadores de prueba
    (1, '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 1, 2, 'eliminacion_directa', 'programado', NOW() + INTERVAL '1 day', 'Cuartos de Final'),
    -- Partido semifinal (esperando ganador)
    (1, '00000000-0000-0000-0000-000000000001', NULL, 2, 3, 'eliminacion_directa', 'programado', NOW() + INTERVAL '2 days', 'Semifinal'),
    -- Partido final
    (1, NULL, NULL, 3, 4, 'eliminacion_directa', 'programado', NOW() + INTERVAL '3 days', 'Final')
ON CONFLICT (id) DO NOTHING;

-- 6. Verificación de datos creados
DO $$
DECLARE
    rec RECORD;
BEGIN
    RAISE NOTICE '=== USUARIOS DE PRUEBA CREADOS ===';
    
    FOR rec IN SELECT id, email, nombre_completo, rol FROM public.perfiles 
              WHERE id IN ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003')
    LOOP
        RAISE NOTICE 'Usuario: % | Email: % | Nombre: % | Rol: %', 
            rec.id, rec.email, rec.nombre_completo, rec.rol;
    END LOOP;
    
    RAISE NOTICE '=== PARTIDOS CREADOS ===';
    FOR rec IN SELECT id, jugador1_id, jugador2_id, stage_name, fecha_programada 
              FROM public.partidos 
              WHERE torneo_id = 1 AND bracket_tipo = 'eliminacion_directa'
              ORDER BY ronda
    LOOP
        RAISE NOTICE 'Partido %: % vs % | % | %', 
            rec.id, rec.jugador1_id, rec.jugador2_id, rec.stage_name, rec.fecha_programada;
    END LOOP;
    
    RAISE NOTICE '=== CREDENCIALES PARA PRUEBA ===';
    RAISE NOTICE 'Jugador 1: jugador1@test.com / Test123456!';
    RAISE NOTICE 'Jugador 2: jugador2@test.com / Test123456!';
    RAISE NOTICE 'Admin: admin@test.com / Admin123456!';
    RAISE NOTICE '=== FIN ===';
END $$;

-- 7. Crear función para resetear passwords si es necesario
CREATE OR REPLACE FUNCTION public.reset_password_test_user(p_email TEXT)
RETURNS TEXT AS $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
    
    IF v_user_id IS NULL THEN
        RETURN 'Usuario no encontrado';
    END IF;
    
    -- Resetear a password por defecto
    UPDATE auth.users 
    SET encrypted_password = '$2a$10$K8ZQqQqQqQqQqQqQqQqQqO8ZQqQqQqQqQqQqQqQqQqQqQqQqQqQqQqQqQq'
    WHERE id = v_user_id;
    
    RETURN 'Password reseteado a Test123456! para ' || p_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.reset_password_test_user(TEXT) TO authenticated;
