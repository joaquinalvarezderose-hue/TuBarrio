import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';

export type PlayerTournamentEstado =
  | 'activo'
  | 'eliminado'
  | 'campeon'
  | 'esperando_siguiente_ronda'
  | 'sin_participacion';

export type PlayerTournamentStats = {
  total: number;
  wins: number;
  losses: number;
  sets_won: number;
  sets_lost: number;
  win_rate: number;
};

export type PlayerTournamentNextMatch = {
  id: string;
  jornada: number;
  estado: string;
  fecha_programada: string | null;
  jugador1_id: string;
  jugador2_id: string;
  ronda: number | null;
  bracket_tipo: string | null;
  grupo: string;
  categoria: string;
  stage_name: string | null;
  rival_id: string;
  rival_nombre: string;
  rival_whatsapp: string | null;
};

export type PlayerTournamentStatus = {
  estado: PlayerTournamentEstado;
  proximo_partido: PlayerTournamentNextMatch | null;
  stats: PlayerTournamentStats;
  ronda_actual: number | null;
  stage_name: string | null;
  mensaje: string;
};

export type UsePlayerTournamentStatusResult = {
  loading: boolean;
  status: PlayerTournamentStatus | null;
  error: string | null;
  refetch: () => void;
};

export function usePlayerTournamentStatus(
  tournamentId: number | string,
  userId?: string
): UsePlayerTournamentStatusResult {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<PlayerTournamentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatus(null);

    try {
      let currentUserId = userId ?? '';

      if (!currentUserId) {
        try {
          const { data: authData } = await (supabase as any).auth.getUser();
          currentUserId = authData?.user?.id ?? '';
        } catch {
          // no auth session
        }
      }

      if (!currentUserId) {
        try {
          const stored = localStorage.getItem('app_user');
          currentUserId = stored ? (JSON.parse(stored)?.id ?? '') : '';
        } catch {
          // localStorage inaccessible
        }
      }

      if (!currentUserId) {
        setStatus({
          estado: 'sin_participacion',
          proximo_partido: null,
          stats: { total: 0, wins: 0, losses: 0, sets_won: 0, sets_lost: 0, win_rate: 0 },
          ronda_actual: null,
          stage_name: null,
          mensaje: 'No se pudo identificar al usuario.',
        });
        return;
      }

      const parsedTournamentId = Number(tournamentId);
      if (!Number.isFinite(parsedTournamentId)) {
        setError('ID de torneo inválido.');
        return;
      }

      const { data, error: rpcError } = await (supabase as any).rpc(
        'obtener_estado_jugador_torneo',
        { p_torneo_id: parsedTournamentId, p_perfil_id: currentUserId }
      );

      if (rpcError) {
        throw rpcError;
      }

      if (!data) {
        setStatus({
          estado: 'sin_participacion',
          proximo_partido: null,
          stats: { total: 0, wins: 0, losses: 0, sets_won: 0, sets_lost: 0, win_rate: 0 },
          ronda_actual: null,
          stage_name: null,
          mensaje: 'No hay información disponible.',
        });
        return;
      }

      // The RPC returns a jsonb object directly
      const result = typeof data === 'string' ? JSON.parse(data) : data;

      setStatus({
        estado: result.estado as PlayerTournamentEstado,
        proximo_partido: result.proximo_partido ?? null,
        stats: result.stats ?? { total: 0, wins: 0, losses: 0, sets_won: 0, sets_lost: 0, win_rate: 0 },
        ronda_actual: result.ronda_actual ?? null,
        stage_name: result.stage_name ?? null,
        mensaje: result.mensaje ?? '',
      });
    } catch (err: any) {
      console.error('[usePlayerTournamentStatus] Error:', err);
      setError('No se pudo determinar el estado del jugador en el torneo.');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, userId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return { loading, status, error, refetch: fetchStatus };
}
