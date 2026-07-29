import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { toWhatsAppLink } from '../utils/whatsapp';

export type FlightPartner = {
  id: string;
  nombre_completo: string;
  whatsapp: string | null;
  whatsappLink: string | null;
};

export type GolfRound = {
  id: string;
  torneoId: number;
  canchaId: number;
  canchaNombre: string | null;
  numeroRonda: number;
  flightNumero: number | null;
  estado: string;
  companeros: FlightPartner[];
};

export type UseGolfNextRoundResult = {
  /** true mientras se esta haciendo la consulta a Supabase */
  loading: boolean;
  /** Ronda asignada al usuario en este torneo, o null si todavia no fue sorteado en ningun flight */
  round: GolfRound | null;
  /** Mensaje de error en caso de falla, o null si todo esta bien */
  error: string | null;
  /** Funcion para volver a cargar manualmente los datos */
  refetch: () => void;
};

export function useGolfNextRound(tournamentId: number | string, enabled: boolean = true): UseGolfNextRoundResult {
  const [loading, setLoading] = useState(true);
  const [round, setRound] = useState<GolfRound | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRound = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setRound(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      let currentUserId = '';

      try {
        const { data: authData } = await supabase.auth.getUser();
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
        setRound(null);
        return;
      }

      const parsedTournamentId = Number(tournamentId);
      if (!Number.isFinite(parsedTournamentId)) {
        setError('ID de torneo invalido.');
        setRound(null);
        return;
      }

      const { data: mias, error: miasError } = await supabase
        .from('rondas_golf')
        .select('id, torneo_id, cancha_id, numero_ronda, flight_numero, estado, canchas(nombre)')
        .eq('torneo_id', parsedTournamentId)
        .eq('jugador_id', currentUserId)
        .order('numero_ronda', { ascending: false })
        .limit(1);

      if (miasError) throw miasError;

      const mine = mias?.[0];

      if (!mine) {
        setRound(null);
        return;
      }

      let companeros: FlightPartner[] = [];

      if (mine.flight_numero != null) {
        const { data: flightRows, error: flightError } = await supabase
          .from('rondas_golf')
          .select('jugador_id, perfiles:jugador_id(id, nombre_completo, whatsapp)')
          .eq('torneo_id', parsedTournamentId)
          .eq('numero_ronda', mine.numero_ronda as number)
          .eq('flight_numero', mine.flight_numero as number)
          .neq('jugador_id', currentUserId);

        if (flightError) {
          console.error('[useGolfNextRound] Error cargando companeros de flight:', flightError);
        }

        companeros = (flightRows || []).map((row: any) => {
          const perfil = Array.isArray(row.perfiles) ? row.perfiles[0] : row.perfiles;
          const whatsapp = perfil?.whatsapp ? String(perfil.whatsapp) : null;
          return {
            id: String(perfil?.id ?? row.jugador_id),
            nombre_completo: String(perfil?.nombre_completo ?? 'Jugador'),
            whatsapp,
            whatsappLink: toWhatsAppLink(whatsapp),
          };
        });
      }

      const canchaRaw = (mine as any).canchas;
      const canchaNombre = Array.isArray(canchaRaw) ? canchaRaw[0]?.nombre ?? null : canchaRaw?.nombre ?? null;

      setRound({
        id: String(mine.id),
        torneoId: parsedTournamentId,
        canchaId: Number(mine.cancha_id),
        canchaNombre,
        numeroRonda: Number(mine.numero_ronda ?? 1),
        flightNumero: mine.flight_numero != null ? Number(mine.flight_numero) : null,
        estado: String(mine.estado ?? 'programada'),
        companeros,
      });
    } catch (err: any) {
      console.error('[useGolfNextRound] Error al cargar la ronda:', err);
      setError('No pudimos cargar tu proxima ronda. Verifica tu conexion.');
      setRound(null);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, enabled]);

  useEffect(() => {
    fetchRound();
  }, [fetchRound]);

  return { loading, round, error, refetch: fetchRound };
}
