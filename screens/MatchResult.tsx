import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { usePlayerTournamentStatus } from '../hooks/usePlayerTournamentStatus';

type ScoreState = {
  set1: { player1: number; player2: number };
  set2: { player1: number; player2: number };
  set3: { player1: number; player2: number };
};

type PlayerCard = {
  id: string;
  perfil_id: string;
  name: string;
  puntos: number;
  partidos_jugados: number;
  sets_ganados: number;
};

type MatchContext = {
  id: string;
  jornada: number;
  estado: string;
  jugador1_id: string;
  jugador2_id: string;
  resultado: string | null;
  set1_j1: number | null;
  set1_j2: number | null;
  set2_j1: number | null;
  set2_j2: number | null;
  set3_j1: number | null;
  set3_j2: number | null;
  bracket_tipo: string | null;
  stage_name: string | null;
  ronda: number | null;
};

type ProposalSets = {
  set1: { player1: number; player2: number };
  set2: { player1: number; player2: number };
  set3: { player1: number; player2: number };
};

type ProposalRpcRow = {
  partido_id: string;
  propuesta_id: string | null;
  estado_propuesta: 'pendiente' | 'confirmado' | 'discrepancia';
  partido_estado: string;
  coincidio: boolean;
  confirmacion_completa: boolean;
  mensaje: string;
};

type ProposalData = {
  estado: 'pendiente' | 'confirmado' | 'discrepancia';
  sets_json_j1: any;
  sets_json_j2: any;
  ultimo_cargado_por: string | null;
  debe_confirmar_por: string | null;  // NEW: who must confirm (source of truth)
};

type TournamentStats = {
  totalMatches: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  winRate: number;
};

const emptyScores: ScoreState = {
  set1: { player1: 0, player2: 0 },
  set2: { player1: 0, player2: 0 },
  set3: { player1: 0, player2: 0 },
};

const parseProposalSets = (raw: any): ProposalSets | null => {
  if (!Array.isArray(raw)) return null;
  return {
    set1: { player1: Number(raw[0]?.p1 || 0), player2: Number(raw[0]?.p2 || 0) },
    set2: { player1: Number(raw[1]?.p1 || 0), player2: Number(raw[1]?.p2 || 0) },
    set3: { player1: Number(raw[2]?.p1 || 0), player2: Number(raw[2]?.p2 || 0) },
  };
};

const MatchResult: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const savedTournament = localStorage.getItem('active_tournament');
  const tournament = location.state?.tournament || (savedTournament ? JSON.parse(savedTournament) : {
    id: 1,
    title: 'Abierto de Tenis TuBarrio',
    subtitle: 'Singles Caballeros',
  });

  const appUser = localStorage.getItem('app_user') ? JSON.parse(localStorage.getItem('app_user') as string) : null;
  const selectedPartidoId = location.state?.partidoId ? String(location.state.partidoId) : '';
  // Use empty string initially - will be set from Supabase auth in useEffect
  const [currentUserId, setCurrentUserId] = useState<string>('');

  const [players, setPlayers] = useState<PlayerCard[]>([
    { id: '', perfil_id: '', name: 'Jugador 1', puntos: 0, partidos_jugados: 0, sets_ganados: 0 },
    { id: '', perfil_id: '', name: 'Jugador 2', puntos: 0, partidos_jugados: 0, sets_ganados: 0 },
  ]);
  const [partido, setPartido] = useState<MatchContext | null>(null);
  const [scores, setScores] = useState<ScoreState>(emptyScores);
  const [loadingMatch, setLoadingMatch] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [proposalState, setProposalState] = useState<'idle' | 'pendiente' | 'confirmado' | 'discrepancia'>('idle');
  const [rivalProposalScores, setRivalProposalScores] = useState<ProposalSets | null>(null);
  const [hasOwnProposal, setHasOwnProposal] = useState(false);
  const [lastSubmittedBy, setLastSubmittedBy] = useState<string | null>(null);
  const [mustConfirmBy, setMustConfirmBy] = useState<string | null>(null);  // NEW: who must confirm (from DB)
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [tournamentStatus, setTournamentStatus] = useState<string>('RECRUITING');
  const [playoffsActiveNoMatch, setPlayoffsActiveNoMatch] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  const { loading: playerStatusLoading, status: playerStatus } = usePlayerTournamentStatus(tournament.id, currentUserId || undefined);
  const isChampion = playerStatus?.estado === 'campeon';
  const isFinalista = playerStatus?.estado === 'finalista';
  const isPlayerFinished = playerStatus?.estado === 'eliminado' || playerStatus?.estado === 'campeon' || playerStatus?.estado === 'finalista';
  const [showConfetti, setShowConfetti] = useState(false);
  useEffect(() => {
    if (isChampion) {
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 3200);
      return () => clearTimeout(t);
    }
  }, [isChampion]);
  const rawStats = playerStatus?.stats ?? null;
  const tournamentStats: TournamentStats | null = isPlayerFinished && rawStats && rawStats.total > 0 ? {
    totalMatches: rawStats.total,
    wins: rawStats.wins,
    losses: rawStats.losses,
    setsWon: rawStats.sets_won,
    setsLost: rawStats.sets_lost,
    winRate: rawStats.win_rate,
  } : null;

  const getSetWinner = (p1: number, p2: number) => {
    if ((p1 === 6 && p2 <= 4) || (p1 === 7 && (p2 === 5 || p2 === 6))) return 1;
    if ((p2 === 6 && p1 <= 4) || (p2 === 7 && (p1 === 5 || p1 === 6))) return 2;
    return null;
  };

  const getSuperTieBreakWinner = (p1: number, p2: number) => {
    if (p1 >= 10 && p1 - p2 >= 2) return 1;
    if (p2 >= 10 && p2 - p1 >= 2) return 2;
    return null;
  };

  const set1Winner = useMemo(() => getSetWinner(scores.set1.player1, scores.set1.player2), [scores.set1]);
  const set2Winner = useMemo(() => getSetWinner(scores.set2.player1, scores.set2.player2), [scores.set2]);
  const isDrawInSets = set1Winner !== null && set2Winner !== null && set1Winner !== set2Winner;
  const isMatchFinishedByTwoSets = set1Winner !== null && set2Winner !== null && set1Winner === set2Winner;

  const matchWinner = useMemo(() => {
    if (isMatchFinishedByTwoSets) return set1Winner;
    if (isDrawInSets) return getSuperTieBreakWinner(scores.set3.player1, scores.set3.player2);
    return null;
  }, [set1Winner, set2Winner, scores.set3, isMatchFinishedByTwoSets, isDrawInSets]);

  const isParticipant = useMemo(() => {
    return currentUserId !== '' && [players[0]?.perfil_id, players[1]?.perfil_id].includes(currentUserId);
  }, [currentUserId, players]);

  // Helper to order players: current user first, then opponent
  // This ensures the current user is always on the left/top in UI
  const orderedPlayers = useMemo(() => {
    if (!currentUserId || !players[0]?.perfil_id || !players[1]?.perfil_id) {
      return players; // Default order if we can't determine
    }
    // Check if current user is player 1
    const isUserPlayer1 = String(players[0].perfil_id).toLowerCase() === String(currentUserId).toLowerCase();
    if (isUserPlayer1) {
      return [players[0], players[1]]; // Current user is already first
    }
    // Current user is player 2, swap order
    return [players[1], players[0]];
  }, [currentUserId, players]);

  // Determine if current user is player 1 (for score mapping)
  const isCurrentUserPlayer1 = useMemo(() => {
    if (!currentUserId || !players[0]?.perfil_id) return true; // Default
    return String(players[0].perfil_id).toLowerCase() === String(currentUserId).toLowerCase();
  }, [currentUserId, players]);

  // Map match winner (1 or 2 referring to original players) to orderedPlayers index (0 or 1)
  // If user is player 1 and matchWinner is 1 -> winner is at orderedPlayers[0]
  // If user is player 2 and matchWinner is 1 -> winner is at orderedPlayers[1]
  const winnerOrderedIndex = useMemo(() => {
    if (!matchWinner) return null;
    if (isCurrentUserPlayer1) {
      // User is player 1, so matchWinner 1 -> index 0, matchWinner 2 -> index 1
      return matchWinner === 1 ? 0 : 1;
    } else {
      // User is player 2, so matchWinner 1 -> index 1, matchWinner 2 -> index 0
      return matchWinner === 1 ? 1 : 0;
    }
  }, [matchWinner, isCurrentUserPlayer1]);
  // OLD: const isPlayer2 = useMemo(() => currentUserId !== '' && currentUserId === partido?.jugador2_id, [currentUserId, partido?.jugador2_id]);
  // NEW: Use mustConfirmBy from database - this is the single source of truth
  const isMustConfirm = useMemo(() => {
    if (!mustConfirmBy || !currentUserId) return false;
    return String(mustConfirmBy).toLowerCase() === String(currentUserId).toLowerCase();
  }, [mustConfirmBy, currentUserId]);
  const isWaitingValidation = partido?.estado === 'esperando_validacion';
  const isScoreInputLocked = useMemo(() => isWaitingValidation || isSubmitting || loadingMatch || !isParticipant, [isWaitingValidation, isSubmitting, loadingMatch, isParticipant]);
  const canConfirm = useMemo(() => matchWinner !== null && Boolean(partido?.id) && isParticipant && !blockReason && !isWaitingValidation, [matchWinner, partido?.id, isParticipant, blockReason, isWaitingValidation]);
  const hasDbPlayers = useMemo(() => Boolean(players[0]?.perfil_id && players[1]?.perfil_id), [players]);
  const submitErrorUi = useMemo(() => {
    if (!submitError) return null;

    const normalized = submitError.toLowerCase();

    if (normalized.includes('esperando validacion')) {
      return {
        message: 'Este resultado ya fue enviado y esta esperando validacion del rival.',
        hint: 'No hace falta reenviar. Espera la confirmacion del Jugador 2.',
      };
    }

    if (normalized.includes('solo el jugador 2')) {
      return {
        message: 'Solo el Jugador 2 puede confirmar o rechazar este resultado.',
        hint: 'Ingresa con la cuenta del segundo jugador para validar el marcador.',
      };
    }

    if (normalized.includes('estado cambio')) {
      return {
        message: 'El partido se actualizo mientras estabas en pantalla.',
        hint: 'Recarga la vista para traer el estado mas reciente.',
      };
    }

    if (normalized.includes('no esta esperando validacion')) {
      return {
        message: 'Este partido ya no esta en etapa de validacion.',
        hint: 'Posiblemente ya fue confirmado o devuelto a programado.',
      };
    }

    if (normalized.includes('partido no encontrado')) {
      return {
        message: 'No encontramos el partido en la base de datos.',
        hint: 'Reintenta desde el listado de partidos del torneo.',
      };
    }

    if (normalized.includes('finalizado')) {
      return {
        message: 'Este partido ya esta finalizado y no se puede modificar.',
        hint: 'Puedes verlo en el historial o la tabla de posiciones.',
      };
    }

    return {
      message: submitError,
      hint: 'Si el problema continua, actualiza la pantalla e intentalo nuevamente.',
    };
  }, [submitError]);

  const updateScore = (set: keyof ScoreState, player: 'player1' | 'player2', delta: number) => {
    setScores((prev) => {
      const current = prev[set];
      const newP1 = player === 'player1' ? Math.max(0, current.player1 + delta) : current.player1;
      const newP2 = player === 'player2' ? Math.max(0, current.player2 + delta) : current.player2;

      if (set !== 'set3') {
        // Permite cargar valores intermedios (ej: 7-0, 6-6) para mejorar UX.
        // La validación "tenística" final la resuelve getSetWinner/matchWinner.
        if (newP1 > 7 || newP2 > 7) return prev;
        if (newP1 === 7 && newP2 === 7) return prev;
      }

      if (set === 'set3') {
        // For super tiebreak, only block if already won by 2 points after reaching 10
        const isSuperTiebreakFinished = 
          (current.player1 >= 10 && current.player1 - current.player2 >= 2) ||
          (current.player2 >= 10 && current.player2 - current.player1 >= 2);
        
        if (isSuperTiebreakFinished && delta > 0) return prev;
      }

      return { ...prev, [set]: { player1: newP1, player2: newP2 } };
    });
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: refreshData } = await (supabase as any).auth.refreshSession();
        const { data } = await (supabase as any).auth.getUser();
        
        if (data?.user?.id) {
          const authId = String(data.user.id).toLowerCase();
          const storedId = String(appUser?.id || '').toLowerCase();
          
          // Check for mismatch between stored and auth
          if (storedId && storedId !== authId) {
            localStorage.clear();
            localStorage.setItem('app_user', JSON.stringify({ 
              id: data.user.id, 
              email: data.user.email
            }));
            window.location.reload();
            return;
          }
          
          setCurrentUserId(String(data.user.id));
        }
      } catch (err) {
        console.error('Auth check error:', err);
      }
    };
    
    checkAuth();

    const { data: authListener } = (supabase as any).auth.onAuthStateChange(() => {});

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const loadMatchContext = async () => {
      // Don't load until we have a valid currentUserId from Supabase auth
      if (!currentUserId) {
        return;
      }
      setLoadingMatch(true);
      setSubmitError(null);
      setBlockReason(null);
      setPlayoffsActiveNoMatch(false);
      setRivalProposalScores(null);
      setHasOwnProposal(false);
      setLastSubmittedBy(null);
      setMustConfirmBy(null);

      try {
          if (!currentUserId) {
            setSubmitError('Hubo un error al identificar tu usuario. Volve a iniciar sesion e intenta nuevamente.');
          return;
        }

        let resolvedScope: { categoria: string; grupo: string } | null = null;

        const { data: playerScopeRows } = await supabase
          .from('torneo_jugadores')
          .select('categoria, grupo')
          .eq('torneo_id', tournament.id)
          .eq('perfil_id', currentUserId)
          .limit(1);

        const playerScope = Array.isArray(playerScopeRows) ? playerScopeRows[0] : null;
        if (playerScope?.categoria && playerScope?.grupo) {
          resolvedScope = {
            categoria: String(playerScope.categoria),
            grupo: String(playerScope.grupo),
          };
        }

        if (!resolvedScope) {
          const { data: inscriptionScopeRows } = await supabase
            .from('inscripciones_torneo')
            .select('categoria, grupo')
            .eq('torneo_id', tournament.id)
            .eq('perfil_id', currentUserId)
            .in('estado', ['pagado_aprobado', 'pendiente_revision'])
            .limit(1);

          const inscriptionScope = Array.isArray(inscriptionScopeRows) ? inscriptionScopeRows[0] : null;
          if (inscriptionScope?.categoria && inscriptionScope?.grupo) {
            resolvedScope = {
              categoria: String(inscriptionScope.categoria),
              grupo: String(inscriptionScope.grupo),
            };
          }
        }

        const categoria = resolvedScope?.categoria || tournament.subtitle || 'General';
        const grupo = resolvedScope?.grupo || null;

        let statusQuery: any = supabase
          .from('torneo_estado')
          .select('estado, categoria, grupo')
          .eq('torneo_id', tournament.id);

        if (resolvedScope?.categoria) statusQuery = statusQuery.eq('categoria', resolvedScope.categoria);
        if (resolvedScope?.grupo) statusQuery = statusQuery.eq('grupo', resolvedScope.grupo);

        const { data: statusRows, error: statusError } = await statusQuery.limit(1);
        const statusRow = Array.isArray(statusRows) ? statusRows[0] : null;

        if (statusError) throw statusError;

        const normalizedStatus = String(statusRow?.estado || 'RECRUITING').trim().toUpperCase();
        setTournamentStatus(normalizedStatus);

        if (normalizedStatus === 'FINALIZADO') {
          setPartido(null);
          setBlockReason('Este torneo ya finalizo. La carga de resultados esta cerrada y disponible solo para consulta.');
          return;
        }

        // Primero validamos si el torneo tiene suficientes inscriptos reales para habilitar la carga.
        let inscritosCategoriaQuery: any = supabase
          .from('torneo_jugadores')
          .select('id, perfil_id, puntos, partidos_jugados, sets_ganados')
          .eq('torneo_id', tournament.id)
          .eq('categoria', categoria);

        if (grupo) inscritosCategoriaQuery = inscritosCategoriaQuery.eq('grupo', grupo);

        const { data: inscritosCategoria, error: inscritosCategoriaError } = await inscritosCategoriaQuery;

        if (inscritosCategoriaError) throw inscritosCategoriaError;

        let inscritos = inscritosCategoria || [];

        if (inscritos.length === 0) {
          const { data: inscritosFallback, error: inscritosFallbackError } = await supabase
            .from('torneo_jugadores')
            .select('id, perfil_id, puntos, partidos_jugados, sets_ganados')
            .eq('torneo_id', tournament.id);

          if (inscritosFallbackError) throw inscritosFallbackError;
          inscritos = inscritosFallback || [];
        }

        const inscritosIds = inscritos.map((row: any) => row.perfil_id).filter(Boolean);
        const { data: perfilesInscritos, error: perfilesInscritosError } = await supabase
          .from('perfiles')
          .select('id, nombre_completo')
          .in('id', inscritosIds.length > 0 ? inscritosIds : ['00000000-0000-0000-0000-000000000000']);

        if (perfilesInscritosError) throw perfilesInscritosError;

        const nameByInscriptoId = Object.fromEntries((perfilesInscritos || []).map((row: any) => [row.id, row.nombre_completo || 'Jugador']));
        const ordenados = [...inscritos].sort((a: any, b: any) => String(a.perfil_id).localeCompare(String(b.perfil_id)));
        setEnrolledCount(ordenados.length);

        if (ordenados.length > 0) {
          const p1 = ordenados[0];
          const p2 = ordenados[1];
          setPlayers([
            {
              id: String(p1?.id || ''),
              perfil_id: String(p1?.perfil_id || ''),
              name: nameByInscriptoId[p1?.perfil_id] || 'Jugador 1',
              puntos: Number(p1?.puntos || 0),
              partidos_jugados: Number(p1?.partidos_jugados || 0),
              sets_ganados: Number(p1?.sets_ganados || 0),
            },
            {
              id: String(p2?.id || ''),
              perfil_id: String(p2?.perfil_id || ''),
              name: p2 ? (nameByInscriptoId[p2?.perfil_id] || 'Jugador 2') : 'Sin rival',
              puntos: Number(p2?.puntos || 0),
              partidos_jugados: Number(p2?.partidos_jugados || 0),
              sets_ganados: Number(p2?.sets_ganados || 0),
            },
          ]);
        }

        if (ordenados.length < 2) {
          setPartido(null);
          setSubmitError(null);
          setBlockReason(`Aun no se puede cargar resultados: hay ${ordenados.length} jugador(es) inscripto(s) y se necesitan al menos 2.`);
          return;
        }

        let partidoQuery: any = supabase
          .from('partidos')
          .select('id, jornada, estado, jugador1_id, jugador2_id, resultado, set1_j1, set1_j2, set2_j1, set2_j2, set3_j1, set3_j2, bracket_tipo, stage_name, ronda')
          .eq('torneo_id', tournament.id)
          .eq('categoria', categoria);

        if (grupo && !selectedPartidoId) partidoQuery = partidoQuery.eq('grupo', grupo);

        if (selectedPartidoId) {
          partidoQuery = partidoQuery.eq('id', selectedPartidoId);
        } else {
          partidoQuery = partidoQuery
            .or(`jugador1_id.eq.${currentUserId},jugador2_id.eq.${currentUserId}`)
            .in('estado', ['programado', 'en_curso', 'esperando_validacion'])
            .order('jornada', { ascending: true })
            .limit(1);
        }

        const { data: partidoRows, error: partidoError } = await partidoQuery;
        if (partidoError) throw partidoError;

        let targetPartido = Array.isArray(partidoRows) ? partidoRows[0] : null;

        // The group filter (grupo = TORNEO_X) misses playoff matches (grupo = TORNEO_X_PLAYOFFS).
        // If nothing found with the group filter, retry specifically for the user's bracket match.
        if (!targetPartido && grupo && !selectedPartidoId) {
          const { data: bracketRows, error: bracketError } = await supabase
            .from('partidos')
            .select('id, jornada, estado, jugador1_id, jugador2_id, resultado, set1_j1, set1_j2, set2_j1, set2_j2, set3_j1, set3_j2, bracket_tipo, stage_name, ronda')
            .eq('torneo_id', tournament.id)
            .eq('categoria', categoria)
            .eq('bracket_tipo', 'eliminacion_directa')
            .or(`jugador1_id.eq.${currentUserId},jugador2_id.eq.${currentUserId}`)
            .in('estado', ['programado', 'en_curso', 'esperando_validacion'])
            .order('jornada', { ascending: true })
            .limit(1);
          if (bracketError) throw bracketError;
          targetPartido = Array.isArray(bracketRows) ? bracketRows[0] : null;
        }

        if (!targetPartido) {
          setSubmitError(null);
          // Check if playoffs are active but user has no bracket match.
          // Must also verify the user isn't in any completed bracket match (e.g. won and waiting for next round).
          const [{ count: bracketCount }, { count: userBracketCount }] = await Promise.all([
            supabase
              .from('partidos')
              .select('id', { count: 'exact', head: true })
              .eq('torneo_id', tournament.id)
              .eq('bracket_tipo', 'eliminacion_directa'),
            supabase
              .from('partidos')
              .select('id', { count: 'exact', head: true })
              .eq('torneo_id', tournament.id)
              .eq('bracket_tipo', 'eliminacion_directa')
              .or(`jugador1_id.eq.${currentUserId},jugador2_id.eq.${currentUserId}`),
          ]);
          if ((bracketCount ?? 0) > 0 && (userBracketCount ?? 0) === 0) {
            setPlayoffsActiveNoMatch(true);
          } else {
            setBlockReason('Todavia no hay un partido generado para esta jornada.');
          }
          return;
        }

        setPartido({
          id: String(targetPartido.id),
          jornada: Number(targetPartido.jornada || 1),
          estado: String(targetPartido.estado || 'programado'),
          jugador1_id: String(targetPartido.jugador1_id),
          jugador2_id: String(targetPartido.jugador2_id),
          resultado: targetPartido.resultado || null,
          set1_j1: targetPartido.set1_j1 != null ? Number(targetPartido.set1_j1) : null,
          set1_j2: targetPartido.set1_j2 != null ? Number(targetPartido.set1_j2) : null,
          set2_j1: targetPartido.set2_j1 != null ? Number(targetPartido.set2_j1) : null,
          set2_j2: targetPartido.set2_j2 != null ? Number(targetPartido.set2_j2) : null,
          set3_j1: targetPartido.set3_j1 != null ? Number(targetPartido.set3_j1) : null,
          set3_j2: targetPartido.set3_j2 != null ? Number(targetPartido.set3_j2) : null,
          bracket_tipo: targetPartido.bracket_tipo || null,
          stage_name: targetPartido.stage_name || null,
          ronda: targetPartido.ronda != null ? Number(targetPartido.ronda) : null,
        });

        const playerIds = [targetPartido.jugador1_id, targetPartido.jugador2_id].filter(Boolean);
        const [{ data: jugadoresScoped, error: jugadoresScopedError }, { data: perfiles, error: perfilesError }, { data: propuesta }] = await Promise.all([
          (() => {
            let jugadoresScopedQuery: any = supabase
              .from('torneo_jugadores')
              .select('id, perfil_id, puntos, partidos_jugados, sets_ganados')
              .eq('torneo_id', tournament.id)
              .eq('categoria', categoria)
              .in('perfil_id', playerIds);

            if (grupo) jugadoresScopedQuery = jugadoresScopedQuery.eq('grupo', grupo);
            return jugadoresScopedQuery;
          })(),
          supabase
            .from('perfiles')
            .select('id, nombre_completo')
            .in('id', playerIds),
          supabase
            .from('torneo_propuestas_partido')
            .select('estado, sets_json_j1, sets_json_j2, ultimo_cargado_por, debe_confirmar_por')
            .eq('partido_id', targetPartido.id)
            .maybeSingle(),
        ]);

        if (jugadoresScopedError) throw jugadoresScopedError;
        if (perfilesError) throw perfilesError;

        let jugadores = jugadoresScoped || [];
        if (jugadores.length < 2) {
          const { data: jugadoresFallback, error: jugadoresFallbackError } = await supabase
            .from('torneo_jugadores')
            .select('id, perfil_id, puntos, partidos_jugados, sets_ganados')
            .eq('torneo_id', tournament.id)
            .in('perfil_id', playerIds);

          if (jugadoresFallbackError) throw jugadoresFallbackError;
          jugadores = jugadoresFallback || jugadores;
        }

        const playerByPerfilId = Object.fromEntries((jugadores || []).map((row: any) => [row.perfil_id, row]));
        const nameById = Object.fromEntries((perfiles || []).map((row: any) => [row.id, row.nombre_completo || 'Jugador']));

        setPlayers([
          {
            id: String(playerByPerfilId[targetPartido.jugador1_id]?.id || ''),
            perfil_id: String(targetPartido.jugador1_id),
            name: nameById[targetPartido.jugador1_id] || 'Jugador 1',
            puntos: Number(playerByPerfilId[targetPartido.jugador1_id]?.puntos || 0),
            partidos_jugados: Number(playerByPerfilId[targetPartido.jugador1_id]?.partidos_jugados || 0),
            sets_ganados: Number(playerByPerfilId[targetPartido.jugador1_id]?.sets_ganados || 0),
          },
          {
            id: String(playerByPerfilId[targetPartido.jugador2_id]?.id || ''),
            perfil_id: String(targetPartido.jugador2_id),
            name: nameById[targetPartido.jugador2_id] || 'Jugador 2',
            puntos: Number(playerByPerfilId[targetPartido.jugador2_id]?.puntos || 0),
            partidos_jugados: Number(playerByPerfilId[targetPartido.jugador2_id]?.partidos_jugados || 0),
            sets_ganados: Number(playerByPerfilId[targetPartido.jugador2_id]?.sets_ganados || 0),
          },
        ]);

        if (propuesta) {
          setProposalState(propuesta.estado || 'idle');
          setLastSubmittedBy(propuesta.ultimo_cargado_por ? String(propuesta.ultimo_cargado_por) : null);
          // NEW: Set who must confirm from database
          setMustConfirmBy(propuesta.debe_confirmar_por ? String(propuesta.debe_confirmar_por) : null);

          // Determine if current user submitted by comparing with ultimo_cargado_por
          const submittedByCurrentUser = String(propuesta.ultimo_cargado_por || '').toLowerCase() === String(currentUserId).toLowerCase();
          setHasOwnProposal(submittedByCurrentUser);

          const ownSetsRaw = submittedByCurrentUser
            ? (currentUserId === String(targetPartido.jugador1_id) ? propuesta.sets_json_j1 : propuesta.sets_json_j2)
            : null;
          const rivalSetsRaw = submittedByCurrentUser
            ? (currentUserId === String(targetPartido.jugador1_id) ? propuesta.sets_json_j2 : propuesta.sets_json_j1)
            : (currentUserId === String(targetPartido.jugador1_id) ? propuesta.sets_json_j2 : propuesta.sets_json_j1);

          const ownSets = parseProposalSets(ownSetsRaw);
          const rivalSets = parseProposalSets(rivalSetsRaw);

          if (ownSets) {
            setScores(ownSets);
          }

          if (rivalSets) {
            setRivalProposalScores(rivalSets);
          }
        }
      } catch (error) {
        console.error('No se pudo cargar el contexto del partido', error);
        setSubmitError('Hubo un error al cargar el partido. Intenta nuevamente en unos segundos.');
      } finally {
        setLoadingMatch(false);
      }
    };

    loadMatchContext();
  }, [currentUserId, selectedPartidoId, tournament.id, tournament.subtitle, retryTick]);

  const handleConfirm = async () => {
    if (!canConfirm || !partido?.id) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitMessage(null);

    try {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(String(currentUserId || ''))) {
        throw new Error('No pudimos validar tu sesion (usuario invalido). Volve a iniciar sesion para cargar resultados.');
      }

      const { data, error } = await supabase.rpc('enviar_resultado_seguro', {
        p_partido_id: partido.id,
        p_user_id: currentUserId,
        p_set1_j1: scores.set1.player1,
        p_set1_j2: scores.set1.player2,
        p_set2_j1: scores.set2.player1,
        p_set2_j2: scores.set2.player2,
        p_set3_j1: isDrawInSets ? scores.set3.player1 : null,
        p_set3_j2: isDrawInSets ? scores.set3.player2 : null,
      });

      if (error) throw error;

      const result = String(data || '');
      if (result !== 'OK') {
        setSubmitError(result || 'No se pudo enviar el resultado.');
        return;
      }

      setPartido((prev) => prev ? { ...prev, estado: 'esperando_validacion' } : prev);
      setHasOwnProposal(true);
      setLastSubmittedBy(String(currentUserId));
      setSubmitMessage('Resultado enviado. Esperando que tu rival confirme el marcador.');
      navigate('/tournament-panel', { state: { tournament } });
    } catch (error) {
      console.error('Error enviando el resultado', error);
      const anyErr: any = error as any;
      const message =
        (anyErr && typeof anyErr === 'object' && typeof anyErr.message === 'string' && anyErr.message.trim())
          ? anyErr.message
          : (anyErr && typeof anyErr === 'object' && typeof anyErr.error_description === 'string' && anyErr.error_description.trim())
            ? anyErr.error_description
            : (anyErr && typeof anyErr === 'object' && typeof anyErr.details === 'string' && anyErr.details.trim())
              ? anyErr.details
              : (anyErr && typeof anyErr === 'object')
                ? (() => {
                    try {
                      return JSON.stringify(anyErr);
                    } catch {
                      return String(anyErr);
                    }
                  })()
                : (error instanceof Error ? error.message : String(error || ''));

      setSubmitError(message || 'Hubo un error al enviar el resultado. Intenta nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmResult = async () => {
    if (!partido?.id) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const { data, error } = await supabase.rpc('validar_resultado_seguro', {
        p_partido_id: partido.id,
        p_user_id: currentUserId,
        p_accion: 'confirmar',
      });
      if (error) throw error;

      const result = String(data || '');
      if (result !== 'OK_CONFIRMADO') {
        setSubmitError(result || 'No se pudo confirmar el resultado.');
        return;
      }

      setPartido((prev) => prev ? { ...prev, estado: 'finalizado' } : prev);
      navigate('/tournament-panel', { state: { tournament } });
    } catch (error) {
      console.error('Error confirmando el resultado', error);
      setSubmitError('No se pudo confirmar el resultado. Intenta nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectResult = async () => {
    if (!partido?.id) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const { data, error } = await supabase.rpc('validar_resultado_seguro', {
        p_partido_id: partido.id,
        p_user_id: currentUserId,
        p_accion: 'rechazar',
      });
      if (error) throw error;

      const result = String(data || '');
      if (result !== 'OK_RECHAZADO') {
        setSubmitError(result || 'No se pudo rechazar el resultado.');
        return;
      }

      setPartido((prev) => prev ? {
        ...prev,
        estado: 'programado',
        set1_j1: null, set1_j2: null,
        set2_j1: null, set2_j2: null,
        set3_j1: null, set3_j2: null,
      } : prev);
      setSubmitMessage('Resultado rechazado. El partido vuelve a estado inicial para que se pongan de acuerdo.');
    } catch (error) {
      console.error('Error rechazando el resultado', error);
      setSubmitError('No se pudo rechazar el resultado. Intenta nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confettiParticles = [
    { left: '5%', delay: '0s', dur: '2.8s', color: '#13ec49' },
    { left: '10%', delay: '0.1s', dur: '3.1s', color: '#f59e0b' },
    { left: '18%', delay: '0.3s', dur: '2.6s', color: '#fff' },
    { left: '25%', delay: '0s', dur: '3.3s', color: '#13ec49' },
    { left: '33%', delay: '0.2s', dur: '2.9s', color: '#f59e0b' },
    { left: '40%', delay: '0.4s', dur: '3.0s', color: '#3b82f6' },
    { left: '48%', delay: '0.1s', dur: '2.7s', color: '#fff' },
    { left: '55%', delay: '0.3s', dur: '3.2s', color: '#13ec49' },
    { left: '62%', delay: '0s', dur: '2.8s', color: '#f59e0b' },
    { left: '70%', delay: '0.2s', dur: '3.1s', color: '#3b82f6' },
    { left: '77%', delay: '0.4s', dur: '2.6s', color: '#fff' },
    { left: '84%', delay: '0.1s', dur: '3.0s', color: '#13ec49' },
    { left: '90%', delay: '0.3s', dur: '2.9s', color: '#f59e0b' },
    { left: '95%', delay: '0s', dur: '3.3s', color: '#3b82f6' },
    { left: '15%', delay: '0.5s', dur: '2.7s', color: '#fff' },
    { left: '45%', delay: '0.6s', dur: '3.1s', color: '#13ec49' },
    { left: '72%', delay: '0.5s', dur: '2.8s', color: '#f59e0b' },
    { left: '88%', delay: '0.7s', dur: '3.0s', color: '#3b82f6' },
  ];

  return (
    <>
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          <style>{`
            @keyframes confettiFall {
              0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
              100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
            }
          `}</style>
          {confettiParticles.map((p, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: p.left,
                top: '-10px',
                width: i % 3 === 0 ? '10px' : '8px',
                height: i % 3 === 0 ? '10px' : '14px',
                backgroundColor: p.color,
                borderRadius: i % 2 === 0 ? '50%' : '2px',
                animation: `confettiFall ${p.dur} ${p.delay} ease-in forwards`,
              }}
            />
          ))}
        </div>
      )}
    <div className="max-w-2xl mx-auto min-h-full flex flex-col bg-background-light dark:bg-background-dark font-display pb-32 md:pb-12">
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-gray-100 dark:border-white/10 px-4 py-4 flex items-center justify-between">
        <div className="flex w-10 justify-start">
          <button
            onClick={() => navigate(-1)}
            className="flex size-10 items-center justify-center text-gray-800 dark:text-white hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
          >
            <span className="material-symbols-outlined text-3xl">chevron_left</span>
          </button>
        </div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">Carga de Resultados</h1>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 p-4 space-y-6">
        {partido && !playoffsActiveNoMatch && (
        <section className="bg-white dark:bg-white/5 rounded-xl shadow-sm overflow-hidden border border-gray-100 dark:border-white/10">
          <div className="p-4 bg-gradient-to-r from-primary/10 to-transparent">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{tournament.title} - {tournament.subtitle}</p>
            <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-300">
              <span>
                    {partido?.bracket_tipo === 'eliminacion_directa' && partido?.stage_name
                      ? partido.stage_name
                      : partido?.bracket_tipo === 'eliminacion_directa' && partido?.ronda
                      ? `Ronda ${partido.ronda}`
                      : `Jornada ${partido?.jornada || 1}`
                    }
                  </span>
              {!isWaitingValidation && <span className="font-bold uppercase">{partido?.estado || 'sin partido'}</span>}
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className={`flex flex-col items-center gap-2 flex-1 transition-all ${winnerOrderedIndex === 1 ? 'opacity-40' : ''}`}>
                <div className={`w-16 h-16 rounded-full ring-2 ${winnerOrderedIndex === 0 ? 'ring-primary' : 'ring-gray-200'} bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg font-bold uppercase transition-all`}>
                  {String(orderedPlayers[0]?.name || 'Jugador')
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((chunk) => chunk[0])
                    .join('') || 'J'}
                </div>
                <span className="text-sm font-bold text-gray-900 dark:text-white">{orderedPlayers[0].name}</span>
                {winnerOrderedIndex === 0 && <span className="bg-primary/20 text-green-700 dark:text-primary text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">GANADOR</span>}
              </div>
              <div className="flex flex-col items-center px-4"><span className="text-xs font-black text-gray-300 italic uppercase">VS</span></div>
              <div className={`flex flex-col items-center gap-2 flex-1 transition-all ${winnerOrderedIndex === 0 ? 'opacity-40' : ''}`}>
                <div className={`w-16 h-16 rounded-full ring-2 ${winnerOrderedIndex === 1 ? 'ring-primary' : 'ring-gray-200'} bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg font-bold uppercase`}>
                  {String(orderedPlayers[1]?.name || 'Jugador')
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((chunk) => chunk[0])
                    .join('') || 'J'}
                </div>
                <span className="text-sm font-bold text-gray-900 dark:text-white">{orderedPlayers[1].name}</span>
                {winnerOrderedIndex === 1 && <span className="bg-primary/20 text-green-700 dark:text-primary text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">GANADOR</span>}
              </div>
            </div>
          </div>
        </section>
        )}

        {/* Tournament Summary for eliminated/players without active matches */}
        {tournamentStats && !partido && !loadingMatch && !playoffsActiveNoMatch && (
          <div className="space-y-6">
            {/* Hero - Champion or Regular */}
            {isChampion ? (
              <div className="text-center bg-gradient-to-b from-amber-50 to-transparent dark:from-amber-900/30 p-6 rounded-2xl">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/40 shadow-lg shadow-amber-200/50 dark:shadow-amber-900/30 mb-3 animate-bounce">
                  <span className="material-symbols-outlined text-amber-500 text-5xl">emoji_events</span>
                </div>
                <h2 className="font-black text-3xl tracking-tight text-[#111813] dark:text-white uppercase">
                  ¡Campeón del Torneo!
                </h2>
                <p className="text-[#61896b] text-sm font-bold mt-2">
                  ¡Felicitaciones! Ganaste {tournament.title}
                </p>
              </div>
            ) : isFinalista ? (
              <div className="text-center bg-gradient-to-b from-indigo-50 to-transparent dark:from-indigo-900/20 p-6 rounded-2xl">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-indigo-100 dark:bg-indigo-900/40 shadow-lg shadow-indigo-200/50 dark:shadow-indigo-900/30 mb-3">
                  <span className="material-symbols-outlined text-indigo-500 text-5xl">military_tech</span>
                </div>
                <h2 className="font-black text-3xl tracking-tight text-[#111813] dark:text-white uppercase">
                  ¡Finalista!
                </h2>
                <p className="text-[#61896b] text-sm font-bold mt-2">
                  Llegaste a la Final de {tournament.title}
                </p>
              </div>
            ) : (
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#e8f6eb] dark:bg-[#1a3a22] shadow-sm mb-3">
                  <span className="material-symbols-outlined text-[#61896b] text-4xl">sports_tennis</span>
                </div>
                <h2 className="font-bold text-2xl tracking-tight text-[#111813] dark:text-white uppercase">
                  {tournamentStats.wins > tournamentStats.losses ? 'Gran Torneo' : 'Fin del Torneo'}
                </h2>
                <p className="text-[#61896b] text-sm font-medium mt-1">
                  Resumen de tu desempeño en {tournament.title}
                </p>
              </div>
            )}

            {/* Stats Cards */}
            <div className="space-y-3">
              {/* Partidos Jugados */}
              <div className="bg-white dark:bg-white/5 p-4 rounded-xl shadow-sm border border-[#dbe6de] dark:border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-lg bg-[#e8f6eb] dark:bg-[#1a3a22] flex items-center justify-center text-[#61896b]">
                    <span className="material-symbols-outlined">sports_tennis</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Partidos</p>
                    <p className="text-base font-bold text-[#111813] dark:text-white">{tournamentStats.totalMatches} Jugados</p>
                  </div>
                </div>
              </div>

              {/* Victorias */}
              <div className="bg-white dark:bg-white/5 p-4 rounded-xl shadow-sm border border-[#dbe6de] dark:border-white/10 flex items-center justify-between border-l-[5px] border-l-[#13ec49]">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-lg bg-[#e8f6eb] dark:bg-[#1a3a22] flex items-center justify-center text-[#61896b]">
                    <span className="material-symbols-outlined">emoji_events</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Victorias</p>
                    <p className="text-base font-bold text-[#111813] dark:text-white">{tournamentStats.wins} Victorias</p>
                  </div>
                </div>
                <div className="bg-[#e8f6eb] dark:bg-[#1a3a22] text-[#61896b] px-3 py-1 rounded-full text-xs font-bold">
                  {tournamentStats.winRate}% WR
                </div>
              </div>

              {/* Derrotas */}
              <div className="bg-white dark:bg-white/5 p-4 rounded-xl shadow-sm border border-[#dbe6de] dark:border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-lg bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-400">
                    <span className="material-symbols-outlined">close</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Derrotas</p>
                    <p className="text-base font-bold text-[#111813] dark:text-white">{tournamentStats.losses} Derrotas</p>
                  </div>
                </div>
              </div>

              {/* Sets */}
              <div className="bg-white dark:bg-white/5 p-4 rounded-xl shadow-sm border border-[#dbe6de] dark:border-white/10 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-lg bg-[#e8f6eb] dark:bg-[#1a3a22] flex items-center justify-center text-[#61896b]">
                      <span className="material-symbols-outlined">leaderboard</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Sets</p>
                      <p className="text-base font-bold text-[#111813] dark:text-white">{tournamentStats.setsWon}/{tournamentStats.setsWon + tournamentStats.setsLost} Ganados</p>
                    </div>
                  </div>
                </div>
                <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-[#13ec49] h-full transition-all"
                    style={{
                      width: `${tournamentStats.setsWon + tournamentStats.setsLost > 0
                        ? (tournamentStats.setsWon / (tournamentStats.setsWon + tournamentStats.setsLost)) * 100
                        : 0}%`
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Info note */}
            <div className="bg-[#e8f6eb] dark:bg-[#1a3a22] p-4 rounded-xl border border-[#dbe6de] dark:border-[#2a5a32] relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-10">
                <span className="material-symbols-outlined text-4xl">format_quote</span>
              </div>
              <h3 className="font-bold text-[#111813] dark:text-white tracking-tight uppercase mb-2 flex items-center gap-2 text-sm">
                <span className="material-symbols-outlined text-[#61896b]">info</span>
                {tournamentStatus === 'FINALIZADO' ? 'Torneo finalizado' : 'Eliminado de la competencia'}
              </h3>
              <p className="text-[#61896b] text-sm leading-relaxed">
                {tournamentStatus === 'FINALIZADO'
                  ? 'El torneo ha finalizado. Gracias por participar. Podés seguir viendo el fixture y los resultados en la pestaña Llaves.'
                  : 'No avanzaste a la siguiente ronda de esta competencia, pero podés seguir viendo los resultados del torneo y las llaves en la pestaña correspondiente.'}
              </p>
            </div>
          </div>
        )}

        {/* Playoff elimination notice */}
        {playoffsActiveNoMatch && !loadingMatch && !tournamentStats && (
          <section className="rounded-xl border-2 border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-700/40 p-6 text-center space-y-3">
            <div className="mx-auto size-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-amber-500 text-3xl">info</span>
            </div>
            <div>
              <h3 className="text-base font-black text-amber-800 dark:text-amber-300 uppercase tracking-wide">
                No clasificaste a los playoffs
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed mt-1">
                Los playoffs ya están en curso, pero no estás en la fase de eliminación directa. No tenés partidos pendientes.
              </p>
            </div>
            <button
              onClick={() => navigate('/standings', { state: { tournament } })}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-600 rounded-lg px-4 py-2 active:scale-95 transition-transform"
            >
              <span className="material-symbols-outlined text-base">emoji_events</span>
              Ver las Llaves
            </button>
          </section>
        )}

        {blockReason && !loadingMatch && !tournamentStats && !playerStatusLoading && !playoffsActiveNoMatch && (
          <section
            className={`rounded-xl border shadow-sm ${
              !partido
                ? 'p-6 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40 text-center'
                : 'p-4 bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-800/20 flex gap-3'
            }`}
          >
            {partido ? (
              <>
                <span className="material-symbols-outlined text-amber-500 text-lg">block</span>
                <div>
                  <p className="text-sm text-amber-800 dark:text-amber-200 font-bold">Carga deshabilitada</p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed font-medium">{blockReason}</p>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto mb-3 size-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-amber-600 dark:text-amber-300 text-2xl">event_busy</span>
                </div>
                <p className="text-lg text-amber-900 dark:text-amber-100 font-black">Todavia no hay partido generado</p>
                <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed font-semibold mt-1">Apenas se genere el cruce de esta jornada vas a poder cargar el resultado.</p>
              </>
            )}
          </section>
        )}

        {tournamentStatus === 'FINALIZADO' && !loadingMatch && !playoffsActiveNoMatch && (
          <section className="p-4 bg-slate-50 dark:bg-slate-900/20 rounded-xl border border-slate-200 dark:border-slate-700/30 flex gap-3 shadow-sm">
            <span className="material-symbols-outlined text-slate-500 text-lg">history</span>
            <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
              Torneo finalizado: los resultados quedan congelados para historial.
            </p>
          </section>
        )}

        {/* Error si el usuario no es participante del partido */}
        {!loadingMatch && !isParticipant && currentUserId && !playoffsActiveNoMatch && (
          <section className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800/30 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-red-500 text-lg flex-shrink-0">error</span>
              <div>
                <p className="text-sm font-bold text-red-800 dark:text-red-200">No sos participante de este partido</p>
                <p className="text-[11px] text-red-600 dark:text-red-300 mt-0.5">
                  Estás logueado como usuario {currentUserId?.slice(0,8)}..., pero este partido es entre:<br/>
                  • {players[0]?.name} ({partido?.jugador1_id?.slice(0,8)}...)<br/>
                  • {players[1]?.name} ({partido?.jugador2_id?.slice(0,8)}...)<br/>
                  <strong>Cerrá sesión y volvé a entrar con la cuenta correcta.</strong>
                </p>
                <button 
                  onClick={async () => {
                    await supabase.auth.signOut({ scope: 'global' });
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.href = '/#/login';
                  }}
                  className="mt-2 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors"
                >
                  Cerrar sesión
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Quien debe confirmar pero ya envió su propia propuesta - caso edge */}
        {isMustConfirm && isWaitingValidation && !loadingMatch && hasOwnProposal && lastSubmittedBy === currentUserId && !playoffsActiveNoMatch && (
          <section className="p-4 bg-sky-50 dark:bg-sky-900/10 rounded-xl border border-sky-200 dark:border-sky-800/30 flex gap-3 shadow-sm">
            <span className="material-symbols-outlined text-sky-500 text-lg flex-shrink-0">schedule</span>
            <div>
              <p className="text-sm font-bold text-sky-800 dark:text-sky-200">Resultado enviado</p>
              <p className="text-[11px] text-sky-600 dark:text-sky-300 mt-0.5">Esperando que tu rival envie su marcador para poder confirmarlo.</p>
            </div>
          </section>
        )}

        {/* Quien debe confirmar esperando carga del rival */}
        {isMustConfirm && isWaitingValidation && !loadingMatch && !hasOwnProposal && !rivalProposalScores && !playoffsActiveNoMatch && (
          <section className="p-4 bg-sky-50 dark:bg-sky-900/10 rounded-xl border border-sky-200 dark:border-sky-800/30 flex gap-3 shadow-sm">
            <span className="material-symbols-outlined text-sky-500 text-lg flex-shrink-0">schedule</span>
            <div>
              <p className="text-sm font-bold text-sky-800 dark:text-sky-200">Esperando la carga del rival</p>
              <p className="text-[11px] text-sky-600 dark:text-sky-300 mt-0.5">Tu rival todavia no envio su marcador para que puedas confirmarlo.</p>
            </div>
          </section>
        )}

        {/* Panel de confirmación para quien debe confirmar */}
        {isMustConfirm && isWaitingValidation && !loadingMatch && !hasOwnProposal && Boolean(rivalProposalScores) && lastSubmittedBy !== currentUserId && !playoffsActiveNoMatch && (
          <section className="space-y-4">
            <div className="p-4 bg-sky-50 dark:bg-sky-900/10 rounded-xl border border-sky-200 dark:border-sky-800/30 flex gap-3">
              <span className="material-symbols-outlined text-sky-500 text-lg flex-shrink-0">pending</span>
              <div>
                <p className="text-sm font-bold text-sky-800 dark:text-sky-200">Resultado propuesto por tu rival</p>
                <p className="text-[11px] text-sky-600 dark:text-sky-300 mt-0.5">Revisá el marcador y confirmá si es correcto.</p>
              </div>
            </div>

            <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 shadow-sm overflow-hidden">
              <div className="p-4 space-y-1">
                {(() => {
                  // Calculate sets won by each player from the proposal
                  let userSetsWon = 0;
                  let rivalSetsWon = 0;
                  
                  const setResults = [
                    { 
                      label: 'Set 1', 
                      userScore: isCurrentUserPlayer1 ? (rivalProposalScores?.set1.player1 ?? partido?.set1_j1) : (rivalProposalScores?.set1.player2 ?? partido?.set1_j2),
                      rivalScore: isCurrentUserPlayer1 ? (rivalProposalScores?.set1.player2 ?? partido?.set1_j2) : (rivalProposalScores?.set1.player1 ?? partido?.set1_j1)
                    },
                    { 
                      label: 'Set 2', 
                      userScore: isCurrentUserPlayer1 ? (rivalProposalScores?.set2.player1 ?? partido?.set2_j1) : (rivalProposalScores?.set2.player2 ?? partido?.set2_j2),
                      rivalScore: isCurrentUserPlayer1 ? (rivalProposalScores?.set2.player2 ?? partido?.set2_j2) : (rivalProposalScores?.set2.player1 ?? partido?.set2_j1)
                    },
                    ...((rivalProposalScores
                      ? (rivalProposalScores.set3.player1 > 0 || rivalProposalScores.set3.player2 > 0)
                      : partido?.set3_j1 != null)
                      ? [{ 
                          label: 'Set 3 (TB)', 
                          userScore: isCurrentUserPlayer1 ? (rivalProposalScores?.set3.player1 ?? partido?.set3_j1) : (rivalProposalScores?.set3.player2 ?? partido?.set3_j2),
                          rivalScore: isCurrentUserPlayer1 ? (rivalProposalScores?.set3.player2 ?? partido?.set3_j2) : (rivalProposalScores?.set3.player1 ?? partido?.set3_j1)
                        }]
                      : []),
                  ];
                  
                  // Count sets won
                  setResults.forEach(({ userScore, rivalScore }) => {
                    if (userScore > rivalScore) userSetsWon++;
                    else if (rivalScore > userScore) rivalSetsWon++;
                  });
                  
                  const proposalWinnerIndex = userSetsWon > rivalSetsWon ? 0 : rivalSetsWon > userSetsWon ? 1 : null;
                  
                  return (
                    <>
                      {setResults.map(({ label, userScore, rivalScore }) => (
                        <div key={label} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-white/5 last:border-0">
                          <span className="text-xs font-bold text-gray-400 uppercase w-20">{label}</span>
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col items-end max-w-[140px]">
                              <span className="text-sm font-black text-gray-500 dark:text-gray-400 text-right break-words leading-tight">{orderedPlayers[0].name}</span>
                              {proposalWinnerIndex === 0 && <span className="mt-0.5 bg-primary/20 text-green-700 dark:text-primary text-[9px] px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">GANADOR</span>}
                            </div>
                            <span className="text-2xl font-black text-primary">{userScore ?? '-'}</span>
                            <span className="text-xs text-gray-300">—</span>
                            <span className="text-2xl font-black text-primary">{rivalScore ?? '-'}</span>
                            <div className="flex flex-col items-start max-w-[140px]">
                              <span className="text-sm font-black text-gray-500 dark:text-gray-400 break-words leading-tight">{orderedPlayers[1].name}</span>
                              {proposalWinnerIndex === 1 && <span className="mt-0.5 bg-primary/20 text-green-700 dark:text-primary text-[9px] px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">GANADOR</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={handleRejectResult}
                disabled={isSubmitting}
                className="flex items-center justify-center gap-2 py-4 rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-300 font-bold text-sm transition-all active:scale-[0.98] hover:bg-red-100 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-lg">close</span>
                Rechazar
              </button>
              <button
                onClick={handleConfirmResult}
                disabled={isSubmitting}
                className="flex items-center justify-center gap-2 py-4 rounded-xl bg-primary text-gray-900 font-bold text-sm shadow-lg shadow-primary/30 transition-all active:scale-[0.98] hover:brightness-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? <span className="w-5 h-5 border-2 border-gray-700/40 border-t-gray-900 rounded-full animate-spin"></span> : <span className="material-symbols-outlined text-lg">check</span>}
                Confirmar
              </button>
            </div>
          </section>
        )}

        {/* Mostrar controles de score solo si no estamos esperando validacion y no hay resumen de torneo */}
        {!blockReason && !isWaitingValidation && !tournamentStats && !playoffsActiveNoMatch && (
          <div className={`space-y-4 ${isScoreInputLocked ? 'opacity-70' : ''}`}>
          {(['set1', 'set2'] as const).map((setKey, idx) => {
            const isComplete = getSetWinner(scores[setKey].player1, scores[setKey].player2) !== null;
            return (
              <div key={setKey} className={`bg-white dark:bg-white/5 p-4 rounded-xl shadow-sm border transition-colors ${isComplete ? 'border-primary/40' : 'border-gray-100 dark:border-white/10'}`}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">Set {idx + 1}</h3>
                  {isComplete && <span className="material-symbols-outlined text-primary text-sm">check_circle</span>}
                </div>
                <div className="space-y-4">
                  {[0, 1].map((playerIndex) => {
                    // Map ordered player index to actual player key
                    const pKey = (isCurrentUserPlayer1 && playerIndex === 0) || (!isCurrentUserPlayer1 && playerIndex === 1) 
                      ? 'player1' 
                      : 'player2';
                    return (
                      <div key={playerIndex} className="flex items-center justify-between">
                        <span className="text-gray-700 dark:text-gray-300 font-medium">{orderedPlayers[playerIndex].name}</span>
                        <div className="flex items-center gap-3">
                          <button disabled={isScoreInputLocked} onClick={() => updateScore(setKey, pKey, -1)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-600 dark:text-gray-300 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed">-</button>
                          <span className="text-xl font-black text-gray-900 dark:text-white w-6 text-center">{scores[setKey][pKey]}</span>
                          <button disabled={isScoreInputLocked} onClick={() => updateScore(setKey, pKey, 1)} className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-black font-bold active:scale-90 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className={`transition-all duration-500 transform ${isDrawInSets ? 'opacity-100 translate-y-0 scale-100' : 'opacity-30 scale-95 pointer-events-none'}`}>
            <div className={`bg-white dark:bg-white/5 p-4 rounded-xl shadow-sm border-2 ${getSuperTieBreakWinner(scores.set3.player1, scores.set3.player2) ? 'border-primary' : 'border-primary/20'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">Set 3 (Desempate)</h3>
                  <p className="text-[10px] text-primary font-bold">Super Tie-break a 10 puntos</p>
                </div>
                <span className="material-symbols-outlined text-primary">info</span>
              </div>
              <div className="space-y-4">
                {[0, 1].map((playerIndex) => {
                  const pKey = (isCurrentUserPlayer1 && playerIndex === 0) || (!isCurrentUserPlayer1 && playerIndex === 1) 
                    ? 'player1' 
                    : 'player2';
                  return (
                    <div key={playerIndex} className="flex items-center justify-between">
                      <span className="text-gray-700 dark:text-gray-300 font-medium">{orderedPlayers[playerIndex].name}</span>
                      <div className="flex items-center gap-3">
                        <button disabled={isScoreInputLocked} onClick={() => updateScore('set3', pKey, -1)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-600 dark:text-gray-300 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed">-</button>
                        <input
                          disabled={isScoreInputLocked}
                          className="text-xl font-black text-gray-900 dark:text-white w-12 text-center bg-transparent border-none focus:ring-0 p-0"
                          type="number"
                          value={scores.set3[pKey]}
                          onChange={(e) => setScores((prev) => ({ ...prev, set3: { ...prev.set3, [pKey]: parseInt(e.target.value, 10) || 0 } }))}
                        />
                        <button disabled={isScoreInputLocked} onClick={() => updateScore('set3', pKey, 1)} className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-black font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          </div>
        )}

        {loadingMatch && (
          <div className="p-4 bg-slate-50 dark:bg-slate-900/20 rounded-xl border border-slate-100 dark:border-slate-800/20 flex gap-3 shadow-sm">
            <span className="material-symbols-outlined text-slate-500 text-lg">hourglass_top</span>
            <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed font-medium">Buscando tu partido pendiente dentro de este torneo.</p>
          </div>
        )}

        {!canConfirm && !loadingMatch && !blockReason && !isWaitingValidation && !tournamentStats && !playoffsActiveNoMatch && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-800/20 flex gap-3 shadow-sm animate-pulse">
            <span className="material-symbols-outlined text-amber-500 text-lg">info</span>
            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed font-medium">Por favor completa los sets con resultados validos para poder enviar el partido.</p>
          </div>
        )}

        {!hasDbPlayers && !loadingMatch && !blockReason && !playoffsActiveNoMatch && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-800/20 flex gap-3 shadow-sm">
            <span className="material-symbols-outlined text-amber-500 text-lg">warning</span>
            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed font-medium">No pudimos resolver los dos perfiles del partido. Reintenta en unos segundos.</p>
          </div>
        )}

        {!isParticipant && !loadingMatch && !submitError && !playoffsActiveNoMatch && (
          <div className="p-4 bg-slate-50 dark:bg-slate-900/20 rounded-xl border border-slate-100 dark:border-slate-800/20 flex gap-3 shadow-sm">
            <span className="material-symbols-outlined text-slate-500 text-lg">visibility</span>
            <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed font-medium">Estas viendo el detalle de un partido, pero solo sus jugadores pueden enviar o confirmar el resultado.</p>
          </div>
        )}

        {proposalState === 'pendiente' && submitMessage && !submitError && !isWaitingValidation && !playoffsActiveNoMatch && (
          <div className="p-4 bg-sky-50 dark:bg-sky-900/10 rounded-xl border border-sky-100 dark:border-sky-800/20 flex gap-3 shadow-sm">
            <span className="material-symbols-outlined text-sky-500 text-lg">schedule</span>
            <p className="text-[11px] text-sky-700 dark:text-sky-300 leading-relaxed font-medium">{submitMessage}</p>
          </div>
        )}

        {/* Resultado enviado por este usuario - esperando confirmacion del rival */}
        {isWaitingValidation && !isMustConfirm && !loadingMatch && !playoffsActiveNoMatch && (
          <section className="p-5 bg-sky-50 dark:bg-sky-900/10 rounded-2xl border border-sky-200 dark:border-sky-800/30 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="size-11 rounded-xl bg-sky-100 dark:bg-sky-900/20 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-sky-600 dark:text-sky-300 text-2xl">schedule</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-black text-sky-900 dark:text-sky-100">Resultado enviado correctamente</p>
                <p className="mt-1 text-[11px] text-sky-700 dark:text-sky-300 leading-relaxed font-medium">
                  Esperando a que tu rival lo confirme.
                </p>
              </div>
            </div>
          </section>
        )}

        {submitError && submitErrorUi && !playoffsActiveNoMatch && (
          <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-800/20 flex gap-3 shadow-sm">
            <span className="material-symbols-outlined text-red-500 text-lg">error</span>
            <div className="flex-1">
              <p className="text-[11px] text-red-700 dark:text-red-300 leading-relaxed font-bold">{submitErrorUi.message}</p>
              <p className="text-[11px] mt-1 text-red-700/80 dark:text-red-300/80 leading-relaxed font-medium">{submitErrorUi.hint}</p>
              {!isSubmitting && (
                <button
                  onClick={() => setRetryTick((prev) => prev + 1)}
                  className="mt-2 text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300 underline"
                >
                  Reintentar carga
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {!isWaitingValidation && !playoffsActiveNoMatch && (
      <footer className="fixed bottom-0 left-0 right-0 md:static max-w-2xl mx-auto p-6 bg-gradient-to-t from-background-light dark:from-background-dark to-transparent z-[60] md:bg-none">
        <button
          onClick={handleConfirm}
          disabled={!canConfirm || !hasDbPlayers || isSubmitting || loadingMatch}
          className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${
            canConfirm && hasDbPlayers && !isSubmitting && !loadingMatch
              ? 'bg-primary text-gray-900 shadow-primary/30 active:scale-[0.98]'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'
          }`}
        >
          {isSubmitting && <span className="w-4 h-4 border-2 border-gray-400 border-t-gray-700 rounded-full animate-spin"></span>}
          <span>{isSubmitting ? 'Enviando...' : 'Enviar Resultado'}</span>
          {!isSubmitting && <span className="material-symbols-outlined text-xl">send</span>}
        </button>
      </footer>
      )}
    </div>
    </>
  );
};

export default MatchResult;
