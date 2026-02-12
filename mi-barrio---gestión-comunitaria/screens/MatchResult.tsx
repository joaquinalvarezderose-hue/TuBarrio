
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MatchScore } from '../utils/tournamentLogic';

const MatchResult: React.FC = () => {
  const navigate = useNavigate();

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

  const handleConfirm = () => {
    if (!canConfirm) return;

    const matchData: MatchScore = {
      player1Id: "alex_r",
      player2Id: "juan_m",
      sets: (isMatchFinishedByTwoSets 
        ? [scores.set1, scores.set2] 
        : [scores.set1, scores.set2, scores.set3]
      ).map(s => ({ p1: s.player1, p2: s.player2 }))
    };

    const savedResults = JSON.parse(localStorage.getItem('tournament_results') || '[]');
    savedResults.push(matchData);
    localStorage.setItem('tournament_results', JSON.stringify(savedResults));

    navigate('/standings');
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
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Torneo TuBarrio - Categoría A</p>
            <div className="flex items-center justify-between mt-3">
              <div className="flex flex-col items-center gap-2 flex-1">
                <div className={`w-16 h-16 rounded-full ring-2 ${matchWinner === 1 ? 'ring-primary' : 'ring-gray-200'} bg-cover bg-center transition-all`} style={{ backgroundImage: "url('https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=120&h=120&fit=crop')" }}></div>
                <span className="text-sm font-bold text-gray-900 dark:text-white">Alex R.</span>
                {matchWinner === 1 && <span className="bg-primary/20 text-green-700 dark:text-primary text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">GANADOR</span>}
              </div>
              <div className="flex flex-col items-center px-4"><span className="text-xs font-black text-gray-300 italic uppercase">VS</span></div>
              <div className={`flex flex-col items-center gap-2 flex-1 transition-all ${matchWinner === 1 ? 'opacity-40' : ''}`}>
                <div className={`w-16 h-16 rounded-full ring-2 ${matchWinner === 2 ? 'ring-primary' : 'ring-gray-200'} bg-cover bg-center`} style={{ backgroundImage: "url('https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop')" }}></div>
                <span className="text-sm font-bold text-gray-900 dark:text-white">Juan M.</span>
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
                      <span className="text-gray-700 dark:text-gray-300 font-medium">{pKey === 'player1' ? 'Alex R.' : 'Juan M.'}</span>
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
                    <span className="text-gray-700 dark:text-gray-300 font-medium">{pKey === 'player1' ? 'Alex R.' : 'Juan M.'}</span>
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
      </main>

      <footer className="fixed bottom-0 left-0 right-0 md:static max-w-2xl mx-auto p-6 bg-gradient-to-t from-background-light dark:from-background-dark to-transparent z-[60] md:bg-none">
        <button 
          onClick={handleConfirm}
          disabled={!canConfirm}
          className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${
            canConfirm 
              ? 'bg-primary text-gray-900 shadow-primary/30 active:scale-[0.98]' 
              : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'
          }`}
        >
          <span>Confirmar y Enviar</span>
          <span className="material-symbols-outlined text-xl">send</span>
        </button>
      </footer>
    </div>
  );
};

export default MatchResult;
