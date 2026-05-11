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
  gameDetails: Array<{ p1: number; p2: number; tb?: number }> | null;
};

const parseResultadoSets = (resultado: string | null) => {
  if (!resultado) return null;
  const match = resultado.match(/(\d+)\s*[-:]\s*(\d+)/);
  if (!match) return null;
  return { sets_jugador1: Number(match[1] || 0), sets_jugador2: Number(match[2] || 0) };
};

const parseSetJsonToGames = (setsJson: any) => {
  if (!Array.isArray(setsJson)) return null;
  return setsJson.map((set: any) => ({
    p1: Number(set?.p1 || 0),
    p2: Number(set?.p2 || 0),
    tb: set?.tb !== undefined && set?.tb !== null ? Number(set.tb) : undefined,
  }));
};

const resolveWinnerId = (ganadorId: string | null | undefined, p1Id: string, p2Id: string, sJ1: number, sJ2: number) => {
  if (ganadorId) return String(ganadorId);
  if (sJ1 > sJ2) return p1Id;
  if (sJ2 > sJ1) return p2Id;
  return null;
};

// Mapea código de grupo a etiqueta legible
const formatGroupName = (groupCode: string): string => {
  if (!groupCode) return '';
  const match = groupCode.match(/_G(\d+)$/);
  if (match) return `Grupo ${parseInt(match[1], 10)}`;
  return 'Grupo 1';
};

const Fixture: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const appUser = localStorage.getItem('app_user') ? JSON.parse(localStorage.getItem('app_user') as string) : null;
  const [activeFecha, setActiveFecha] = useState(0);
  const [playersStats, setPlayersStats] = useState<FixturePlayer[]>([]);
  const [matches, setMatches] = useState<FixtureMatch[]>([]);
  const [torneoFinalizado, setTorneoFinalizado] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>(String(appUser?.id || ''));
  const [availableGroups, setAvailableGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  // Grupo propio del usuario (para el próximo partido)
  const [userGroup, setUserGroup] = useState<string>('');
  const isLoadingRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);

  const savedTournament = localStorage.getItem('active_tournament');
  const tournament = location.state?.tournament || (savedTournament ? JSON.parse(savedTournament) : {
    id: 1,
    title: 'Abierto de Tenis TuBarrio',
    subtitle: 'Singles Caballeros',
  });

  // Hook de estado del jugador — usa el grupo propio del usuario
  const { loading: nextMatchLoading, status: playerStatus } = usePlayerTournamentStatus(
    tournament.id,
    currentUserId || undefined
  );
  const nextMatch = playerStatus?.proximo_partido ?? null;
  const isEliminated = playerStatus?.estado === 'eliminado';

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
      if (!Number.isFinite(parsedTournamentId)) throw new Error('ID de torneo invalido.');

      // ── 1. Resolver el grupo propio del usuario ──────────────────────────
      let userOwnGroup = '';
      let resolvedCategory = String(tournament.subtitle || '').trim();

      if (currentUserId) {
        const { data: playerScopeRows } = await supabase
          .from('torneo_jugadores')
          .select('categoria, grupo')
          .eq('torneo_id', parsedTournamentId)
          .eq('perfil_id', currentUserId)
          .limit(1);

        const ps = Array.isArray(playerScopeRows) ? playerScopeRows[0] : null;
        if (ps?.categoria) resolvedCategory = String(ps.categoria);
        if (ps?.grupo) userOwnGroup = String(ps.grupo);
      }

      setUserGroup(userOwnGroup);

      // ── 2. Cargar todos los grupos disponibles ───────────────────────────
      let groupsQuery: any = supabase
        .from('torneo_estado')
        .select('grupo, categoria')
        .eq('torneo_id', parsedTournamentId);
      if (resolvedCategory) groupsQuery = groupsQuery.eq('categoria', resolvedCategory);

      const { data: groupsRows } = await groupsQuery;
      const groups: string[] = Array.from(
<<<<<<< HEAD
        new Set<string>(
=======
        new Set(
>>>>>>> 1204d188d09a351fdb114480a4399ae9beb6708f
          (groupsRows || [])
            .map((r: any) => String(r?.grupo || '').trim())
            .filter(Boolean)
        )
<<<<<<< HEAD
      ).sort((a, b) => a.localeCompare(b));
=======
      ).sort((a, b) => a.localeCompare(b)) as string[];

>>>>>>> 1204d188d09a351fdb114480a4399ae9beb6708f
      setAvailableGroups(groups);

      // Determinar grupo a mostrar:
      // - Si el usuario ya eligió uno manualmente → respetarlo
      // - Si no → mostrar el grupo propio del usuario, o el primero disponible
      const effectiveGroup = selectedGroup || userOwnGroup || groups[0] || '';

      // Inicializar selectedGroup si aún no está seteado
      if (!selectedGroup && effectiveGroup) {
        setSelectedGroup(effectiveGroup);
      }

      // ── 3. Ver estado del torneo ─────────────────────────────────────────
      const { data: estadoRows } = await supabase
        .from('torneo_estado')
        .select('estado, categoria, grupo')
        .eq('torneo_id', parsedTournamentId);

      const estadoNorm = ((estadoRows || []) as any[])
        .find((r: any) => !effectiveGroup || String(r?.grupo || '') === effectiveGroup)?.estado || '';
      setTorneoFinalizado(String(estadoNorm).toUpperCase() === 'FINALIZADO');

      // ── 4. Cargar partidos del grupo seleccionado (SIN filtrar por usuario) ─
      // FIX PRINCIPAL: siempre mostramos TODOS los partidos del grupo, 
      // independientemente de si el usuario juega en ese grupo o no.
      let partidosQuery: any = supabase
        .from('partidos')
        .select('id, jornada, estado, resultado, ganador_id, jugador1_id, jugador2_id')
        .eq('torneo_id', parsedTournamentId)
        .is('bracket_tipo', null)
        .order('jornada', { ascending: true });

      if (resolvedCategory) partidosQuery = partidosQuery.eq('categoria', resolvedCategory);
      if (effectiveGroup) partidosQuery = partidosQuery.eq('grupo', effectiveGroup);

      const { data: partidosRows, error: partidosError } = await partidosQuery;
      if (partidosError) throw partidosError;

      const partidos = Array.isArray(partidosRows) ? partidosRows : [];

      // ── 5. Cargar jugadores del grupo seleccionado ───────────────────────
      let jugadoresQuery: any = supabase
        .from('torneo_jugadores')
        .select('perfil_id, puntos, partidos_jugados, sets_ganados')
        .eq('torneo_id', parsedTournamentId);

      if (resolvedCategory) jugadoresQuery = jugadoresQuery.eq('categoria', resolvedCategory);
      if (effectiveGroup) jugadoresQuery = jugadoresQuery.eq('grupo', effectiveGroup);

      const { data: jugadoresRows, error: jugadoresError } = await jugadoresQuery;
      if (jugadoresError) throw jugadoresError;

      const jugadores = Array.isArray(jugadoresRows) ? jugadoresRows : [];

      // ── 6. Historial del grupo seleccionado ─────────────────────────────
      let historialQuery: any = supabase
        .from('torneo_partidos_historial')
        .select('partido_id, sets_jugador1, sets_jugador2, ganador_perfil_id, sets_json')
        .eq('torneo_id', parsedTournamentId);

      if (resolvedCategory) historialQuery = historialQuery.eq('categoria', resolvedCategory);
      if (effectiveGroup) historialQuery = historialQuery.eq('grupo', effectiveGroup);

      // ── 7. Propuestas del grupo ──────────────────────────────────────────
      let propuestasQuery: any = supabase
        .from('torneo_propuestas_partido')
        .select('partido_id, estado')
        .eq('torneo_id', parsedTournamentId);

      if (resolvedCategory) propuestasQuery = propuestasQuery.eq('categoria', resolvedCategory);
      if (effectiveGroup) propuestasQuery = propuestasQuery.eq('grupo', effectiveGroup);

      const [historialResp, propuestasResp] = await Promise.all([historialQuery, propuestasQuery]);

      const historial = Array.isArray(historialResp.data) ? historialResp.data : [];
      const propuestas = Array.isArray(propuestasResp.data) ? propuestasResp.data : [];

      // ── 8. Perfiles de todos los jugadores en los partidos ───────────────
      const profileIds = Array.from(new Set([
        ...jugadores.map((r: any) => r.perfil_id),
        ...partidos.flatMap((r: any) => [r.jugador1_id, r.jugador2_id]),
      ].filter(Boolean)));

      let perfiles: any[] = [];
      if (profileIds.length > 0) {
        const { data: perfilesData } = await supabase
          .from('perfiles')
          .select('id, nombre_completo, whatsapp')
          .in('id', profileIds);
        perfiles = perfilesData || [];
      }

      const nameById: Record<string, string> = Object.fromEntries(
        perfiles.map((p: any) => [p.id, p.nombre_completo || 'Jugador'])
      );
      const whatsappById: Record<string, string | null> = Object.fromEntries(
        perfiles.map((p: any) => [p.id, p.whatsapp ? String(p.whatsapp) : null])
      );
      const jugadorById: Record<string, any> = Object.fromEntries(
        jugadores.map((r: any) => [r.perfil_id, r])
      );
      const historialByMatch: Record<string, any> = Object.fromEntries(
        historial.map((r: any) => [r.partido_id, r])
      );
      const proposalByMatch: Record<string, string> = Object.fromEntries(
        propuestas.map((r: any) => [r.partido_id, r.estado])
      );

      // ── 9. Stats de posiciones ───────────────────────────────────────────
      const stats: FixturePlayer[] = jugadores.map((row: any) => ({
        perfil_id: row.perfil_id,
        nombre: nameById[row.perfil_id] || 'Jugador',
        whatsapp: whatsappById[row.perfil_id] || null,
        puntos: Number(row.puntos || 0),
        partidos_jugados: Number(row.partidos_jugados || 0),
        sets_ganados: Number(row.sets_ganados || 0),
      }));
      stats.sort((a, b) => b.puntos - a.puntos || b.sets_ganados - a.sets_ganados);
      setPlayersStats(stats);

<<<<<<< HEAD
      // Normalize jornada numbers to sequential 1, 2, 3... regardless of DB values
      const uniqueJornadas: number[] = Array.from(new Set<number>(partidos.map((r: any) => Number(r.jornada || 1)))).sort((a, b) => a - b);
      const jornadaMap = new Map<number, number>(uniqueJornadas.map((j, i): [number, number] => [j, i + 1]));

=======
      // ── 10. Mapear partidos ──────────────────────────────────────────────
>>>>>>> 1204d188d09a351fdb114480a4399ae9beb6708f
      const mappedMatches: FixtureMatch[] = partidos.map((row: any) => {
        const parsedRes = parseResultadoSets(row.resultado || null);
        const histEntry = historialByMatch[row.id];
        const histScore = histEntry
          ? { sets_jugador1: Number(histEntry.sets_jugador1 || 0), sets_jugador2: Number(histEntry.sets_jugador2 || 0), ganador_perfil_id: histEntry.ganador_perfil_id || null }
          : null;
        const histGames = histEntry?.sets_json ? parseSetJsonToGames(histEntry.sets_json) : null;

        const finalScore = histScore || (parsedRes
          ? { sets_jugador1: parsedRes.sets_jugador1, sets_jugador2: parsedRes.sets_jugador2, ganador_perfil_id: resolveWinnerId(row.ganador_id, String(row.jugador1_id), String(row.jugador2_id), parsedRes.sets_jugador1, parsedRes.sets_jugador2) }
          : null);

        const makePlayer = (id: string, fallback: string): FixturePlayer => ({
          perfil_id: String(id),
          nombre: nameById[id] || fallback,
          whatsapp: whatsappById[id] || null,
          puntos: Number(jugadorById[id]?.puntos || 0),
          partidos_jugados: Number(jugadorById[id]?.partidos_jugados || 0),
          sets_ganados: Number(jugadorById[id]?.sets_ganados || 0),
        });

        return {
          id: String(row.id),
          jornada: jornadaMap.get(Number(row.jornada || 1)) ?? 1,
          estado: String(row.estado || 'programado'),
          resultado: row.resultado || null,
          proposalState: proposalByMatch[row.id] || null,
          p1: makePlayer(row.jugador1_id, 'Jugador 1'),
          p2: makePlayer(row.jugador2_id, 'Jugador 2'),
          finalScore,
          gameDetails: histGames,
        };
      });

      setMatches(mappedMatches);
      setLoadError(null);
    } catch (err) {
      console.error('No se pudo cargar el estado del fixture', err);
      setLoadError('Hubo un error al cargar el fixture. Intenta recargar la pagina en unos segundos.');
    } finally {
      isLoadingRef.current = false;
    }
  }, [currentUserId, selectedGroup, tournament.id, tournament.subtitle]);

  const fechas = useMemo(() => {
    const unique = Array.from(new Set(matches.map((m) => m.jornada))).sort((a, b) => a - b);
    if (unique.length === 0) return [1];
    const maxJ = unique[unique.length - 1];
    const allFinal = matches.filter((m) => m.jornada === maxJ).every((m) => Boolean(m.finalScore) || m.estado === 'finalizado');
    return allFinal ? [...unique, maxJ + 1] : unique;
  }, [matches]);

  const fixtureMatches = useMemo(() => {
    if (activeFecha === 0) return matches;
    return matches.filter((m) => m.jornada === activeFecha);
  }, [matches, activeFecha]);

  const fechasForTabs = useMemo(() => [...fechas].sort((a, b) => b - a), [fechas]);

<<<<<<< HEAD
  const nextPlayableMatchId = useMemo(() => {
    const nextPlayable = matches.find((match) => !Boolean(match.finalScore) && match.estado !== 'finalizado' && match.estado !== 'esperando_validacion');
    return nextPlayable ? nextPlayable.id : null;
  }, [matches]);

  // Fallback: find the user's next pending match directly from loaded data
  const myNextMatchInFixture = useMemo(() => {
    if (!currentUserId) return null;
    const pending = matches.find((m) =>
      !m.finalScore &&
      m.estado !== 'finalizado' &&
      [m.p1.perfil_id, m.p2.perfil_id].includes(currentUserId)
    );
    if (!pending) return null;
    const rival = pending.p1.perfil_id === currentUserId ? pending.p2 : pending.p1;
    return {
      id: pending.id,
      jornada: pending.jornada,
      estado: pending.estado,
      rival_nombre: rival.nombre,
      rival_whatsapp: rival.whatsapp,
    };
  }, [matches, currentUserId]);

  const displayNextMatch = nextMatch || myNextMatchInFixture;

  const highlightedNextMatchId = useMemo(() => nextMatch?.id || myNextMatchInFixture?.id || nextPlayableMatchId || null, [nextMatch?.id, myNextMatchInFixture?.id, nextPlayableMatchId]);
=======
  // Highlight: partido del usuario en el grupo actualmente visible
  const highlightedMatchId = useMemo(() => {
    if (nextMatch?.id) return nextMatch.id;
    // Si el usuario ve su propio grupo, destacar su próximo partido pendiente
    const myNext = matches.find((m) =>
      !m.finalScore &&
      m.estado !== 'finalizado' &&
      currentUserId &&
      [m.p1.perfil_id, m.p2.perfil_id].includes(currentUserId)
    );
    return myNext?.id || null;
  }, [nextMatch, matches, currentUserId]);
>>>>>>> 1204d188d09a351fdb114480a4399ae9beb6708f

  const sortedFixtureMatches = useMemo(() => {
    return [...fixtureMatches].sort((a, b) => {
      const getPriority = (m: FixtureMatch) => {
        if (m.estado === 'esperando_validacion' || m.estado === 'en_curso') return 0;
        if (!m.finalScore && m.id === highlightedMatchId) return 1;
        if (!m.finalScore) return 2;
        return 3;
      };
      const pa = getPriority(a), pb = getPriority(b);
      if (pa !== pb) return pa - pb;
      return a.jornada - b.jornada;
    });
  }, [fixtureMatches, highlightedMatchId]);

  useEffect(() => {
    if (activeFecha !== 0 && activeFecha !== -1 && !fechas.includes(activeFecha)) {
      setActiveFecha(0);
    }
  }, [activeFecha, fechas]);

  useEffect(() => {
    loadFixtureData();
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => { loadFixtureData(); refreshTimerRef.current = null; }, 250);
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
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [loadFixtureData, tournament.id]);

  const getStatusLabel = (match: FixtureMatch) => {
    if (match.estado === 'finalizado' || match.finalScore) return 'FINAL';
    if (match.proposalState === 'discrepancia') return 'EN DISPUTA';
    if (match.proposalState === 'pendiente' || match.estado === 'en_curso') return 'PENDIENTE RIVAL';
    if (match.estado === 'esperando_validacion') return 'ESPERANDO CONFIRM.';
    return 'PROGRAMADO';
  };

  const canReportMatch = (match: FixtureMatch) => {
    if (torneoFinalizado) return false;
    return currentUserId !== '' &&
      [match.p1.perfil_id, match.p2.perfil_id].includes(currentUserId) &&
      match.estado !== 'finalizado';
  };

  // Próximo partido del usuario en su propio grupo (del hook)
  const rivalWhatsappLink = useMemo(() => {
    const w = nextMatch?.rival_whatsapp;
    if (!w) return null;
    const digits = String(w).replace(/[^\d]/g, '');
    return digits ? `https://wa.me/${digits}` : null;
  }, [nextMatch?.rival_whatsapp]);

  // Próximo partido visible en el grupo actualmente seleccionado
  const myMatchInSelectedGroup = useMemo(() => {
    if (!currentUserId) return null;
    return matches.find((m) =>
      !m.finalScore &&
      m.estado !== 'finalizado' &&
      [m.p1.perfil_id, m.p2.perfil_id].includes(currentUserId)
    ) || null;
  }, [matches, currentUserId]);

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto bg-white dark:bg-background-dark font-display text-[#111813] dark:text-white transition-colors duration-200 pb-24">

      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-[#dbe6de] dark:border-[#2a3c2e]">
        <div className="flex items-center p-4 pb-2 justify-between">
          <button onClick={() => navigate(-1)} className="text-[#111813] dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-background-light dark:hover:bg-white/10 cursor-pointer transition-colors">
            <span className="material-symbols-outlined">arrow_back_ios_new</span>
          </button>
          <h1 className="text-[#111813] dark:text-white text-xl font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-10">Fixture por Jornadas</h1>
        </div>

        <div className="px-4 pb-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#61896b] font-bold">{tournament.title}</p>
          {/* Selector de grupo */}
          {availableGroups.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-[#61896b] font-bold">Grupo</span>
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="rounded-lg border border-[#dbe6de] bg-white px-3 py-1 pr-8 text-xs font-semibold text-[#111813] appearance-none"
              >
                {availableGroups.map((g) => (
                  <option key={g} value={g}>
                    {formatGroupName(g)}
                    {g === userGroup ? ' ★' : ''}
                  </option>
                ))}
              </select>
              {/* Indicador: si el grupo visible no es el propio del usuario */}
              {userGroup && selectedGroup && selectedGroup !== userGroup && (
                <button
                  onClick={() => setSelectedGroup(userGroup)}
                  className="text-[10px] text-primary font-bold underline"
                >
                  Ver mi grupo
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tabs de jornada */}
        <div className="overflow-x-auto no-scrollbar">
          <div className="flex px-4 gap-6 min-w-max">
            {[{ label: 'TODAS', value: 0 }, { label: 'LLAVES', value: -1 }, ...fechasForTabs.map((f) => ({ label: `JORNADA ${f}`, value: f }))].map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setActiveFecha(value)}
                className={`flex flex-col items-center border-b-[3px] pb-3 pt-4 transition-all ${activeFecha === value ? 'border-primary text-[#111813] dark:text-white font-bold' : 'border-transparent text-[#61896b] font-semibold'} text-sm tracking-wide`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark pb-8 no-scrollbar">
        <div className="px-4 py-4">

          {/* Próximo partido — siempre muestra el del usuario (su grupo real) */}
          {activeFecha === 0 && (
            <>
              <div className="rounded-xl bg-[#e8f6eb] dark:bg-[#1a3a22] p-4 shadow-sm border border-[#dbe6de] dark:border-[#2a5a32] mb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
<<<<<<< HEAD
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#111813] dark:text-white">Proximo partido</h3>
                    {nextMatchLoading && !myNextMatchInFixture ? (
                      <p className="text-sm text-[#61896b] mt-1">Buscando tu proximo cruce...</p>
                    ) : displayNextMatch ? (
                      <>
                        <p className="text-sm font-semibold text-[#111813] dark:text-white mt-1">vs. {displayNextMatch.rival_nombre}</p>
                        <p className="text-xs text-[#61896b] mt-0.5">Jornada {displayNextMatch.jornada} · {displayNextMatch.estado === 'programado' ? 'Pendiente' : 'En curso'}</p>
                        <p className="text-xs text-[#61896b] mt-0.5">WhatsApp: {displayNextMatch.rival_whatsapp || 'No disponible'}</p>
=======
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#111813] dark:text-white">Mi próximo partido</h3>
                    {nextMatchLoading ? (
                      <p className="text-sm text-[#61896b] mt-1">Buscando tu próximo cruce...</p>
                    ) : nextMatch ? (
                      <>
                        <p className="text-sm font-semibold text-[#111813] dark:text-white mt-1">vs. {nextMatch.rival_nombre}</p>
                        <p className="text-xs text-[#61896b] mt-0.5">
                          {formatGroupName(nextMatch.grupo || userGroup)} · Jornada {nextMatch.jornada}
                        </p>
                        {nextMatch.rival_whatsapp
                          ? <p className="text-xs text-[#61896b]">📱 {nextMatch.rival_whatsapp}</p>
                          : <p className="text-xs text-[#61896b] opacity-60">Sin WhatsApp registrado</p>
                        }
>>>>>>> 1204d188d09a351fdb114480a4399ae9beb6708f
                      </>
                    ) : isEliminated ? (
                      <p className="text-sm text-[#61896b] mt-1">No avanzaste a la siguiente ronda.</p>
                    ) : (
                      <p className="text-sm text-[#61896b] mt-1">No tenés un próximo partido pendiente por ahora.</p>
                    )}
                  </div>
<<<<<<< HEAD
                  {displayNextMatch?.rival_whatsapp ? (
                    <a
                      href={`https://wa.me/${String(displayNextMatch.rival_whatsapp).replace(/[^\d]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-11 h-11 rounded-lg bg-[#25D366] text-white flex items-center justify-center shadow-sm"
                      aria-label="Contactar rival por WhatsApp"
                    >
=======
                  {rivalWhatsappLink ? (
                    <a href={rivalWhatsappLink} target="_blank" rel="noreferrer" className="w-11 h-11 rounded-lg bg-[#25D366] text-white flex items-center justify-center shadow-sm">
>>>>>>> 1204d188d09a351fdb114480a4399ae9beb6708f
                      <span className="material-symbols-outlined">mail</span>
                    </a>
                  ) : (
                    <button disabled className="w-11 h-11 rounded-lg bg-gray-200 text-gray-400 flex items-center justify-center cursor-not-allowed">
                      <span className="material-symbols-outlined">mail</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Estado en vivo — posiciones del grupo seleccionado */}
              <div className="rounded-xl bg-white dark:bg-[#1a2e1f] p-4 shadow-sm border border-[#dbe6de] dark:border-[#2a3c2e] mb-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#111813] dark:text-white mb-3">
                  Estado en vivo · {formatGroupName(selectedGroup)}
                </h3>
                {playersStats.length === 0 ? (
                  <p className="text-sm text-[#61896b]">Todavía no hay estadísticas cargadas para este grupo.</p>
                ) : (
                  <div className="space-y-2">
                    {playersStats.slice(0, 4).map((p, idx) => (
                      <div key={`${p.perfil_id}-${idx}`} className="grid grid-cols-[22px_1fr_42px_42px_42px] items-center gap-2 text-sm">
                        <span className="font-bold text-[#4a9c40]">{idx + 1}</span>
                        <span className={`font-semibold truncate ${p.perfil_id === currentUserId ? 'text-primary' : 'text-[#111813] dark:text-white'}`}>
                          {p.nombre}{p.perfil_id === currentUserId ? ' (vos)' : ''}
                        </span>
                        <span className="text-center font-bold">{p.puntos}</span>
                        <span className="text-center">{p.partidos_jugados}</span>
                        <span className="text-center">{p.sets_ganados}</span>
                      </div>
                    ))}
                    <div className="grid grid-cols-[22px_1fr_42px_42px_42px] items-center gap-2 text-[10px] uppercase tracking-wider text-[#61896b] pt-1 border-t border-[#dbe6de] dark:border-[#2a3c2e]">
                      <span></span><span>Jugador</span><span className="text-center">Pts</span><span className="text-center">PJ</span><span className="text-center">Sets</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Llaves */}
          {activeFecha === -1 && (
            <BracketTab
              torneo_id={tournament.id}
              categoria={tournament.subtitle}
              grupo={selectedGroup}
              selectedGroup={selectedGroup}
            />
          )}

          {/* Error */}
          {loadError && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/10 p-4 border border-red-100 dark:border-red-800/20 flex gap-3 mb-4">
              <span className="material-symbols-outlined text-red-500 text-lg">error</span>
              <div className="flex-1">
                <p className="text-sm text-red-700 dark:text-red-300 font-medium">{loadError}</p>
                <button onClick={loadFixtureData} className="mt-2 text-xs font-bold uppercase tracking-wide text-red-700 dark:text-red-300 underline">Reintentar</button>
              </div>
            </div>
          )}

          {/* Lista de partidos */}
          {activeFecha !== -1 && (
            <>
              <h3 className="text-[#111813] dark:text-white text-base font-bold uppercase tracking-wider mb-3">
                Partidos · {formatGroupName(selectedGroup)}
              </h3>
              <div className="flex flex-col gap-4">
                {fixtureMatches.length === 0 ? (
                  <div className="rounded-xl bg-white dark:bg-[#1a2e1f] p-4 shadow-sm border border-[#dbe6de] dark:border-[#2a3c2e]">
                    <p className="text-sm text-[#61896b]">Todavía no hay partidos cargados para esta jornada.</p>
                  </div>
                ) : (
                  sortedFixtureMatches.map((match) => {
                    const isFinal = Boolean(match.finalScore) || match.estado === 'finalizado';
                    const p1Sets = match.finalScore?.sets_jugador1 ?? 0;
                    const p2Sets = match.finalScore?.sets_jugador2 ?? 0;
                    const p1Won = match.finalScore?.ganador_perfil_id === match.p1.perfil_id;
                    const p2Won = match.finalScore?.ganador_perfil_id === match.p2.perfil_id;
                    const isMyMatch = currentUserId && [match.p1.perfil_id, match.p2.perfil_id].includes(currentUserId);
                    const rival = currentUserId === match.p1.perfil_id ? match.p2 : currentUserId === match.p2.perfil_id ? match.p1 : null;
                    const rivalWaDigits = String(rival?.whatsapp || '').replace(/[^\d]/g, '');
                    const rivalWaLink = rivalWaDigits ? `https://wa.me/${rivalWaDigits}` : null;
                    const isNext = match.id === highlightedMatchId;
                    const userWon = isMyMatch && Boolean(match.finalScore?.ganador_perfil_id) && match.finalScore?.ganador_perfil_id === currentUserId;
                    const userLost = isMyMatch && Boolean(match.finalScore?.ganador_perfil_id) && match.finalScore?.ganador_perfil_id !== currentUserId;

                    return (
                      <div key={match.id} className={`flex flex-col gap-4 rounded-xl bg-white dark:bg-[#1a2e1f] p-4 shadow-sm border transition-shadow hover:shadow-md ${isMyMatch && !isFinal ? 'border-primary/40 bg-primary/5' : 'border-[#dbe6de] dark:border-[#2a3c2e]'}`}>
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col gap-3 flex-1">
                            <div className="flex items-center justify-between pr-4">
                              <span className={`${p1Won ? 'text-[#111813] dark:text-white font-bold' : 'text-[#111813] dark:text-white font-medium'} text-lg`}>
                                {match.p1.nombre}{match.p1.perfil_id === currentUserId ? ' ★' : ''}
                              </span>
                              {isFinal && <span className={`text-lg ${p1Won ? 'font-black text-[#4a9c40]' : 'font-bold text-[#61896b]'}`}>{p1Sets}</span>}
                            </div>
                            <div className="flex items-center justify-between pr-4">
                              <span className={`${p2Won ? 'text-[#111813] dark:text-white font-bold' : 'text-[#111813] dark:text-white font-medium'} text-lg`}>
                                {match.p2.nombre}{match.p2.perfil_id === currentUserId ? ' ★' : ''}
                              </span>
                              {isFinal && <span className={`text-lg ${p2Won ? 'font-black text-[#4a9c40]' : 'font-bold text-[#61896b]'}`}>{p2Sets}</span>}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {isNext && !isFinal && <span className="bg-primary/20 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">MI PARTIDO</span>}
                            <span className="bg-primary/10 text-[#4a9c40] text-[10px] font-bold px-2 py-0.5 rounded-full">{getStatusLabel(match)}</span>
                            {userWon && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">GANASTE</span>}
                            {userLost && <span className="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full">PERDISTE</span>}
                            <div className="flex items-center gap-1 text-[#61896b] text-sm font-medium">
                              <span className="material-symbols-outlined text-sm">event</span>
                              <span>Jornada {match.jornada}</span>
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
                          {rivalWaLink ? (
                            <a href={rivalWaLink} target="_blank" rel="noreferrer" className="w-12 h-10 rounded-lg bg-[#25D366] text-white flex items-center justify-center active:scale-95 transition-transform shadow-sm">
                              <span className="material-symbols-outlined font-bold">mail</span>
                            </a>
                          ) : isMyMatch ? (
                            <button disabled className="w-12 h-10 rounded-lg bg-gray-200 text-gray-400 flex items-center justify-center cursor-not-allowed">
                              <span className="material-symbols-outlined font-bold">mail</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Fixture;
