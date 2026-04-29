import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { usePlayerTournamentStatus } from '../hooks/usePlayerTournamentStatus';
import BracketTab from '../components/BracketTab';

type FixturePlayer = {
  perfil_id: string;
  nombre: string;
  whatsapp: string | null;
  puntos: number;
  partidos_jugados: number;
  sets_ganados: number;
};

type FixtureMatch = {
  id: string;
  jornada: number;
  estado: string;
  resultado: string | null;
  proposalState: string | null;
  p1: FixturePlayer;
  p2: FixturePlayer;
  finalScore: {
    sets_jugador1: number;
    sets_jugador2: number;
    ganador_perfil_id: string | null;
  } | null;
  gameDetails: Array<{
    p1: number;
    p2: number;
    tb?: number;
  }> | null;
};

const parseResultadoSets = (resultado: string | null): { sets_jugador1: number; sets_jugador2: number } | null => {
  if (!resultado) return null;
  const match = resultado.match(/(\d+)\s*[-:]\s*(\d+)/);
  if (!match) return null;
  return {
    sets_jugador1: Number(match[1] || 0),
    sets_jugador2: Number(match[2] || 0),
  };
};

const parseSetJsonToGames = (setsJson: any): Array<{ p1: number; p2: number; tb?: number }> | null => {
  if (!Array.isArray(setsJson)) return null;
  return setsJson.map((set: any) => ({
    p1: Number(set?.p1 || 0),
    p2: Number(set?.p2 || 0),
    tb: set?.tb !== undefined && set?.tb !== null ? Number(set.tb) : undefined,
  }));
};

const formatGameScore = (games: Array<{ p1: number; p2: number; tb?: number }> | null): string => {
  if (!games || games.length === 0) return '';
  const formatted = games
    .filter((g) => g.p1 > 0 || g.p2 > 0)
    .map((g) => {
      if (g.tb !== undefined) {
        return `${Math.max(g.p1, g.p2)}-${Math.min(g.p1, g.p2)}(${g.tb})`;
      }
      return `${g.p1}-${g.p2}`;
    })
    .join(' | ');
  return formatted;
};

const formatGroupName = (groupCode: string): string => {
  if (!groupCode) return '';
  const match = groupCode.match(/_G(\d+)$/);
  if (match) {
    return `Grupo ${parseInt(match[1], 10)}`;
  }
  return 'Grupo 1';
};

const resolveWinnerId = (
  ganadorId: string | null | undefined,
  p1Id: string,
  p2Id: string,
  setsJugador1: number,
  setsJugador2: number,
): string | null => {
  if (ganadorId) return String(ganadorId);
  if (setsJugador1 > setsJugador2) return p1Id;
  if (setsJugador2 > setsJugador1) return p2Id;
  return null;
};

const Fixture: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const appUser = localStorage.getItem('app_user') ? JSON.parse(localStorage.getItem('app_user') as string) : null;
  const [activeFecha, setActiveFecha] = useState(0); // 0=Todas, -1=LLAVES, >0=Jornada específica
  const [playersStats, setPlayersStats] = useState<FixturePlayer[]>([]);
  const [matches, setMatches] = useState<FixtureMatch[]>([]);
  const [torneoFinalizado, setTorneoFinalizado] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>(String(appUser?.id || ''));
  const [availableGroups, setAvailableGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const isLoadingRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);

  const savedTournament = localStorage.getItem('active_tournament');
  const tournament = location.state?.tournament || (savedTournament ? JSON.parse(savedTournament) : {
    id: 1,
    title: 'Abierto de Tenis TuBarrio',
    subtitle: 'Singles Caballeros',
  });

  const { loading: nextMatchLoading, status: playerStatus } = usePlayerTournamentStatus(tournament.id, currentUserId || undefined);
  const nextMatch = playerStatus?.proximo_partido ?? null;
  const nextMatchError = null;
  const isEliminated = playerStatus?.estado === 'eliminado';
  const refetchNextMatch = () => {};

  useEffect(() => {
    (supabase as any).auth.getUser().then(({ data }: any) => {
      if (data?.user?.id) setCurrentUserId(String(data.user.id));
    }).catch(() => {});
  }, []);


  const loadFixtureData = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    try {
      const parsedTournamentId = Number(tournament.id);
      if (!Number.isFinite(parsedTournamentId)) {
        throw new Error('ID de torneo invalido.');
      }

      let resolvedScope: { categoria: string; grupo: string } | null = null;

      if (currentUserId) {
        const { data: playerScopeRows } = await supabase
          .from('torneo_jugadores')
          .select('categoria, grupo')
          .eq('torneo_id', parsedTournamentId)
          .eq('perfil_id', currentUserId)
          .limit(1);

        const playerScope = Array.isArray(playerScopeRows) ? playerScopeRows[0] : null;
        if (playerScope?.categoria && playerScope?.grupo) {
          resolvedScope = {
            categoria: String(playerScope.categoria),
            grupo: String(playerScope.grupo),
          };
        }
      }

      if (!resolvedScope && currentUserId) {
        const { data: inscriptionScopeRows } = await supabase
          .from('inscripciones_torneo')
          .select('categoria, grupo')
          .eq('torneo_id', parsedTournamentId)
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

      const targetCategory = String(resolvedScope?.categoria || tournament.subtitle || '').trim();
      let groupsQuery: any = supabase
        .from('torneo_estado')
        .select('grupo, categoria')
        .eq('torneo_id', parsedTournamentId);
      if (targetCategory) groupsQuery = groupsQuery.eq('categoria', targetCategory);
      const { data: groupsRows } = await groupsQuery;
      const groups = Array.from(
        new Set(
          (groupsRows || [])
            .map((row: any) => String(row?.grupo || '').trim())
            .filter(Boolean)
        )
      ).sort((a: string, b: string) => a.localeCompare(b));
      setAvailableGroups(groups);
      
      // Set selectedGroup immediately if we have a resolved scope
      const initialSelectedGroup = selectedGroup || (resolvedScope?.grupo && groups.includes(String(resolvedScope.grupo)) ? String(resolvedScope.grupo) : '');
      if (initialSelectedGroup && !selectedGroup) {
        setSelectedGroup(initialSelectedGroup);
      }

      const effectiveGroup = initialSelectedGroup || resolvedScope?.grupo || '';
      const hasMultipleGroups = groups.length > 1;

      let partidosScopeQuery: any = supabase
        .from('partidos')
        .select('id, jornada, estado, resultado, ganador_id, jugador1_id, jugador2_id, categoria, grupo')
        .eq('torneo_id', parsedTournamentId)
        .is('bracket_tipo', null)
        .order('jornada', { ascending: true })
        .order('fecha_programada', { ascending: true, nullsFirst: false });

      if (resolvedScope?.categoria) partidosScopeQuery = partidosScopeQuery.eq('categoria', resolvedScope.categoria);
      if (initialSelectedGroup) {
        partidosScopeQuery = partidosScopeQuery.eq('grupo', initialSelectedGroup);
      } else if (effectiveGroup && !hasMultipleGroups) {
        partidosScopeQuery = partidosScopeQuery.eq('grupo', effectiveGroup);
      }

      const viewingOwnGroup = Boolean(resolvedScope?.grupo && effectiveGroup && resolvedScope.grupo === effectiveGroup);
      if (currentUserId && viewingOwnGroup && !hasMultipleGroups) {
        partidosScopeQuery = partidosScopeQuery.or(`jugador1_id.eq.${currentUserId},jugador2_id.eq.${currentUserId}`);
      }

      const { data: partidosScopeRows, error: partidosScopeError } = await partidosScopeQuery;
      if (partidosScopeError) throw partidosScopeError;

      const firstMatch = Array.isArray(partidosScopeRows) ? partidosScopeRows[0] : null;
      if (!resolvedScope && firstMatch?.categoria && firstMatch?.grupo) {
        resolvedScope = {
          categoria: String(firstMatch.categoria),
          grupo: String(firstMatch.grupo),
        };
      }

      let jugadoresQuery: any = supabase
        .from('torneo_jugadores')
        .select('perfil_id, puntos, partidos_jugados, sets_ganados')
        .eq('torneo_id', parsedTournamentId);

      if (resolvedScope?.categoria) jugadoresQuery = jugadoresQuery.eq('categoria', resolvedScope.categoria);
      if (initialSelectedGroup) {
        jugadoresQuery = jugadoresQuery.eq('grupo', initialSelectedGroup);
      } else if (effectiveGroup && !hasMultipleGroups) {
        jugadoresQuery = jugadoresQuery.eq('grupo', effectiveGroup);
      }

      let partidosQuery: any = supabase
        .from('partidos')
        .select('id, jornada, estado, resultado, ganador_id, jugador1_id, jugador2_id')
        .eq('torneo_id', parsedTournamentId)
        .is('bracket_tipo', null)
        .order('jornada', { ascending: true })
        .order('fecha_programada', { ascending: true, nullsFirst: false });

      if (resolvedScope?.categoria) partidosQuery = partidosQuery.eq('categoria', resolvedScope.categoria);
      if (initialSelectedGroup) {
        partidosQuery = partidosQuery.eq('grupo', initialSelectedGroup);
      } else if (effectiveGroup && !hasMultipleGroups) {
        partidosQuery = partidosQuery.eq('grupo', effectiveGroup);
      }

      let historialQuery: any = supabase
        .from('torneo_partidos_historial')
        .select('partido_id, sets_jugador1, sets_jugador2, ganador_perfil_id')
        .eq('torneo_id', parsedTournamentId);

      if (resolvedScope?.categoria) historialQuery = historialQuery.eq('categoria', resolvedScope.categoria);
      if (initialSelectedGroup) {
        historialQuery = historialQuery.eq('grupo', initialSelectedGroup);
      } else if (effectiveGroup) {
        historialQuery = historialQuery.eq('grupo', effectiveGroup);
      }

      let propuestasQuery: any = supabase
        .from('torneo_propuestas_partido')
        .select('partido_id, estado')
        .eq('torneo_id', parsedTournamentId);

      if (resolvedScope?.categoria) propuestasQuery = propuestasQuery.eq('categoria', resolvedScope.categoria);
      if (initialSelectedGroup) {
        propuestasQuery = propuestasQuery.eq('grupo', initialSelectedGroup);
      } else if (effectiveGroup && !hasMultipleGroups) {
        propuestasQuery = propuestasQuery.eq('grupo', effectiveGroup);
      }

      const [estadoResp, jugadoresResp, partidosResp, historialResp, propuestasResp] = await Promise.all([
        supabase
          .from('torneo_estado')
          .select('estado, categoria, grupo')
          .eq('torneo_id', parsedTournamentId),
        jugadoresQuery,
        partidosQuery,
        historialQuery,
        propuestasQuery,
      ]);

          if (estadoResp.error) throw estadoResp.error;
      if (jugadoresResp.error) throw jugadoresResp.error;
      if (partidosResp.error) throw partidosResp.error;
      if (historialResp.error) throw historialResp.error;
      if (propuestasResp.error) throw propuestasResp.error;

      const estadoRows = Array.isArray(estadoResp.data) ? estadoResp.data : [];
      const estadoNormalizado = (effectiveGroup
        ? String(
            estadoRows.find(
              (row: any) =>
                String(row?.categoria || '') === resolvedScope?.categoria &&
                String(row?.grupo || '') === effectiveGroup
            )?.estado || ''
          )
        : String(estadoRows[0]?.estado || '')
      ).trim().toUpperCase();
      setTorneoFinalizado(estadoNormalizado === 'FINALIZADO');

      const jugadores = jugadoresResp.data || [];
      const partidos = partidosResp.data || [];
      const historial = historialResp.data || [];
      const propuestas = propuestasResp.data || [];

      const jugadoresByPerfil = new Map<string, any>();
      for (const row of jugadores) {
        const perfilId = String(row?.perfil_id || '');
        if (!perfilId) continue;
        const prev = jugadoresByPerfil.get(perfilId);
        if (!prev) {
          jugadoresByPerfil.set(perfilId, row);
          continue;
        }
        jugadoresByPerfil.set(perfilId, {
          ...prev,
          puntos: Math.max(Number(prev.puntos || 0), Number(row.puntos || 0)),
          partidos_jugados: Math.max(Number(prev.partidos_jugados || 0), Number(row.partidos_jugados || 0)),
          sets_ganados: Math.max(Number(prev.sets_ganados || 0), Number(row.sets_ganados || 0)),
        });
      }

      let jugadoresNormalizados = Array.from(jugadoresByPerfil.values());

      if (jugadoresNormalizados.length < 2 && partidos.length > 0) {
        const partidoPlayerIds = Array.from(new Set(
          partidos
            .flatMap((row: any) => [row.jugador1_id, row.jugador2_id])
            .filter(Boolean)
            .map((id: any) => String(id))
        ));

        if (partidoPlayerIds.length > 0) {
          let jugadoresFallbackQuery: any = supabase
            .from('torneo_jugadores')
            .select('perfil_id, puntos, partidos_jugados, sets_ganados')
            .eq('torneo_id', parsedTournamentId)
            .in('perfil_id', partidoPlayerIds);
          
          if (resolvedScope?.categoria) jugadoresFallbackQuery = jugadoresFallbackQuery.eq('categoria', resolvedScope.categoria);
          if (initialSelectedGroup) {
            jugadoresFallbackQuery = jugadoresFallbackQuery.eq('grupo', initialSelectedGroup);
          } else if (effectiveGroup && !hasMultipleGroups) {
            jugadoresFallbackQuery = jugadoresFallbackQuery.eq('grupo', effectiveGroup);
          }
          
          const { data: jugadoresFallback, error: jugadoresFallbackError } = await jugadoresFallbackQuery;

          if (jugadoresFallbackError) throw jugadoresFallbackError;

          for (const row of jugadoresFallback || []) {
            const perfilId = String(row?.perfil_id || '');
            if (!perfilId) continue;
            const prev = jugadoresByPerfil.get(perfilId);
            if (!prev) {
              jugadoresByPerfil.set(perfilId, row);
              continue;
            }
            jugadoresByPerfil.set(perfilId, {
              ...prev,
              puntos: Math.max(Number(prev.puntos || 0), Number(row.puntos || 0)),
              partidos_jugados: Math.max(Number(prev.partidos_jugados || 0), Number(row.partidos_jugados || 0)),
              sets_ganados: Math.max(Number(prev.sets_ganados || 0), Number(row.sets_ganados || 0)),
            });
          }

          jugadoresNormalizados = Array.from(jugadoresByPerfil.values());
        }
      }

      const profileIds = Array.from(new Set([
        ...jugadoresNormalizados.map((row: any) => row.perfil_id),
        ...partidos.flatMap((row: any) => [row.jugador1_id, row.jugador2_id]),
      ].filter(Boolean)));

      let perfiles: any[] = [];
      if (profileIds.length > 0) {
        const { data: perfilesData, error: perfilesError } = await supabase
          .from('perfiles')
          .select('id, nombre_completo, whatsapp')
          .in('id', profileIds);
        if (perfilesError) throw perfilesError;
        perfiles = perfilesData || [];
      }

      const nameById = Object.fromEntries((perfiles || []).map((row: any) => [row.id, row.nombre_completo || 'Jugador']));
      const jugadorById = Object.fromEntries((jugadoresNormalizados || []).map((row: any) => [row.perfil_id, row]));
      const historialByMatch = Object.fromEntries((historial || []).map((row: any) => [row.partido_id, row]));
      const proposalByMatch = Object.fromEntries((propuestas || []).map((row: any) => [row.partido_id, row.estado]));

      const stats: FixturePlayer[] = jugadoresNormalizados.map((row: any) => ({
        perfil_id: row.perfil_id,
        nombre: nameById[row.perfil_id] || 'Jugador',
        whatsapp: perfiles.find((p: any) => p.id === row.perfil_id)?.whatsapp ? String(perfiles.find((p: any) => p.id === row.perfil_id).whatsapp) : null,
        puntos: Number(row.puntos || 0),
        partidos_jugados: Number(row.partidos_jugados || 0),
        sets_ganados: Number(row.sets_ganados || 0),
      }));

      stats.sort((a, b) => {
        if (b.puntos !== a.puntos) return b.puntos - a.puntos;
        return b.sets_ganados - a.sets_ganados;
      });
      setPlayersStats(stats);

      const mappedMatches: FixtureMatch[] = partidos.map((row: any) => {
        const parsedResultado = parseResultadoSets(row.resultado || null);
        const historialEntry = historialByMatch[row.id];
        const historialScore = historialEntry
          ? {
              sets_jugador1: Number(historialEntry.sets_jugador1 || 0),
              sets_jugador2: Number(historialEntry.sets_jugador2 || 0),
              ganador_perfil_id: historialEntry.ganador_perfil_id || null,
            }
          : null;
        const historialGames = historialEntry && historialEntry.sets_json ? parseSetJsonToGames(historialEntry.sets_json) : null;

        const finalScore = historialScore || (parsedResultado
          ? {
              sets_jugador1: parsedResultado.sets_jugador1,
              sets_jugador2: parsedResultado.sets_jugador2,
              ganador_perfil_id: resolveWinnerId(
                row.ganador_id,
                String(row.jugador1_id),
                String(row.jugador2_id),
                parsedResultado.sets_jugador1,
                parsedResultado.sets_jugador2,
              ),
            }
          : null);

        return {
          id: String(row.id),
          jornada: Number(row.jornada || 1),
          estado: String(row.estado || 'programado'),
          resultado: row.resultado || null,
          proposalState: proposalByMatch[row.id] || null,
          p1: {
            perfil_id: String(row.jugador1_id),
            nombre: nameById[row.jugador1_id] || 'Jugador 1',
            whatsapp: perfiles.find((p: any) => p.id === row.jugador1_id)?.whatsapp ? String(perfiles.find((p: any) => p.id === row.jugador1_id).whatsapp) : null,
            puntos: Number(jugadorById[row.jugador1_id]?.puntos || 0),
            partidos_jugados: Number(jugadorById[row.jugador1_id]?.partidos_jugados || 0),
            sets_ganados: Number(jugadorById[row.jugador1_id]?.sets_ganados || 0),
          },
          p2: {
            perfil_id: String(row.jugador2_id),
            nombre: nameById[row.jugador2_id] || 'Jugador 2',
            whatsapp: perfiles.find((p: any) => p.id === row.jugador2_id)?.whatsapp ? String(perfiles.find((p: any) => p.id === row.jugador2_id).whatsapp) : null,
            puntos: Number(jugadorById[row.jugador2_id]?.puntos || 0),
            partidos_jugados: Number(jugadorById[row.jugador2_id]?.partidos_jugados || 0),
            sets_ganados: Number(jugadorById[row.jugador2_id]?.sets_ganados || 0),
          },
          finalScore,
          gameDetails: historialGames,
        };
      });

      setMatches(mappedMatches);
      refetchNextMatch();
      setLoadError(null);
    } catch (err) {
      console.error('No se pudo cargar el estado del fixture', err);
      setLoadError('Hubo un error al cargar el fixture. Intenta recargar la pagina en unos segundos.');
    } finally {
      isLoadingRef.current = false;
    }
  }, [currentUserId, refetchNextMatch, selectedGroup, tournament.id, tournament.subtitle]);

  const fechas = useMemo(() => {
    const unique = Array.from(new Set(matches.map((match) => match.jornada))).sort((a: number, b: number) => a - b);
    if (unique.length === 0) return [1];

    const maxJornada = unique[unique.length - 1];
    const maxJornadaMatches = matches.filter((match) => match.jornada === maxJornada);
    const maxJornadaFinalizada = maxJornadaMatches.length > 0
      && maxJornadaMatches.every((match) => match.estado === 'finalizado' || Boolean(match.finalScore));

    if (maxJornadaFinalizada) {
      return [...unique, (maxJornada as number) + 1];
    }

    return unique;
  }, [matches]);

  const fixtureMatches = useMemo(() => {
    if (activeFecha === 0) return matches;
    return matches.filter((match) => match.jornada === activeFecha);
  }, [matches, activeFecha]);

  const fechasForTabs = useMemo(() => [...fechas].sort((a, b) => b - a), [fechas]);

  const nextPlayableMatchId = useMemo(() => {
    const nextPlayable = matches.find((match) => !Boolean(match.finalScore) && match.estado !== 'finalizado' && match.estado !== 'esperando_validacion');
    return nextPlayable ? nextPlayable.id : null;
  }, [matches]);

  const highlightedNextMatchId = useMemo(() => nextMatch?.id || nextPlayableMatchId || null, [nextMatch?.id, nextPlayableMatchId]);

  const sortedFixtureMatches = useMemo(() => {
    const withIndex = fixtureMatches.map((match, index) => ({ match, index }));

    const getPriority = (match: FixtureMatch) => {
      const isFinal = Boolean(match.finalScore) || match.estado === 'finalizado';
      const isActual = match.estado === 'esperando_validacion' || match.estado === 'en_curso';
      const isNext = match.id === highlightedNextMatchId;

      if (!isFinal && isActual) return 0;
      if (!isFinal && !isActual && isNext) return 1;
      if (!isFinal) return 2;
      return 3;
    };

    withIndex.sort((a, b) => {
      const priorityA = getPriority(a.match);
      const priorityB = getPriority(b.match);
      if (priorityA !== priorityB) return priorityA - priorityB;

      if (a.match.jornada !== b.match.jornada) return a.match.jornada - b.match.jornada;
      return a.index - b.index;
    });

    return withIndex.map((item) => item.match);
  }, [fixtureMatches, highlightedNextMatchId]);

  useEffect(() => {
    if (activeFecha !== 0 && activeFecha !== -1 && !fechas.includes(activeFecha)) {
      setActiveFecha(0);
    }
  }, [activeFecha, fechas]);

  useEffect(() => {
    loadFixtureData();

    const scheduleRefresh = () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        loadFixtureData();
        refreshTimerRef.current = null;
      }, 250);
    };

    const channel = supabase
      .channel(`fixture-live-${tournament.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'torneo_jugadores', filter: `torneo_id=eq.${tournament.id}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partidos', filter: `torneo_id=eq.${tournament.id}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'torneo_partidos_historial', filter: `torneo_id=eq.${tournament.id}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'torneo_propuestas_partido', filter: `torneo_id=eq.${tournament.id}` }, scheduleRefresh)
      .subscribe();

    const intervalId = window.setInterval(loadFixtureData, 45000);

    return () => {
      window.clearInterval(intervalId);
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [loadFixtureData, tournament.id]);

  const getStatusLabel = (match: FixtureMatch) => {
    if (match.estado === 'finalizado' || match.finalScore) return 'FINAL';
    if (match.proposalState === 'discrepancia') return 'EN DISPUTA';
    if (match.proposalState === 'pendiente' || match.estado === 'en_curso') return 'PENDIENTE RIVAL';
    return 'PROGRAMADO';
  };

  const canReportMatch = (match: FixtureMatch) => {
    if (torneoFinalizado) return false;
    return currentUserId !== '' && [match.p1.perfil_id, match.p2.perfil_id].includes(currentUserId) && match.estado !== 'finalizado';
  };

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto bg-white dark:bg-background-dark font-display text-[#111813] dark:text-white transition-colors duration-200 pb-24">
      <div className="sticky top-0 z-20 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-[#dbe6de] dark:border-[#2a3c2e]">
        <div className="flex items-center p-4 pb-2 justify-between">
          <button
            onClick={() => navigate(-1)}
            className="text-[#111813] dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-background-light dark:hover:bg-white/10 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back_ios_new</span>
          </button>
          <h1 className="text-[#111813] dark:text-white text-xl font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-10">Fixture por Jornadas</h1>
        </div>

        <div className="px-4 pb-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#61896b] font-bold">{tournament.title}</p>
          {availableGroups.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-[#61896b] font-bold">Grupo</span>
              <select
                value={selectedGroup || ''}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="rounded-lg border border-[#dbe6de] bg-white px-3 py-1 pr-8 text-xs font-semibold text-[#111813] appearance-none bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iOCIgdmlld0JveD0iMCAwIDEyIDgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMUw2IDZMMTEgMSIgc3Ryb2tlPSIjNjE4OTZiIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==')] bg-no-repeat bg-right-center"
              >
                {(() => {
                  const seen = new Set<string>();
                  const dedup: string[] = [];
                  for (const g of availableGroups) {
                    const label = formatGroupName(g);
                    if (seen.has(label)) continue;
                    seen.add(label);
                    dedup.push(g);
                  }
                  return dedup.map((group) => (
                    <option key={group} value={group}>{formatGroupName(group)}</option>
                  ));
                })()}
              </select>
            </div>
          )}
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <div className="flex px-4 gap-6 min-w-max">
            <button
              onClick={() => setActiveFecha(0)}
              className={`flex flex-col items-center justify-center border-b-[3px] pb-3 pt-4 transition-all ${
                activeFecha === 0 ? 'border-primary text-[#111813] dark:text-white' : 'border-transparent text-[#61896b]'
              }`}
            >
              <p className={`text-sm tracking-wide ${activeFecha === 0 ? 'font-bold' : 'font-semibold'}`}>TODAS</p>
            </button>
            <button
              onClick={() => setActiveFecha(-1)}
              className={`flex flex-col items-center justify-center border-b-[3px] pb-3 pt-4 transition-all ${
                activeFecha === -1 ? 'border-primary text-[#111813] dark:text-white' : 'border-transparent text-[#61896b]'
              }`}
            >
              <p className={`text-sm tracking-wide ${activeFecha === -1 ? 'font-bold' : 'font-semibold'}`}>LLAVES</p>
            </button>
            {fechasForTabs.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFecha(f)}
                className={`flex flex-col items-center justify-center border-b-[3px] pb-3 pt-4 transition-all ${
                  activeFecha === f ? 'border-primary text-[#111813] dark:text-white' : 'border-transparent text-[#61896b]'
                }`}
              >
                <p className={`text-sm tracking-wide ${activeFecha === f ? 'font-bold' : 'font-semibold'}`}>JORNADA {f}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark pb-8 no-scrollbar">
        <div className="px-4 py-4">
          {activeFecha === 0 && (
            <>
              <div className="rounded-xl bg-[#e8f6eb] dark:bg-[#1a3a22] p-4 shadow-sm border border-[#dbe6de] dark:border-[#2a5a32] mb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#111813] dark:text-white">Proximo partido</h3>
                    {nextMatchLoading ? (
                      <p className="text-sm text-[#61896b] mt-1">Buscando tu proximo cruce...</p>
                    ) : nextMatch ? (
                      <>
                        <p className="text-sm font-semibold text-[#111813] dark:text-white mt-1">{nextMatch.rival_nombre}</p>
                        <p className="text-xs text-[#61896b] mt-0.5">Jornada {nextMatch.jornada} - {nextMatch.estado === 'programado' ? 'Pendiente' : 'En curso'}</p>
                        <p className="text-xs text-[#61896b] mt-0.5">WhatsApp: {nextMatch.rival_whatsapp || 'No disponible'}</p>
                      </>
                    ) : isEliminated ? (
                      <>
                        <p className="text-sm font-semibold text-[#111813] dark:text-white mt-1">Descalificado del torneo</p>
                        <p className="text-xs text-[#61896b] mt-0.5">No avanzaste a la siguiente ronda.</p>
                        <p className="text-xs text-[#61896b] mt-0.5">Podés seguir viendo los resultados en las pestañas de arriba.</p>
                      </>
                    ) : (
                      <p className="text-sm text-[#61896b] mt-1">No tenes un proximo partido pendiente por ahora.</p>
                    )}
                    {nextMatchError && <p className="text-xs text-red-600 mt-1">{nextMatchError}</p>}
                  </div>
                  {nextMatch?.rival_whatsapp ? (
                    <a
                      href={`https://wa.me/${String(nextMatch.rival_whatsapp).replace(/[^\d]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-11 h-11 rounded-lg bg-[#25D366] text-white flex items-center justify-center shadow-sm"
                      aria-label="Contactar rival por WhatsApp"
                    >
                      <span className="material-symbols-outlined">mail</span>
                    </a>
                  ) : (
                    <button
                      disabled
                      className="w-11 h-11 rounded-lg bg-gray-200 text-gray-400 flex items-center justify-center cursor-not-allowed"
                      aria-label="WhatsApp no disponible"
                    >
                      <span className="material-symbols-outlined">mail</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-white dark:bg-[#1a2e1f] p-4 shadow-sm border border-[#dbe6de] dark:border-[#2a3c2e] mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#111813] dark:text-white">Estado en vivo</h3>
                </div>
                {playersStats.length === 0 ? (
                  <p className="text-sm text-[#61896b]">Todavia no hay estadisticas cargadas para este torneo.</p>
                ) : (
                  <div className="space-y-2">
                    {playersStats.slice(0, 4).map((p, idx) => (
                      <div key={`${p.perfil_id}-${idx}`} className="grid grid-cols-[22px_1fr_42px_42px_42px] items-center gap-2 text-sm">
                        <span className="font-bold text-[#4a9c40]">{idx + 1}</span>
                        <span className="font-semibold truncate text-[#111813] dark:text-white">{p.nombre}</span>
                        <span className="text-center font-bold">{p.puntos}</span>
                        <span className="text-center">{p.partidos_jugados}</span>
                        <span className="text-center">{p.sets_ganados}</span>
                      </div>
                    ))}
                    <div className="grid grid-cols-[22px_1fr_42px_42px_42px] items-center gap-2 text-[10px] uppercase tracking-wider text-[#61896b] pt-1 border-t border-[#dbe6de] dark:border-[#2a3c2e]">
                      <span></span>
                      <span>Jugador</span>
                      <span className="text-center">Pts</span>
                      <span className="text-center">PJ</span>
                      <span className="text-center">Sets</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeFecha === -1 && (
            <BracketTab
              torneo_id={tournament.id}
              categoria={tournament.subtitle}
              grupo={selectedGroup}
              selectedGroup={selectedGroup}
            />
          )}

          {loadError && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/10 p-4 border border-red-100 dark:border-red-800/20 flex gap-3 mb-4">
              <span className="material-symbols-outlined text-red-500 text-lg">error</span>
              <div className="flex-1">
                <p className="text-sm text-red-700 dark:text-red-300 font-medium">{loadError}</p>
                <button
                  onClick={loadFixtureData}
                  className="mt-2 text-xs font-bold uppercase tracking-wide text-red-700 dark:text-red-300 underline"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}
          <h3 className="text-[#111813] dark:text-white text-base font-bold uppercase tracking-wider mb-3">Partidos del torneo</h3>
          <div className="flex flex-col gap-4">
            {fixtureMatches.length === 0 ? (
              <div className="rounded-xl bg-white dark:bg-[#1a2e1f] p-4 shadow-sm border border-[#dbe6de] dark:border-[#2a3c2e]">
                <p className="text-sm text-[#61896b]">Todavia no hay partidos cargados para esta jornada.</p>
              </div>
            ) : (
              sortedFixtureMatches.map((match) => {
                const isFinal = Boolean(match.finalScore) || match.estado === 'finalizado';
                const p1Sets = match.finalScore?.sets_jugador1 ?? 0;
                const p2Sets = match.finalScore?.sets_jugador2 ?? 0;
                const p1Won = match.finalScore?.ganador_perfil_id === match.p1.perfil_id;
                const p2Won = match.finalScore?.ganador_perfil_id === match.p2.perfil_id;
                const rival = currentUserId === match.p1.perfil_id ? match.p2 : currentUserId === match.p2.perfil_id ? match.p1 : null;
                const rivalWhatsappDigits = String(rival?.whatsapp || '').replace(/[^\d]/g, '');
                const rivalWhatsappLink = rivalWhatsappDigits ? `https://wa.me/${rivalWhatsappDigits}` : null;
                const isActual = match.estado === 'esperando_validacion' || match.estado === 'en_curso';
                const isNext = match.id === highlightedNextMatchId;
                const userIsParticipant = currentUserId !== '' && [match.p1.perfil_id, match.p2.perfil_id].includes(currentUserId);
                const userWon = userIsParticipant && Boolean(match.finalScore?.ganador_perfil_id) && match.finalScore?.ganador_perfil_id === currentUserId;
                const userLost = userIsParticipant && Boolean(match.finalScore?.ganador_perfil_id) && match.finalScore?.ganador_perfil_id !== currentUserId;

                return (
                  <div key={match.id} className="flex flex-col gap-4 rounded-xl bg-white dark:bg-[#1a2e1f] p-4 shadow-sm border border-[#dbe6de] dark:border-[#2a3c2e] hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-3 flex-1">
                        <div className="flex items-center justify-between pr-4">
                          <span className={`${p1Won ? 'text-[#111813] dark:text-white font-bold' : 'text-[#111813] dark:text-white font-medium'} text-lg`}>{match.p1.nombre}</span>
                          {isFinal && <span className={`text-lg ${p1Won ? 'font-black text-[#4a9c40]' : 'font-bold text-[#61896b]'}`}>{p1Sets}</span>}
                        </div>
                        <div className="flex items-center justify-between pr-4">
                          <span className={`${p2Won ? 'text-[#111813] dark:text-white font-bold' : 'text-[#111813] dark:text-white font-medium'} text-lg`}>{match.p2.nombre}</span>
                          {isFinal && <span className={`text-lg ${p2Won ? 'font-black text-[#4a9c40]' : 'font-bold text-[#61896b]'}`}>{p2Sets}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {!isFinal && isActual && (
                          <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full">ACTUAL</span>
                        )}
                        {!isFinal && !isActual && isNext && (
                          <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">SIGUIENTE</span>
                        )}
                        <span className="bg-primary/10 text-[#4a9c40] text-[10px] font-bold px-2 py-0.5 rounded-full">{getStatusLabel(match)}</span>
                        {isFinal && userWon && (
                          <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">GANASTE</span>
                        )}
                        {isFinal && userLost && (
                          <span className="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full">PERDISTE</span>
                        )}
                        <div className="flex items-center gap-1 text-[#61896b] text-sm font-medium">
                          <span className="material-symbols-outlined text-sm">event</span>
                          <span>Jornada {match.jornada}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[#61896b] text-xs">
                          <span className="material-symbols-outlined text-sm">person</span>
                          <span>{rival ? `Rival: ${rival.nombre}` : 'Dia y horario a coordinar'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(isFinal ? '/result-detail' : '/match-result', { state: { tournament, partidoId: match.id, currentUserId } })}
                        className="flex-1 h-10 rounded-lg bg-background-light dark:bg-[#2e4a35] text-[#111813] dark:text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                      >
                        <span className="material-symbols-outlined text-lg">sports_tennis</span>
                        {isFinal ? 'Ver Resultado' : canReportMatch(match) ? 'Cargar Resultado' : torneoFinalizado ? 'Solo historial' : 'Ver Detalle'}
                      </button>
                      {rivalWhatsappLink ? (
                        <a
                          href={rivalWhatsappLink}
                          target="_blank"
                          rel="noreferrer"
                          className="w-12 h-10 rounded-lg bg-[#25D366] text-white flex items-center justify-center active:scale-95 transition-transform shadow-sm"
                          aria-label="Contactar rival por WhatsApp"
                        >
                          <span className="material-symbols-outlined font-bold">mail</span>
                        </a>
                      ) : (
                        <button
                          disabled
                          className="w-12 h-10 rounded-lg bg-gray-200 text-gray-400 flex items-center justify-center cursor-not-allowed"
                          aria-label="WhatsApp no disponible"
                        >
                          <span className="material-symbols-outlined font-bold">mail</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </main>

      <div className="fixed bottom-6 right-6 z-30">
        <button className="size-14 rounded-full bg-[#4a9c40] text-white shadow-lg flex items-center justify-center active:scale-90 transition-transform">
          <span className="material-symbols-outlined text-3xl font-bold">map</span>
        </button>
      </div>
    </div>
  );
};

export default Fixture;
