import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { toWhatsAppLink } from '../utils/whatsapp';

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

export function useNextMatch(tournamentId: number | string, enabled: boolean = true): UseNextMatchResult {
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<NextMatch | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchNextMatch = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setMatch(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setMatch(null);

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
        setMatch(null);
        return;
      }

      const parsedTournamentId = Number(tournamentId);
      if (!Number.isFinite(parsedTournamentId)) {
        setError('ID de torneo invalido.');
        setMatch(null);
        return;
      }

      let scopeCategoria: string | null = null;
      let scopeGrupo: string | null = null;

      const { data: scopeRows } = await supabase
        .from('torneo_jugadores')
        .select('categoria, grupo')
        .eq('torneo_id', parsedTournamentId)
        .eq('perfil_id', currentUserId)
        .limit(1);

      const scopeRow = Array.isArray(scopeRows) ? scopeRows[0] : null;
      if (scopeRow?.categoria) scopeCategoria = String(scopeRow.categoria);
      if (scopeRow?.grupo) scopeGrupo = String(scopeRow.grupo);

      let next: any = null;

      let joinedQuery: any = supabase
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
        .in('estado', ['programado', 'en_curso', 'esperando_validacion'])
        .order('jornada', { ascending: true })
        .order('fecha_programada', { ascending: true, nullsFirst: false })
        .limit(1);

      if (scopeCategoria) joinedQuery = joinedQuery.eq('categoria', scopeCategoria);
      if (scopeGrupo) joinedQuery = joinedQuery.eq('grupo', scopeGrupo);

      const { data: matchRows, error: matchError } = await joinedQuery;

      if (!matchError) {
        next = Array.isArray(matchRows) ? (matchRows[0] as any) ?? null : null;
      }

      if (matchError) {
        // The joined query above can fail at runtime if the FK alias isn't resolved by
        // Supabase metadata. Fall back to a flat query so the hook always returns a result.
        let plainQuery: any = supabase
          .from('partidos')
          .select('id, jornada, estado, fecha_programada, torneo_id, jugador1_id, jugador2_id')
          .eq('torneo_id', parsedTournamentId)
          .or(`jugador1_id.eq.${currentUserId},jugador2_id.eq.${currentUserId}`)
          .in('estado', ['programado', 'en_curso', 'esperando_validacion'])
          .order('jornada', { ascending: true })
          .order('fecha_programada', { ascending: true, nullsFirst: false })
          .limit(1);

        if (scopeCategoria) plainQuery = plainQuery.eq('categoria', scopeCategoria);
        if (scopeGrupo) plainQuery = plainQuery.eq('grupo', scopeGrupo);

        const { data: plainRows, error: plainError } = await plainQuery;
        if (plainError) throw plainError;
        next = Array.isArray(plainRows) ? (plainRows[0] as any) ?? null : null;
      }

      // If group filter returned nothing, retry for bracket (playoff) matches which live in a separate group.
      if (!next && scopeGrupo) {
        let bracketQuery: any = supabase
          .from('partidos')
          .select(
            `id, jornada, estado, fecha_programada, torneo_id, jugador1_id, jugador2_id,
             jugador1:perfiles!jugador1_id(id, nombre_completo, whatsapp),
             jugador2:perfiles!jugador2_id(id, nombre_completo, whatsapp)`
          )
          .eq('torneo_id', parsedTournamentId)
          .or(`jugador1_id.eq.${currentUserId},jugador2_id.eq.${currentUserId}`)
          .in('estado', ['programado', 'en_curso', 'esperando_validacion'])
          .eq('bracket_tipo', 'eliminacion_directa')
          .order('jornada', { ascending: true })
          .limit(1);
        if (scopeCategoria) bracketQuery = bracketQuery.eq('categoria', scopeCategoria);
        const { data: bracketRows } = await bracketQuery;
        next = Array.isArray(bracketRows) ? (bracketRows[0] as any) ?? null : null;
      }

      if (!next) {
        setMatch(null);
        return;
      }

      const isCurrentUserJugador1 = String(next.jugador1_id) === currentUserId;
      const rivalJoinedRaw = isCurrentUserJugador1 ? next.jugador2 : next.jugador1;
      const rivalRow = Array.isArray(rivalJoinedRaw) ? rivalJoinedRaw[0] : rivalJoinedRaw;

      let rivalId = String(isCurrentUserJugador1 ? next.jugador2_id : next.jugador1_id);
      let rivalNombre = String(rivalRow?.nombre_completo ?? 'Rival por confirmar');
      let rivalWhatsapp = rivalRow?.whatsapp ? String(rivalRow.whatsapp) : null;

      if (!rivalRow?.id || (!rivalWhatsapp && rivalNombre === 'Rival por confirmar')) {
        const { data: rivalProfile, error: rivalError } = await supabase
          .from('perfiles')
          .select('id, nombre_completo, whatsapp')
          .eq('id', rivalId)
          .maybeSingle();

        if (!rivalError && rivalProfile) {
          rivalId = String(rivalProfile.id ?? rivalId);
          rivalNombre = String(rivalProfile.nombre_completo ?? rivalNombre);
          rivalWhatsapp = rivalProfile.whatsapp ? String(rivalProfile.whatsapp) : null;
        }
      }

      const rival: RivalProfile = {
        id: rivalId,
        nombre_completo: rivalNombre,
        whatsapp: rivalWhatsapp,
      };

      const whatsappLink = toWhatsAppLink(rival.whatsapp);

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
  }, [tournamentId, enabled]);

  useEffect(() => {
    fetchNextMatch();
  }, [fetchNextMatch]);

  return { loading, match, error, refetch: fetchNextMatch };
}
