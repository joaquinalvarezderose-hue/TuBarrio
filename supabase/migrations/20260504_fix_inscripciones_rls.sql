-- ============================================================
-- Fix RLS policies for inscripciones_torneo
-- Limpiar políticas conflictivas y crear unas nuevas consistentes
-- ============================================================

-- Eliminar TODAS las políticas existentes de inscripciones_torneo
DROP POLICY IF EXISTS "inscripciones_insert_own" ON public.inscripciones_torneo;
DROP POLICY IF EXISTS "inscripciones_select_own" ON public.inscripciones_torneo;
DROP POLICY IF EXISTS "inscripciones_update_own_pending" ON public.inscripciones_torneo;
DROP POLICY IF EXISTS "inscripciones_admin_update" ON public.inscripciones_torneo;
DROP POLICY IF EXISTS "inscripciones_admin_delete" ON public.inscripciones_torneo;
DROP POLICY IF EXISTS "Users can view their own tournament enrollments" ON public.inscripciones_torneo;
DROP POLICY IF EXISTS "Users can insert their own tournament enrollments" ON public.inscripciones_torneo;
DROP POLICY IF EXISTS "Users can update their own pending enrollments" ON public.inscripciones_torneo;

-- Asegurar que RLS está habilitado
ALTER TABLE public.inscripciones_torneo ENABLE ROW LEVEL SECURITY;

-- Política SELECT: usuarios autenticados ven sus propias inscripciones, admins ven todas
CREATE POLICY "inscripciones_select_own_or_admin"
  ON public.inscripciones_torneo
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = perfil_id 
    OR EXISTS (
      SELECT 1 FROM public.perfiles p 
      WHERE p.id = auth.uid() 
      AND COALESCE(p.rol, '') IN ('admin', 'organizador')
    )
  );

-- Política INSERT: usuarios autenticados pueden crear su propia inscripción
CREATE POLICY "inscripciones_insert_own"
  ON public.inscripciones_torneo
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = perfil_id);

-- Política UPDATE: usuarios pueden actualizar sus inscricciones pendientes
CREATE POLICY "inscripciones_update_own_pending"
  ON public.inscripciones_torneo
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = perfil_id 
    AND estado = 'pendiente_revision'
  )
  WITH CHECK (
    auth.uid() = perfil_id
    AND estado = 'pendiente_revision'
  );

-- Política UPDATE para admins: pueden actualizar cualquier inscripción
CREATE POLICY "inscripciones_update_admin"
  ON public.inscripciones_torneo
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p 
      WHERE p.id = auth.uid() 
      AND COALESCE(p.rol, '') IN ('admin', 'organizador')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.perfiles p 
      WHERE p.id = auth.uid() 
      AND COALESCE(p.rol, '') IN ('admin', 'organizador')
    )
  );

-- Dar permisos necesarios
GRANT ALL ON public.inscripciones_torneo TO authenticated;
GRANT SELECT ON public.inscripciones_torneo TO anon;
