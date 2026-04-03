import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';

type RivalProfile = {
  id: string;
  nombre_completo: string;
  whatsapp: string | null;
};

export type NextMatch = {
  id: string;
  jornada: number;
  estado: string;
  fecha_programada: string | null;
  jugador1_id: string;
  jugador2_id: string;
  rival: RivalProfile;

  // Compatibilidad con pantallas existentes.
  rivalId: string;
  rivalName: string;
  rivalWhatsapp: string | null;
  whatsappLink: string | null;
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

export function useNextMatch(tournamentId: number | string): UseNextMatchResult {
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<NextMatch | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchNextMatch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMatch(null);

    try {
      let currentUserId = '';

      try {
        const { data: authData } = await (supabase as any).auth.getUser();
        currentUserId = authData?.user?.id ?? '';
      } catch {
        // Sin sesion auth, intenta fallback.
      }

      if (!currentUserId) {
        try {
          const stored = localStorage.getItem('app_user');
          currentUserId = stored ? (JSON.parse(stored)?.id ?? '') : '';
        } catch {
          // localStorage inaccesible.
        }
      }

      if (!currentUserId) {
        setMatch(null);
        return;
      }

      const parsedTournamentId = Number(tournamentId);
      if (!Number.isFinite(parsedTournamentId)) {
        setError('ID de torneo invalido.');
        setMatch(null);
        return;
      }

      const { data: matchRows, error: matchError } = await supabase
        .from('partidos')
        .select(
          `
            id,
            jornada,
            estado,
            fecha_programada,
            torneo_id,
            jugador1_id,
            jugador2_id,
            jugador1:perfiles!jugador1_id(id, nombre_completo, whatsapp),
            jugador2:perfiles!jugador2_id(id, nombre_completo, whatsapp)
          `
        )
        .eq('torneo_id', parsedTournamentId)
        .or(`jugador1_id.eq.${currentUserId},jugador2_id.eq.${currentUserId}`)
        .eq('estado', 'programado')
        .order('jornada', { ascending: true })
        .order('fecha_programada', { ascending: true, nullsFirst: false })
        .limit(1);

      if (matchError) throw matchError;

      const next = Array.isArray(matchRows) ? (matchRows[0] as any) ?? null : null;

      if (!next) {
        setMatch(null);
        return;
      }

      const isCurrentUserJugador1 = String(next.jugador1_id) === currentUserId;
      const rivalRow = isCurrentUserJugador1 ? next.jugador2 : next.jugador1;

      const rival: RivalProfile = {
        id: String(rivalRow?.id ?? (isCurrentUserJugador1 ? next.jugador2_id : next.jugador1_id)),
        nombre_completo: String(rivalRow?.nombre_completo ?? 'Rival por confirmar'),
        whatsapp: rivalRow?.whatsapp ? String(rivalRow.whatsapp) : null,
      };

      const digits = String(rival.whatsapp ?? '').replace(/[^\d]/g, '');
      const whatsappLink = digits ? `https://wa.me/${digits}` : null;

      setMatch({
        id: String(next.id),
        jornada: Number(next.jornada ?? 1),
        estado: String(next.estado ?? 'programado'),
        fecha_programada: next.fecha_programada ?? null,
        jugador1_id: String(next.jugador1_id),
        jugador2_id: String(next.jugador2_id),
        rival,
        rivalId: rival.id,
        rivalName: rival.nombre_completo,
        rivalWhatsapp: rival.whatsapp,
        whatsappLink,
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
