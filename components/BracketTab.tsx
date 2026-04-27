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
}

const BracketTab: React.FC<BracketTabProps> = ({ torneo_id, categoria }) => {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load bracket matches from Supabase
  useEffect(() => {
    const loadBracketMatches = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Query partidos with bracket_tipo = 'eliminacion_directa'
        const { data, error: queryError } = await supabase
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
            siguiente_partido_id,
            j1:jugador1_id(perfiles(nombre)),
            j2:jugador2_id(perfiles(nombre))
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

        if (data && data.length > 0) {
          // Transform data to include player names
          const transformedMatches: BracketMatch[] = data.map((match: any) => ({
            ...match,
            jugador1_nombre: match.j1?.perfiles?.nombre || 'TBD',
            jugador2_nombre: match.j2?.perfiles?.nombre || 'TBD',
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

  // Get round name
  const getRoundName = (ronda: number, totalRounds: number) => {
    const roundNames: Record<number, string> = {
      1: 'Final',
      2: 'Semifinal',
      3: 'Cuartos de Final',
      4: 'Octavos de Final',
      5: 'Dieciseisavos',
    };
    
    // Calculate from the end if we know total rounds
    const roundsFromEnd = totalRounds - ronda + 1;
    return roundNames[roundsFromEnd] || `Ronda ${ronda}`;
  };

  // Calculate total rounds
  const totalRounds = useMemo(() => {
    return Object.keys(matchesByRound).length;
  }, [matchesByRound]);

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

  // Render bracket
  return (
    <div className="space-y-8">
      {Object.entries(matchesByRound).map(([ronda, roundMatches]: [string, BracketMatch[]]) => (
        <div key={ronda} className="space-y-4">
          <h3 className="text-lg font-bold text-[#111813] dark:text-white text-center">
            {getRoundName(Number(ronda), totalRounds)}
          </h3>
          <div className="grid gap-4">
            {roundMatches.map((match: BracketMatch) => (
              <div 
                key={match.id} 
                className={`bg-white dark:bg-[#1a3a22] rounded-xl p-4 shadow-sm border ${
                  match.estado === 'finalizado' 
                    ? 'border-[#61896b]/30' 
                    : 'border-[#dbe6de] dark:border-[#2a5a32]'
                }`}
              >
                <div className="flex items-center justify-between">
                  {/* Player 1 */}
                  <div className={`flex-1 text-center ${match.ganador_id === match.jugador1_id ? 'font-bold text-[#61896b]' : ''}`}>
                    <div className="text-sm">{match.jugador1_nombre}</div>
                    {match.estado === 'finalizado' && (
                      <div className="text-xs text-gray-500 mt-1">
                        {match.set1_j1 !== null && `${match.set1_j1}-${match.set1_j2}`}
                        {match.set2_j1 !== null && `, ${match.set2_j1}-${match.set2_j2}`}
                        {match.set3_j1 !== null && `, ${match.set3_j1}-${match.set3_j2}`}
                      </div>
                    )}
                  </div>

                  {/* VS */}
                  <div className="px-4 flex flex-col items-center">
                    <span className="text-xs font-black text-gray-300">VS</span>
                    {match.estado === 'finalizado' && match.ganador_id && (
                      <span className="material-symbols-outlined text-[#61896b] text-sm mt-1">
                        check_circle
                      </span>
                    )}
                  </div>

                  {/* Player 2 */}
                  <div className={`flex-1 text-center ${match.ganador_id === match.jugador2_id ? 'font-bold text-[#61896b]' : ''}`}>
                    <div className="text-sm">{match.jugador2_nombre}</div>
                    {match.estado === 'finalizado' && (
                      <div className="text-xs text-gray-500 mt-1">
                        {match.set1_j1 !== null && `${match.set1_j2}-${match.set1_j1}`}
                        {match.set2_j1 !== null && `, ${match.set2_j2}-${match.set2_j1}`}
                        {match.set3_j1 !== null && `, ${match.set3_j2}-${match.set3_j1}`}
                      </div>
                    )}
                  </div>
                </div>

                {/* Status badge */}
                <div className="mt-3 text-center">
                  <span className={`text-[10px] px-2 py-1 rounded-full uppercase font-bold ${
                    match.estado === 'finalizado' 
                      ? 'bg-[#61896b]/20 text-[#61896b]' 
                      : match.estado === 'en_curso'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {match.estado === 'finalizado' ? 'Finalizado' : match.estado === 'en_curso' ? 'En curso' : 'Pendiente'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default BracketTab;
