import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';

// -----------------------------------------------------------------
// Tipo que describe el próximo partido del usuario y los datos
// del rival (incluyendo WhatsApp para el botón de contacto).
// -----------------------------------------------------------------
export type NextMatch = {
  id: string;
  jornada: number;
  estado: string;
  fecha_programada: string | null;
  rivalId: string;
  rivalName: string;
  rivalWhatsapp: string | null;
};

export type UseNextMatchResult = {
  /** true mientras se está haciendo la consulta a Supabase */
  loading: boolean;
  /** Datos del próximo partido, o null si no hay partido pendiente */
  match: NextMatch | null;
  /** Mensaje de error en caso de falla, o null si todo está bien */
  error: string | null;
  /** Función para volver a cargar manualmente los datos */
  refetch: () => void;
};

/**
 * Hook que carga el próximo partido sin jugar del usuario logueado
 * para un torneo específico.
 *
 * Pasos internos:
 *  1. Resuelve el ID del usuario (Supabase Auth, con fallback a localStorage).
 *  2. Busca la categoría/grupo del usuario en `torneo_jugadores`.
 *  3. Consulta `partidos` filtrando por estado 'programado' o 'en_curso',
 *     ordenado por jornada y luego por fecha_programada.
 *  4. Obtiene el perfil del rival (nombre_completo + whatsapp) desde `perfiles`.
 *
 * Uso:
 *   const { loading, match, error, refetch } = useNextMatch(tournament.id);
 */
export function useNextMatch(tournamentId: number | string): UseNextMatchResult {
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<NextMatch | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchNextMatch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMatch(null);

    try {
      // -------------------------------------------------------
      // Paso 1: Obtener el ID del usuario actual.
      // Primero intenta con Supabase Auth (sesión real),
      // si no hay sesión activa usa el perfil guardado en localStorage.
      // -------------------------------------------------------
      let currentUserId = '';
      try {
        const { data: authData } = await (supabase as any).auth.getUser();
        currentUserId = authData?.user?.id ?? '';
      } catch {
        /* No hay sesión activa de Supabase, usamos fallback */
      }

      if (!currentUserId) {
        try {
          const stored = localStorage.getItem('app_user');
          currentUserId = stored ? (JSON.parse(stored)?.id ?? '') : '';
        } catch {
          /* localStorage no disponible */
        }
      }

      if (!currentUserId) {
        // Sin usuario identificado no podemos consultar partidos personales
        setMatch(null);
        return;
      }

      // -------------------------------------------------------
      // Paso 2: Resolver en qué categoría y grupo está inscripto
      // el jugador para filtrar solo sus partidos.
      // La columna 'grupo' tiene el formato 'TORNEO_{id}'.
      // -------------------------------------------------------
      let categoria: string | null = null;
      let grupo: string | null = null;

      const { data: scopeRows } = await supabase
        .from('torneo_jugadores')
        .select('categoria, grupo')
        .eq('torneo_id', tournamentId)
        .eq('perfil_id', currentUserId)
        .limit(1);

      const scopeRow = Array.isArray(scopeRows) ? scopeRows[0] : null;
      if (scopeRow?.categoria) {
        categoria = String(scopeRow.categoria);
        grupo = String(scopeRow.grupo);
      }

      // -------------------------------------------------------
      // Paso 3: Buscar el próximo partido del usuario.
      // Filtramos: torneo_id + usuario como jugador1 o jugador2
      //            + estado pendiente o en curso.
      // Orden: primero por jornada (número de ronda),
      //        luego por fecha_programada con nulls al final
      //        para que las fechas sin confirmar no "suban" al tope.
      // -------------------------------------------------------
      let query = supabase
        .from('partidos')
        .select('id, jornada, estado, fecha_programada, jugador1_id, jugador2_id')
        .eq('torneo_id', tournamentId)
        .or(`jugador1_id.eq.${currentUserId},jugador2_id.eq.${currentUserId}`)
        .in('estado', ['programado', 'en_curso'])
        .order('jornada', { ascending: true })
        .order('fecha_programada', { ascending: true, nullsFirst: false })
        .limit(1);

      // Agregar filtros de scope solo si están disponibles
      if (categoria) query = (query as any).eq('categoria', categoria);
      if (grupo) query = (query as any).eq('grupo', grupo);

      const { data: matchRows, error: matchError } = await query;

      if (matchError) throw matchError;

      const next = Array.isArray(matchRows) ? (matchRows[0] ?? null) : null;

      if (!next) {
        // No hay partidos pendientes para este jugador en este torneo
        setMatch(null);
        return;
      }

      // -------------------------------------------------------
      // Paso 4: Obtener perfil del rival (nombre + WhatsApp).
      // El rival es el jugador que NO soy yo en el partido.
      // La columna 'whatsapp' en 'perfiles' se guarda durante
      // el registro (Register.tsx).
      // -------------------------------------------------------
      const rivalId =
        String(next.jugador1_id) === currentUserId
          ? String(next.jugador2_id)
          : String(next.jugador1_id);

      const { data: rivalProfile, error: profileError } = await supabase
        .from('perfiles')
        .select('id, nombre_completo, whatsapp')
        .eq('id', rivalId)
        .maybeSingle();

      if (profileError) throw profileError;

      setMatch({
        id: String(next.id),
        jornada: Number(next.jornada ?? 1),
        estado: String(next.estado ?? 'programado'),
        fecha_programada: next.fecha_programada ?? null,
        rivalId,
        rivalName: rivalProfile?.nombre_completo ?? 'Rival por confirmar',
        rivalWhatsapp: rivalProfile?.whatsapp ?? null,
      });
    } catch (err: any) {
      console.error('[useNextMatch] Error al cargar el próximo partido:', err);
      setError('No pudimos cargar el próximo partido. Verificá tu conexión.');
      setMatch(null);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchNextMatch();
  }, [fetchNextMatch]);

  return { loading, match, error, refetch: fetchNextMatch };
}
