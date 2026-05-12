import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';

interface BracketMatch {
  id: string;
  ronda: number;
  posicion_bracket: number;
  jugador1_id: string | null;
  jugador2_id: string | null;
  jugador1_nombre?: string;
  jugador2_nombre?: string;
  ganador_id: string | null;
  estado: string;
  set1_j1: number | null;
  set1_j2: number | null;
  set2_j1: number | null;
  set2_j2: number | null;
  set3_j1: number | null;
  set3_j2: number | null;
  siguiente_partido_id: string | null;
}

interface BracketTabProps {
  torneo_id: number;
  categoria: string;
  grupo?: string;
  selectedGroup?: string;
  onMatchClick?: (match: BracketMatch) => void;
}

const BracketTab: React.FC<BracketTabProps> = ({ torneo_id, categoria, onMatchClick }) => {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load bracket matches from Supabase
  useEffect(() => {
    const loadBracketMatches = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // First query: get bracket matches
        const { data: matchesData, error: queryError } = await supabase
          .from('partidos')
          .select(`
            id,
            ronda,
            posicion_bracket,
            jugador1_id,
            jugador2_id,
            ganador_id,
            estado,
            set1_j1,
            set1_j2,
            set2_j1,
            set2_j2,
            set3_j1,
            set3_j2,
            siguiente_partido_id
          `)
          .eq('torneo_id', torneo_id)
          .eq('categoria', categoria)
          .eq('bracket_tipo', 'eliminacion_directa')
          .order('ronda', { ascending: true })
          .order('posicion_bracket', { ascending: true });

        if (queryError) {
          console.error('Supabase query error:', queryError);
          throw queryError;
        }

        if (matchesData && matchesData.length > 0) {
          // Get unique player IDs
          const playerIds = [...new Set([
            ...matchesData.map(m => m.jugador1_id).filter(Boolean),
            ...matchesData.map(m => m.jugador2_id).filter(Boolean)
          ])];

          // Fetch player names
          const { data: profilesData, error: profilesError } = await supabase
            .from('perfiles')
            .select('id, nombre_completo')
            .in('id', playerIds);

          if (profilesError) {
            console.error('Profiles query error:', profilesError);
          }

          // Create name lookup map
          const nameMap: Record<string, string> = {};
          profilesData?.forEach((p: any) => {
            nameMap[p.id] = p.nombre_completo || 'Jugador';
          });

          // Transform data to include player names
          const transformedMatches: BracketMatch[] = matchesData.map((match: any) => ({
            ...match,
            jugador1_nombre: nameMap[match.jugador1_id] || 'TBD',
            jugador2_nombre: nameMap[match.jugador2_id] || 'TBD',
          }));
          setMatches(transformedMatches);
        } else {
          setMatches([]);
        }
      } catch (err: any) {
        console.error('Error loading bracket matches:', err);
        console.error('Error details:', {
          message: err?.message,
          code: err?.code,
          details: err?.details,
          hint: err?.hint,
          torneo_id,
          categoria
        });
        setError(`Error: ${err?.message || 'Error al cargar las llaves'}`);
      } finally {
        setLoading(false);
      }
    };

    loadBracketMatches();
  }, [torneo_id, categoria]);

  // Group matches by round
  const matchesByRound = useMemo(() => {
    const grouped: Record<number, BracketMatch[]> = {};
    matches.forEach(match => {
      if (!grouped[match.ronda]) {
        grouped[match.ronda] = [];
      }
      grouped[match.ronda].push(match);
    });
    return grouped;
  }, [matches]);

  // Calculate total rounds based on matches in round 1
  // 1 match → Final, 2 matches → Semis+Final, 4 matches → Cuartos+Semis+Final
  const totalRounds = useMemo(() => {
    const round1Matches = matchesByRound[1]?.length || 0;
    if (round1Matches === 0) return Object.keys(matchesByRound).length;
    return Math.ceil(Math.log2(round1Matches)) + 1;
  }, [matchesByRound]);

  // Get round name based on round number (ascending order: 1=first round)
  const getRoundName = (ronda: number) => {
    const roundNames: Record<number, string> = {
      1: 'Dieciseisavos',
      2: 'Octavos de Final',
      3: 'Cuartos de Final',
      4: 'Semifinal',
      5: 'Final',
    };
    // Map ronda number to proper name based on total rounds
    // If totalRounds is 3 (Cuartos→Semis→Final), then ronda 1 = Cuartos
    const nameIndex = ronda + (5 - totalRounds);
    return roundNames[nameIndex] || `Ronda ${ronda}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#61896b] mx-auto mb-2"></div>
          <p className="text-sm text-[#61896b]">Cargando llaves...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 dark:bg-red-900/10 p-8 border border-red-200 dark:border-red-800/30">
        <div className="flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-3xl text-red-500">error</span>
          <p className="text-red-700 dark:text-red-300 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  // No bracket matches found
  if (matches.length === 0) {
    return (
      <div className="rounded-xl bg-[#e8f6eb] dark:bg-[#1a3a22] p-8 shadow-sm border border-[#dbe6de] dark:border-[#2a5a32] text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#dbe6de] dark:bg-[#2a5a32] flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl text-[#61896b]">sports_tennis</span>
          </div>
          <div className="text-center max-w-md">
            <h3 className="text-lg font-bold text-[#111813] dark:text-white mb-3">
              Playoffs no generados
            </h3>
            <p className="text-sm text-[#61896b] leading-relaxed mb-4">
              Las llaves de eliminación directa aún no han sido generadas para este torneo.
              <br /><br />
              <strong>Para generar los playoffs desde Supabase:</strong>
            </p>
            <div className="text-left text-xs text-[#61896b] bg-white/50 dark:bg-black/20 p-4 rounded-lg">
              <ol className="list-decimal list-inside space-y-2">
                <li>Verificá que <code>torneo_configuracion.crear_playoffs_eliminacion_directa = true</code></li>
                <li>Ejecutá la función SQL:
                  <pre className="mt-1 bg-gray-100 dark:bg-gray-800 p-2 rounded text-[10px] overflow-x-auto">
{`SELECT * FROM generar_playoffs_eliminacion_directa_torneo(
  ${torneo_id}, 
  '${categoria}'
);`}
                  </pre>
                </li>
              </ol>
            </div>
          </div>
          <div className="flex flex-col gap-3 text-xs text-[#61896b] w-full max-w-sm mt-2">
            <div className="flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-sm flex-shrink-0">info</span>
              <span className="text-center">Los cruces serán: #1 Grupo A vs #2 Grupo B, #1 Grupo B vs #2 Grupo A</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render bracket with tournament-style aesthetic
  // Sort ascending: First rounds on left, Final on right
  const sortedRounds = Object.keys(matchesByRound)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-6 min-w-fit" style={{ minHeight: '300px' }}>
        {sortedRounds.map((ronda) => {
          const roundMatches = matchesByRound[ronda];
          const isFinal = ronda === totalRounds;
          
          return (
            <div key={ronda} className="flex flex-col flex-1 min-w-[260px]">
              {/* Round Header */}
              <div className="text-center mb-4">
                <div className={`inline-block px-4 py-1.5 rounded-full ${
                  isFinal 
                    ? 'bg-gradient-to-r from-[#61896b] to-[#7ba585] text-white shadow-md'
                    : 'bg-[#e8f6eb] dark:bg-[#1a3a22] text-[#61896b]'
                }`}>
                  <h3 className="text-sm font-black uppercase tracking-wide">
                    {isFinal && <span className="mr-1">🏆</span>}
                    {getRoundName(ronda)}
                  </h3>
                </div>
              </div>

              {/* Matches in this round - distributed evenly */}
              <div className="flex-1 flex flex-col justify-around gap-4">
                {roundMatches.map((match: BracketMatch) => {
                  const isFinalized = match.estado === 'finalizado';
                  const j1Won = match.ganador_id === match.jugador1_id;
                  const j2Won = match.ganador_id === match.jugador2_id;
                  
                  return (
                    <div
                      key={match.id}
                      onClick={() => onMatchClick?.(match)}
                      className={`relative bg-white dark:bg-[#1a3a22] rounded-lg shadow-md overflow-hidden border-2 transition-all ${
                        onMatchClick ? 'cursor-pointer active:scale-[0.98]' : ''
                      } ${
                        isFinalized
                          ? 'border-[#61896b]'
                          : 'border-[#dbe6de] dark:border-[#2a5a32] hover:border-[#61896b]/50'
                      }`}
                    >
                      {/* Player 1 */}
                      <div className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/10 ${
                        j1Won ? 'bg-[#61896b]/10' : ''
                      }`}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {j1Won && (
                            <span className="material-symbols-outlined text-[#61896b] text-base flex-shrink-0">
                              check_circle
                            </span>
                          )}
                          <span className={`text-sm truncate ${
                            j1Won ? 'font-bold text-[#111813] dark:text-white' : 'text-gray-700 dark:text-gray-300'
                          } ${isFinalized && !j1Won ? 'opacity-50' : ''}`}>
                            {match.jugador1_nombre || 'TBD'}
                          </span>
                        </div>
                        {isFinalized && (
                          <div className="flex gap-1.5 ml-2">
                            {match.set1_j1 !== null && (
                              <span className={`text-sm font-black ${j1Won ? 'text-[#61896b]' : 'text-gray-400'}`}>
                                {match.set1_j1}
                              </span>
                            )}
                            {match.set2_j1 !== null && (
                              <span className={`text-sm font-black ${j1Won ? 'text-[#61896b]' : 'text-gray-400'}`}>
                                {match.set2_j1}
                              </span>
                            )}
                            {match.set3_j1 !== null && (
                              <span className={`text-sm font-black ${j1Won ? 'text-[#61896b]' : 'text-gray-400'}`}>
                                {match.set3_j1}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Player 2 */}
                      <div className={`flex items-center justify-between px-4 py-3 ${
                        j2Won ? 'bg-[#61896b]/10' : ''
                      }`}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {j2Won && (
                            <span className="material-symbols-outlined text-[#61896b] text-base flex-shrink-0">
                              check_circle
                            </span>
                          )}
                          <span className={`text-sm truncate ${
                            j2Won ? 'font-bold text-[#111813] dark:text-white' : 'text-gray-700 dark:text-gray-300'
                          } ${isFinalized && !j2Won ? 'opacity-50' : ''}`}>
                            {match.jugador2_nombre || 'TBD'}
                          </span>
                        </div>
                        {isFinalized && (
                          <div className="flex gap-1.5 ml-2">
                            {match.set1_j2 !== null && (
                              <span className={`text-sm font-black ${j2Won ? 'text-[#61896b]' : 'text-gray-400'}`}>
                                {match.set1_j2}
                              </span>
                            )}
                            {match.set2_j2 !== null && (
                              <span className={`text-sm font-black ${j2Won ? 'text-[#61896b]' : 'text-gray-400'}`}>
                                {match.set2_j2}
                              </span>
                            )}
                            {match.set3_j2 !== null && (
                              <span className={`text-sm font-black ${j2Won ? 'text-[#61896b]' : 'text-gray-400'}`}>
                                {match.set3_j2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Status footer */}
                      {!isFinalized && (
                        <div className="px-4 py-1.5 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/10">
                          <span className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">
                            {match.estado === 'en_curso' ? '⏱ En curso' : '📅 Por jugar'}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Champion Banner - show winner of the final */}
      {(() => {
        const finalRoundNum = Math.max(...sortedRounds, 0);
        const finalMatches = matchesByRound[finalRoundNum] || [];
        const finalMatch = finalMatches[0];
        if (finalMatch && finalMatch.estado === 'finalizado' && finalMatch.ganador_id) {
          const winnerName = finalMatch.ganador_id === finalMatch.jugador1_id
            ? finalMatch.jugador1_nombre
            : finalMatch.jugador2_nombre;
          return (
            <div className="mt-6 bg-gradient-to-r from-[#f0fdf4] via-[#e8f6eb] to-[#f0fdf4] dark:from-[#1a3a22] dark:via-[#1a3a22]/80 dark:to-[#1a3a22] rounded-2xl p-6 border border-[#13ec49]/30 shadow-lg text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-[#13ec49]/20 flex items-center justify-center shadow-md shadow-[#13ec49]/20">
                  <span className="material-symbols-outlined text-[#13ec49] text-4xl">emoji_events</span>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-[#61896b] mb-1">Campeon del Torneo</p>
                  <h3 className="text-xl font-black text-[#111813] dark:text-white uppercase tracking-tight">
                    {winnerName || 'Ganador'}
                  </h3>
                </div>
                <p className="text-sm text-[#61896b] font-medium">
                  Gano la final del torneo
                </p>
              </div>
            </div>
          );
        }
        return null;
      })()}
    </div>
  );
};

export default BracketTab;
