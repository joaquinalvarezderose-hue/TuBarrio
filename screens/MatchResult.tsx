
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MatchScore } from '../utils/tournamentLogic';
import { supabase } from '../services/supabaseClient';

const MatchResult: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const savedTournament = localStorage.getItem('active_tournament');
  const tournament = location.state?.tournament || (savedTournament ? JSON.parse(savedTournament) : {
    id: 1,
    title: 'Abierto de Tenis TuBarrio',
    subtitle: 'Singles Caballeros',
  });

  const [players, setPlayers] = useState([
    { id: '', perfil_id: '', name: 'Jugador 1', puntos: 0, partidos_jugados: 0, sets_ganados: 0 },
    { id: '', perfil_id: '', name: 'Jugador 2', puntos: 0, partidos_jugados: 0, sets_ganados: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [scores, setScores] = useState({
    set1: { player1: 0, player2: 0 },
    set2: { player1: 0, player2: 0 },
    set3: { player1: 0, player2: 0 },
  });

  // Funciones de validación de tenis
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

  const updateScore = (set: 'set1' | 'set2' | 'set3', player: 'player1' | 'player2', delta: number) => {
    setScores(prev => {
      const current = prev[set];
      const newP1 = player === 'player1' ? Math.max(0, current.player1 + delta) : current.player1;
      const newP2 = player === 'player2' ? Math.max(0, current.player2 + delta) : current.player2;

      // Validación para Sets 1 y 2
      if (set !== 'set3') {
        const winnerBefore = getSetWinner(current.player1, current.player2);
        if (winnerBefore !== null && delta > 0) return prev;
        if (newP1 > 7 || newP2 > 7) return prev;
        if (newP1 === 7 && newP2 < 5) return prev;
        if (newP2 === 7 && newP1 < 5) return prev;
      }

      // Validación para Set 3 (Super Tie-break)
      if (set === 'set3') {
        const winnerBefore = getSuperTieBreakWinner(current.player1, current.player2);
        if (winnerBefore !== null && delta > 0) return prev;
      }

      return { ...prev, [set]: { player1: newP1, player2: newP2 } };
    });
  };

  const canConfirm = useMemo(() => matchWinner !== null, [matchWinner]);
  const hasDbPlayers = useMemo(() => Boolean(players[0]?.id && players[1]?.id), [players]);

  const buildMatchKey = (usedSets: Array<{ player1: number; player2: number }>) => {
    const playerIds = [players[0].perfil_id || '', players[1].perfil_id || ''].sort();
    const setsKey = usedSets.map((s) => `${s.player1}-${s.player2}`).join('_');
    const categoria = tournament.subtitle || 'General';
    const grupo = `TORNEO_${tournament.id}`;
    return `T:${tournament.id}|C:${categoria}|G:${grupo}|P:${playerIds.join('_')}|S:${setsKey}`;
  };

  useEffect(() => {
    const loadMatchPlayers = async () => {
      try {
        const grupo = `TORNEO_${tournament.id}`;
        const categoria = tournament.subtitle || 'General';

        const { data, error } = await supabase
          .from('torneo_jugadores')
          .select('id, perfil_id, puntos, partidos_jugados, sets_ganados')
          .eq('categoria', categoria)
          .eq('grupo', grupo)
          .limit(2);

        if (error || !data || data.length < 2) return;

        const profileIds = data.map((p: any) => p.perfil_id).filter(Boolean);
        let nameById: Record<string, string> = {};

        if (profileIds.length > 0) {
          const { data: perfiles } = await supabase
            .from('perfiles')
            .select('id, nombre_completo')
            .in('id', profileIds);

          nameById = Object.fromEntries((perfiles || []).map((p: any) => [p.id, p.nombre_completo || 'Jugador']));
        }

        setPlayers([
          {
            id: data[0].id,
            perfil_id: data[0].perfil_id,
            name: nameById[data[0].perfil_id] || 'Jugador 1',
            puntos: Number(data[0].puntos || 0),
            partidos_jugados: Number(data[0].partidos_jugados || 0),
            sets_ganados: Number(data[0].sets_ganados || 0),
          },
          {
            id: data[1].id,
            perfil_id: data[1].perfil_id,
            name: nameById[data[1].perfil_id] || 'Jugador 2',
            puntos: Number(data[1].puntos || 0),
            partidos_jugados: Number(data[1].partidos_jugados || 0),
            sets_ganados: Number(data[1].sets_ganados || 0),
          },
        ]);
      } catch (err) {
        console.error('No se pudieron cargar jugadores del torneo', err);
      }
    };

    loadMatchPlayers();
  }, [tournament.id, tournament.subtitle]);

  const handleConfirm = async () => {
    if (!canConfirm || !hasDbPlayers) return;
    setSaving(true);
    setSubmitError(null);
    let shouldNavigate = false;

    const usedSets = isMatchFinishedByTwoSets
      ? [scores.set1, scores.set2]
      : [scores.set1, scores.set2, scores.set3];

    const matchData: MatchScore = {
      player1Id: players[0].perfil_id,
      player2Id: players[1].perfil_id,
      sets: usedSets.map(s => ({ p1: s.player1, p2: s.player2 }))
    };

    try {
      const setsPlayer1 = usedSets.reduce((acc, s) => acc + (s.player1 > s.player2 ? 1 : 0), 0);
      const setsPlayer2 = usedSets.reduce((acc, s) => acc + (s.player2 > s.player1 ? 1 : 0), 0);

      let pts1 = 0;
      let pts2 = 0;
      if (setsPlayer1 > setsPlayer2) {
        pts1 = setsPlayer2 === 0 ? 3 : 2;
        pts2 = setsPlayer2 === 1 ? 1 : 0;
      } else {
        pts2 = setsPlayer1 === 0 ? 3 : 2;
        pts1 = setsPlayer1 === 1 ? 1 : 0;
      }

      const categoria = tournament.subtitle || 'General';
      const grupo = `TORNEO_${tournament.id}`;
      const matchKey = buildMatchKey(usedSets);
      const winnerPerfilId = setsPlayer1 > setsPlayer2 ? players[0].perfil_id : players[1].perfil_id;

      const { error: historyError } = await supabase
        .from('torneo_partidos_historial')
        .insert([
          {
            torneo_id: tournament.id,
            torneo_titulo: tournament.title || 'Torneo TuBarrio',
            categoria,
            grupo,
            jugador1_perfil_id: players[0].perfil_id,
            jugador2_perfil_id: players[1].perfil_id,
            ganador_perfil_id: winnerPerfilId,
            sets_json: usedSets.map((s) => ({ p1: s.player1, p2: s.player2 })),
            sets_jugador1: setsPlayer1,
            sets_jugador2: setsPlayer2,
            puntos_jugador1: pts1,
            puntos_jugador2: pts2,
            external_match_key: matchKey,
            cargado_por_perfil_id: (localStorage.getItem('app_user') ? JSON.parse(localStorage.getItem('app_user') as string)?.id : null) || null,
            cargado_en: new Date().toISOString(),
          },
        ]);

      if (historyError) {
        if ((historyError as any).code === '23505') {
          setSubmitError('Este partido ya fue cargado antes. No se volvió a sumar para evitar duplicados.');
          return;
        }
        throw historyError;
      }

      const savedResults = JSON.parse(localStorage.getItem('tournament_results') || '[]');
      savedResults.push(matchData);
      localStorage.setItem('tournament_results', JSON.stringify(savedResults));

      if (players[0].id) {
        const { error } = await supabase
          .from('torneo_jugadores')
          .update({
            puntos: players[0].puntos + pts1,
            partidos_jugados: players[0].partidos_jugados + 1,
            sets_ganados: players[0].sets_ganados + setsPlayer1,
          })
          .eq('id', players[0].id);
        if (error) throw error;
      }

      if (players[1].id) {
        const { error } = await supabase
          .from('torneo_jugadores')
          .update({
            puntos: players[1].puntos + pts2,
            partidos_jugados: players[1].partidos_jugados + 1,
            sets_ganados: players[1].sets_ganados + setsPlayer2,
          })
          .eq('id', players[1].id);
        if (error) throw error;
      }

      shouldNavigate = true;
    } catch (err) {
      console.error('Error guardando estadísticas del partido', err);
      setSubmitError('No pudimos guardar el partido en historial. Intenta nuevamente.');
    } finally {
      setSaving(false);
      if (shouldNavigate) {
        navigate('/standings', { state: { tournament } });
      }
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
                  {(['player1', 'player2'] as const).map(pKey => (
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
                {(['player1', 'player2'] as const).map(pKey => (
                  <div key={pKey} className="flex items-center justify-between">
                    <span className="text-gray-700 dark:text-gray-300 font-medium">{pKey === 'player1' ? players[0].name : players[1].name}</span>
                    <div className="flex items-center gap-3">
                      <button onClick={() => updateScore('set3', pKey, -1)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-600 dark:text-gray-300 active:scale-90">-</button>
                      <input 
                        className="text-xl font-black text-gray-900 dark:text-white w-12 text-center bg-transparent border-none focus:ring-0 p-0" 
                        type="number" 
                        value={scores.set3[pKey]}
                        onChange={(e) => setScores(prev => ({ ...prev, set3: { ...prev.set3, [pKey]: parseInt(e.target.value) || 0 } }))}
                      />
                      <button onClick={() => updateScore('set3', pKey, 1)} className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-black font-bold shadow-sm">+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {!canConfirm && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-800/20 flex gap-3 shadow-sm animate-pulse">
            <span className="material-symbols-outlined text-amber-500 text-lg">info</span>
            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed font-medium">
              Por favor completa los sets con resultados válidos para poder confirmar el partido.
            </p>
          </div>
        )}

        {!hasDbPlayers && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-800/20 flex gap-3 shadow-sm">
            <span className="material-symbols-outlined text-amber-500 text-lg">warning</span>
            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed font-medium">Para cargar el partido, primero deben existir dos jugadores registrados en este torneo.</p>
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
          disabled={!canConfirm || !hasDbPlayers || saving}
          className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${
            canConfirm && hasDbPlayers && !saving
              ? 'bg-primary text-gray-900 shadow-primary/30 active:scale-[0.98]' 
              : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'
          }`}
        >
          <span>{saving ? 'Guardando...' : 'Confirmar y Enviar'}</span>
          <span className="material-symbols-outlined text-xl">send</span>
        </button>
      </footer>
    </div>
  );
};

export default MatchResult;
