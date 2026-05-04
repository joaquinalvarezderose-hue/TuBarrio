-- ============================================================
-- Update RLS policies to include stage_name column access
-- ============================================================

-- Ensure stage_name is accessible in existing SELECT policies
-- The existing policies should already allow access to all columns, 
-- but let's explicitly ensure stage_name is included

-- Drop and recreate partidos SELECT policy to ensure stage_name is accessible
DROP POLICY IF EXISTS "partidos_select_autenticado" ON public.partidos;
CREATE POLICY "partidos_select_autenticado"
  ON public.partidos
  FOR SELECT
  TO authenticated
  USING (
    -- Allow access to all partidos for authenticated users
    -- This includes the new stage_name column
    true
  );

-- Also ensure admin policies can access stage_name
DROP POLICY IF EXISTS "partidos_select_admin" ON public.partidos;
CREATE POLICY "partidos_select_admin"
  ON public.partidos
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Grant explicit permission on the stage_name column
-- This is a safety measure to ensure the column is accessible
GRANT SELECT (stage_name) ON public.partidos TO authenticated;

-- Also ensure the trigger function has proper permissions
-- The trigger runs with definer rights, but let's be explicit
ALTER FUNCTION public.update_stage_name_for_partidos() SECURITY DEFINER;
ALTER FUNCTION public.calculate_stage_name(BIGINT, INTEGER) SECURITY DEFINER;

-- Refresh the trigger to ensure it's working properly
DROP TRIGGER IF EXISTS trigger_update_stage_name ON public.partidos;
CREATE TRIGGER trigger_update_stage_name
  BEFORE INSERT OR UPDATE ON public.partidos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_stage_name_for_partidos();

-- Test the function with a sample query to ensure it works
-- This will help verify permissions are correct
DO $$
BEGIN
  -- Try to calculate stage name for existing bracket matches
  -- This will help verify the function works and has permissions
  PERFORM public.calculate_stage_name(torneo_id, ronda)
  FROM public.partidos
  WHERE bracket_tipo = 'eliminacion_directa'
  LIMIT 1;
  
  RAISE NOTICE 'Stage name function test completed successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Stage name function test failed: %', SQLERRM;
END $$;
