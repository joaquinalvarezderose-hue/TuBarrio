-- Drop the old overloaded version of obtener_estado_jugador_torneo that had
-- reversed parameter order (p_perfil_id uuid, p_torneo_id bigint).
-- This caused PostgREST ambiguity errors because both overloads matched
-- when called by named parameters from the JavaScript client, making the
-- usePlayerTournamentStatus hook fail on every call.
DROP FUNCTION IF EXISTS public.obtener_estado_jugador_torneo(uuid, bigint);

-- Ensure grants are in place for the remaining correct version
GRANT EXECUTE ON FUNCTION public.obtener_estado_jugador_torneo(bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_estado_jugador_torneo(bigint, uuid) TO anon;
