import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

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

const emptyScores: ScoreState = {
  set1: { player1: 0, player2: 0 },
  set2: { player1: 0, player2: 0 },
  set3: { player1: 0, player2: 0 },
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
  const currentUserId = String(appUser?.id || '');
  const selectedPartidoId = location.state?.partidoId ? String(location.state.partidoId) : '';

  const [players, setPlayers] = useState<PlayerCard[]>([
    { id: '', perfil_id: '', name: 'Jugador 1', puntos: 0, partidos_jugados: 0, sets_ganados: 0 },
    { id: '', perfil_id: '', name: 'Jugador 2', puntos: 0, partidos_jugados: 0, sets_ganados: 0 },
  ]);
  const [partido, setPartido] = useState<MatchContext | null>(null);
  const [scores, setScores] = useState<ScoreState>(emptyScores);
  const [loadingMatch, setLoadingMatch] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [proposalState, setProposalState] = useState<'idle' | 'pendiente' | 'confirmado' | 'discrepancia'>('idle');
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [tournamentStatus, setTournamentStatus] = useState<string>('RECRUITING');

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
  const canConfirm = useMemo(() => matchWinner !== null && Boolean(partido?.id) && isParticipant && !blockReason, [matchWinner, partido?.id, isParticipant, blockReason]);
  const hasDbPlayers = useMemo(() => Boolean(players[0]?.id && players[1]?.id), [players]);

  const updateScore = (set: keyof ScoreState, player: 'player1' | 'player2', delta: number) => {
    setScores((prev) => {
      const current = prev[set];
      const newP1 = player === 'player1' ? Math.max(0, current.player1 + delta) : current.player1;
      const newP2 = player === 'player2' ? Math.max(0, current.player2 + delta) : current.player2;

      if (set !== 'set3') {
        const winnerBefore = getSetWinner(current.player1, current.player2);
        if (winnerBefore !== null && delta > 0) return prev;
        if (newP1 > 7 || newP2 > 7) return prev;
        if (newP1 === 7 && newP2 < 5) return prev;
        if (newP2 === 7 && newP1 < 5) return prev;
      }

      if (set === 'set3') {
        const winnerBefore = getSuperTieBreakWinner(current.player1, current.player2);
        if (winnerBefore !== null && delta > 0) return prev;
      }

      return { ...prev, [set]: { player1: newP1, player2: newP2 } };
    });
  };

  useEffect(() => {
    const loadMatchContext = async () => {
      setLoadingMatch(true);
      setSubmitError(null);
      setBlockReason(null);

      try {
        if (!currentUserId) {
          setSubmitError('No hay un usuario activo para cargar el resultado.');
          return;
        }

        const grupo = `TORNEO_${tournament.id}`;
        const categoria = tournament.subtitle || 'General';

        const { data: statusRow, error: statusError } = await supabase
          .from('torneo_estado')
          .select('estado')
          .eq('torneo_id', tournament.id)
          .maybeSingle();

        if (statusError) throw statusError;

        const normalizedStatus = String(statusRow?.estado || 'RECRUITING').trim().toUpperCase();
        setTournamentStatus(normalizedStatus);

        if (normalizedStatus === 'FINALIZADO') {
          setPartido(null);
          setBlockReason('Este torneo ya finalizo. La carga de resultados esta cerrada y disponible solo para consulta.');
          return;
        }

        // Primero validamos si el torneo tiene suficientes inscriptos reales para habilitar la carga.
        const { data: inscritosCategoria, error: inscritosCategoriaError } = await supabase
          .from('torneo_jugadores')
          .select('id, perfil_id, puntos, partidos_jugados, sets_ganados')
          .eq('torneo_id', tournament.id)
          .eq('categoria', categoria)
          .eq('grupo', grupo);

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
          setBlockReason(`Aun no se puede cargar resultados: hay ${ordenados.length} jugador(es) inscripto(s) y se necesitan al menos 2.`);
          return;
        }

        let partidoQuery = supabase
          .from('partidos')
          .select('id, jornada, estado, jugador1_id, jugador2_id, resultado')
          .eq('torneo_id', tournament.id)
          .eq('categoria', categoria)
          .eq('grupo', grupo);

        if (selectedPartidoId) {
          partidoQuery = partidoQuery.eq('id', selectedPartidoId);
        } else {
          partidoQuery = partidoQuery
            .or(`jugador1_id.eq.${currentUserId},jugador2_id.eq.${currentUserId}`)
            .in('estado', ['programado', 'en_curso'])
            .order('jornada', { ascending: true })
            .limit(1);
        }

        const { data: partidoRows, error: partidoError } = await partidoQuery;
        if (partidoError) throw partidoError;

        const targetPartido = Array.isArray(partidoRows) ? partidoRows[0] : null;
        if (!targetPartido) {
          setBlockReason('Todavia no hay un partido generado para esta jornada.');
          return;
        }

        setPartido({
          id: String(targetPartido.id),
          jornada: Number(targetPartido.jornada || 1),
          estado: String(targetPartido.estado || 'programado'),
          jugador1_id: String(targetPartido.jugador1_id),
          jugador2_id: String(targetPartido.jugador2_id),
          resultado: targetPartido.resultado || null,
        });

        const playerIds = [targetPartido.jugador1_id, targetPartido.jugador2_id].filter(Boolean);
        const [{ data: jugadores, error: jugadoresError }, { data: perfiles, error: perfilesError }, { data: propuesta }] = await Promise.all([
          supabase
            .from('torneo_jugadores')
            .select('id, perfil_id, puntos, partidos_jugados, sets_ganados')
            .eq('torneo_id', tournament.id)
            .eq('categoria', categoria)
            .eq('grupo', grupo)
            .in('perfil_id', playerIds),
          supabase
            .from('perfiles')
            .select('id, nombre_completo')
            .in('id', playerIds),
          supabase
            .from('torneo_propuestas_partido')
            .select('estado, sets_json_j1, sets_json_j2')
            .eq('partido_id', targetPartido.id)
            .maybeSingle(),
        ]);

        if (jugadoresError) throw jugadoresError;
        if (perfilesError) throw perfilesError;

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
          const ownSets = currentUserId === String(targetPartido.jugador1_id) ? propuesta.sets_json_j1 : propuesta.sets_json_j2;
          if (Array.isArray(ownSets)) {
            setScores({
              set1: { player1: Number(ownSets[0]?.p1 || 0), player2: Number(ownSets[0]?.p2 || 0) },
              set2: { player1: Number(ownSets[1]?.p1 || 0), player2: Number(ownSets[1]?.p2 || 0) },
              set3: { player1: Number(ownSets[2]?.p1 || 0), player2: Number(ownSets[2]?.p2 || 0) },
            });
          }
        }
      } catch (error) {
        console.error('No se pudo cargar el contexto del partido', error);
        setSubmitError('No pudimos preparar la carga del partido.');
      } finally {
        setLoadingMatch(false);
      }
    };

    loadMatchContext();
  }, [currentUserId, selectedPartidoId, tournament.id, tournament.subtitle]);

  const handleConfirm = async () => {
    if (!canConfirm || !partido?.id) return;

    setSaving(true);
    setSubmitError(null);
    setSubmitMessage(null);

    const usedSets = isMatchFinishedByTwoSets
      ? [scores.set1, scores.set2]
      : [scores.set1, scores.set2, scores.set3];

    try {
      const payload = usedSets.map((setRow) => ({ p1: setRow.player1, p2: setRow.player2 }));
      const { data, error } = await supabase.rpc('proponer_resultado_partido', {
        p_partido_id: partido.id,
        p_reportado_por: currentUserId,
        p_sets_json: payload,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? (data[0] as ProposalRpcRow | undefined) : undefined;
      if (!row) {
        throw new Error('La RPC no devolvio resultado.');
      }

      setProposalState(row.estado_propuesta || 'idle');
      setSubmitMessage(row.mensaje || null);

      if (row.estado_propuesta === 'discrepancia') {
        setSubmitError(row.mensaje || 'El rival cargo un resultado diferente.');
        return;
      }

      if (row.confirmacion_completa) {
        navigate('/standings', { state: { tournament } });
      }
    } catch (error) {
      console.error('Error enviando la propuesta de resultado', error);
      setSubmitError('No pudimos enviar el resultado del partido.');
    } finally {
      setSaving(false);
    }
  };

  return (
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
        <section className="bg-white dark:bg-white/5 rounded-xl shadow-sm overflow-hidden border border-gray-100 dark:border-white/10">
          <div className="p-4 bg-gradient-to-r from-primary/10 to-transparent">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{tournament.title} - {tournament.subtitle}</p>
            <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-300">
              <span>Jornada {partido?.jornada || 1}</span>
              <span className="font-bold uppercase">{partido?.estado || 'sin partido'}</span>
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className="flex flex-col items-center gap-2 flex-1">
                <div className={`w-16 h-16 rounded-full ring-2 ${matchWinner === 1 ? 'ring-primary' : 'ring-gray-200'} bg-cover bg-center transition-all`} style={{ backgroundImage: "url('https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=120&h=120&fit=crop')" }}></div>
                <span className="text-sm font-bold text-gray-900 dark:text-white">{players[0].name}</span>
                {matchWinner === 1 && <span className="bg-primary/20 text-green-700 dark:text-primary text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">GANADOR</span>}
              </div>
              <div className="flex flex-col items-center px-4"><span className="text-xs font-black text-gray-300 italic uppercase">VS</span></div>
              <div className={`flex flex-col items-center gap-2 flex-1 transition-all ${matchWinner === 1 ? 'opacity-40' : ''}`}>
                <div className={`w-16 h-16 rounded-full ring-2 ${matchWinner === 2 ? 'ring-primary' : 'ring-gray-200'} bg-cover bg-center`} style={{ backgroundImage: "url('https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop')" }}></div>
                <span className="text-sm font-bold text-gray-900 dark:text-white">{players[1].name}</span>
                {matchWinner === 2 && <span className="bg-primary/20 text-green-700 dark:text-primary text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">GANADOR</span>}
              </div>
            </div>
          </div>
        </section>

        {blockReason && !loadingMatch && (
          <section className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-800/20 flex gap-3 shadow-sm">
            <span className="material-symbols-outlined text-amber-500 text-lg">block</span>
            <div>
              <p className="text-sm text-amber-800 dark:text-amber-200 font-bold">Carga deshabilitada</p>
              <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed font-medium">{blockReason}</p>
            </div>
          </section>
        )}

        {tournamentStatus === 'FINALIZADO' && !loadingMatch && (
          <section className="p-4 bg-slate-50 dark:bg-slate-900/20 rounded-xl border border-slate-200 dark:border-slate-700/30 flex gap-3 shadow-sm">
            <span className="material-symbols-outlined text-slate-500 text-lg">history</span>
            <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
              Torneo finalizado: los resultados quedan congelados para historial.
            </p>
          </section>
        )}

        {!blockReason && (
          <div className="space-y-4">
          {(['set1', 'set2'] as const).map((setKey, idx) => {
            const isComplete = getSetWinner(scores[setKey].player1, scores[setKey].player2) !== null;
            return (
              <div key={setKey} className={`bg-white dark:bg-white/5 p-4 rounded-xl shadow-sm border transition-colors ${isComplete ? 'border-primary/40' : 'border-gray-100 dark:border-white/10'}`}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">Set {idx + 1}</h3>
                  {isComplete && <span className="material-symbols-outlined text-primary text-sm">check_circle</span>}
                </div>
                <div className="space-y-4">
                  {(['player1', 'player2'] as const).map((pKey) => (
                    <div key={pKey} className="flex items-center justify-between">
                      <span className="text-gray-700 dark:text-gray-300 font-medium">{pKey === 'player1' ? players[0].name : players[1].name}</span>
                      <div className="flex items-center gap-3">
                        <button onClick={() => updateScore(setKey, pKey, -1)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-600 dark:text-gray-300 active:scale-90">-</button>
                        <span className="text-xl font-black text-gray-900 dark:text-white w-6 text-center">{scores[setKey][pKey]}</span>
                        <button onClick={() => updateScore(setKey, pKey, 1)} className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-black font-bold active:scale-90 shadow-sm">+</button>
                      </div>
                    </div>
                  ))}
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
                {(['player1', 'player2'] as const).map((pKey) => (
                  <div key={pKey} className="flex items-center justify-between">
                    <span className="text-gray-700 dark:text-gray-300 font-medium">{pKey === 'player1' ? players[0].name : players[1].name}</span>
                    <div className="flex items-center gap-3">
                      <button onClick={() => updateScore('set3', pKey, -1)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-600 dark:text-gray-300 active:scale-90">-</button>
                      <input
                        className="text-xl font-black text-gray-900 dark:text-white w-12 text-center bg-transparent border-none focus:ring-0 p-0"
                        type="number"
                        value={scores.set3[pKey]}
                        onChange={(e) => setScores((prev) => ({ ...prev, set3: { ...prev.set3, [pKey]: parseInt(e.target.value, 10) || 0 } }))}
                      />
                      <button onClick={() => updateScore('set3', pKey, 1)} className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-black font-bold shadow-sm">+</button>
                    </div>
                  </div>
                ))}
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

        {!canConfirm && !loadingMatch && !blockReason && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-800/20 flex gap-3 shadow-sm animate-pulse">
            <span className="material-symbols-outlined text-amber-500 text-lg">info</span>
            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed font-medium">Por favor completa los sets con resultados validos para poder enviar el partido.</p>
          </div>
        )}

        {!hasDbPlayers && !loadingMatch && !blockReason && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-800/20 flex gap-3 shadow-sm">
            <span className="material-symbols-outlined text-amber-500 text-lg">warning</span>
            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed font-medium">Para cargar el partido, los dos jugadores deben existir dentro del torneo correcto.</p>
          </div>
        )}

        {!isParticipant && !loadingMatch && !submitError && (
          <div className="p-4 bg-slate-50 dark:bg-slate-900/20 rounded-xl border border-slate-100 dark:border-slate-800/20 flex gap-3 shadow-sm">
            <span className="material-symbols-outlined text-slate-500 text-lg">visibility</span>
            <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed font-medium">Estas viendo el detalle de un partido, pero solo sus jugadores pueden enviar o confirmar el resultado.</p>
          </div>
        )}

        {proposalState === 'pendiente' && submitMessage && !submitError && (
          <div className="p-4 bg-sky-50 dark:bg-sky-900/10 rounded-xl border border-sky-100 dark:border-sky-800/20 flex gap-3 shadow-sm">
            <span className="material-symbols-outlined text-sky-500 text-lg">schedule</span>
            <p className="text-[11px] text-sky-700 dark:text-sky-300 leading-relaxed font-medium">{submitMessage}</p>
          </div>
        )}

        {submitError && (
          <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-800/20 flex gap-3 shadow-sm">
            <span className="material-symbols-outlined text-red-500 text-lg">error</span>
            <p className="text-[11px] text-red-700 dark:text-red-300 leading-relaxed font-medium">{submitError}</p>
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 md:static max-w-2xl mx-auto p-6 bg-gradient-to-t from-background-light dark:from-background-dark to-transparent z-[60] md:bg-none">
        <button
          onClick={handleConfirm}
          disabled={!canConfirm || !hasDbPlayers || saving || loadingMatch}
          className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${
            canConfirm && hasDbPlayers && !saving && !loadingMatch
              ? 'bg-primary text-gray-900 shadow-primary/30 active:scale-[0.98]'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'
          }`}
        >
          <span>{saving ? 'Enviando...' : 'Enviar Resultado'}</span>
          <span className="material-symbols-outlined text-xl">send</span>
        </button>
      </footer>
    </div>
  );
};

export default MatchResult;
