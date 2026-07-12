import { supabase } from '../services/supabaseClient';

/**
 * Agrega dos usuarios (pruebatorneo22, pruebatorneo23) al torneo 19 en el GRUPO 1
 * y genera los partidos del grupo.
 *
 * Esta es una operación de excepción única para testing.
 */
export async function addUsersToTournament19() {
  try {
    // Ejecutar el script SQL mediante una RPC o directamente
    const { data, error } = await supabase.rpc('add_users_to_tournament_group', {
      p_torneo_id: 19,
      p_grupo: 'GRUPO 1',
      p_username_22: 'pruebatorneo22',
      p_username_23: 'pruebatorneo23',
    });

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error adding users to tournament:', error);
    throw error;
  }
}

/**
 * Consulta el estado actual del torneo 19 GRUPO 1
 */
export async function getTournament19GroupStatus() {
  try {
    // Obtener información del grupo
    const { data: groupStatus, error: groupError } = await supabase
      .from('torneo_estado')
      .select('*')
      .eq('torneo_id', 19)
      .eq('grupo', 'GRUPO 1');

    if (groupError) throw groupError;

    // Obtener jugadores en el grupo
    const { data: players, error: playersError } = await supabase
      .from('torneo_jugadores')
      .select('perfil_id, puntos, partidos_jugados')
      .eq('torneo_id', 19)
      .eq('grupo', 'GRUPO 1');

    if (playersError) throw playersError;

    // Obtener partidos
    const { data: matches, error: matchesError } = await supabase
      .from('partidos')
      .select('*')
      .eq('torneo_id', 19)
      .eq('grupo', 'GRUPO 1');

    if (matchesError) throw matchesError;

    return {
      groupStatus: groupStatus?.[0],
      playerCount: players?.length || 0,
      players,
      matchCount: matches?.length || 0,
      matches,
    };
  } catch (error) {
    console.error('Error fetching tournament status:', error);
    throw error;
  }
}
