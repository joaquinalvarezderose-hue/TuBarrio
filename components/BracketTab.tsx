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
 currentUserId?: string;
}

const BracketTab: React.FC<BracketTabProps> = ({ torneo_id, categoria, onMatchClick, currentUserId }) => {
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
 jugador1_nombre: nameMap[match.jugador1_id] || 'A definir',
 jugador2_nombre: nameMap[match.jugador2_id] || 'A definir',
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

 // Lookup map for matches by ID (used for bracket connections)
 const matchById = useMemo(() => {
 const map: Record<string, BracketMatch> = {};
 matches.forEach(m => { map[m.id] = m; });
 return map;
 }, [matches]);

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
 <div className="rounded-xl bg-red-50 p-8 border border-red-200 ">
 <div className="flex flex-col items-center gap-4">
 <span className="material-symbols-outlined text-3xl text-red-500">error</span>
 <p className="text-red-700 font-medium">{error}</p>
 </div>
 </div>
 );
 }

 // No bracket matches found
 if (matches.length === 0) {
 return (
 <div className="rounded-xl bg-[#e8f6eb] p-8 shadow-sm border border-[#dbe6de] text-center">
 <div className="flex flex-col items-center gap-4">
 <div className="w-16 h-16 rounded-full bg-[#dbe6de] flex items-center justify-center">
 <span className="material-symbols-outlined text-2xl text-[#61896b]">sports_tennis</span>
 </div>
 <div className="text-center max-w-md">
 <h3 className="text-lg font-bold text-[#111813] mb-3">
 Playoffs no generados
 </h3>
 <p className="text-sm text-[#61896b] leading-relaxed">
  Las llaves de eliminación directa aún no han sido generadas para este torneo.
 </p>
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
 : 'bg-[#e8f6eb] text-[#61896b]'
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
 const isMyMatch = !isFinalized && currentUserId && (
 match.jugador1_id === currentUserId || match.jugador2_id === currentUserId
 );

 // Bracket connection: find the sibling match feeding into the same next match
 const nextMatch = match.siguiente_partido_id ? matchById[match.siguiente_partido_id] : null;
 const siblingMatch = match.siguiente_partido_id
 ? matches.find(m => m.siguiente_partido_id === match.siguiente_partido_id && m.id !== match.id)
 : null;
 const nextRoundName = nextMatch ? getRoundName(nextMatch.ronda) : null;

 return (
 <div
 key={match.id}
 onClick={() => onMatchClick?.(match)}
 className={`relative rounded-lg shadow-md overflow-hidden border-2 transition-all ${
 onMatchClick ? 'cursor-pointer active:scale-[0.98]' : ''
 } ${
 isMyMatch
 ? 'border-[#4a9c40] bg-primary/5 '
 : isFinalized
 ? 'bg-white border-[#61896b]'
 : 'bg-white border-[#dbe6de] hover:border-[#61896b]/50'
 }`}
 >
 {/* Player 1 */}
 <div className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 ${
 j1Won ? 'bg-[#61896b]/10' : ''
 }`}>
 <div className="flex items-center gap-2 flex-1 min-w-0">
 {j1Won && (
 <span className="material-symbols-outlined text-[#61896b] text-base flex-shrink-0">
 check_circle
 </span>
 )}
 <span className={`text-sm truncate ${
 j1Won ? 'font-bold text-[#111813] ' : 'text-gray-700 '
 } ${isFinalized && !j1Won ? 'opacity-50' : ''}`}>
 {match.jugador1_nombre || 'A definir'}
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
 j2Won ? 'font-bold text-[#111813] ' : 'text-gray-700 '
 } ${isFinalized && !j2Won ? 'opacity-50' : ''}`}>
 {match.jugador2_nombre || 'A definir'}
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
 <div className={`px-4 py-1.5 border-t border-gray-100 flex items-center justify-between ${isMyMatch ? 'bg-primary/10' : 'bg-gray-50 '}`}>
 <span className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">
 {match.estado === 'en_curso' ? '⏱ En curso' : '📅 Por jugar'}
 </span>
 {isMyMatch && (
 <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/20 text-green-700">
 Mi partido
 </span>
 )}
 </div>
 )}

 {/* Bracket connection footer */}
 {nextRoundName && (
 <div className="px-4 py-2 bg-[#f5faf6] border-t border-[#dbe6de] ">
 <p className="text-[10px] font-bold text-[#61896b] uppercase tracking-wide">
 → {nextRoundName}
 </p>
 {siblingMatch && (siblingMatch.jugador1_nombre || siblingMatch.jugador2_nombre) && (
 <p className="text-[10px] text-[#61896b]/70 mt-0.5 truncate">
 vs. ganador de {siblingMatch.jugador1_nombre || 'A definir'} / {siblingMatch.jugador2_nombre || 'A definir'}
 </p>
 )}
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

 {/* Champion Banner - only show after the true Final is played */}
 {(() => {
 const finalRoundNum = Math.max(...sortedRounds, 0);
 const finalMatches = matchesByRound[finalRoundNum] || [];
 const finalMatch = finalMatches[0];
 // Safety: only show if this round IS the Final (highest possible round for this bracket)
 const isTrueFinal = finalRoundNum === totalRounds;
 if (isTrueFinal && finalMatch && finalMatch.estado === 'finalizado' && finalMatch.ganador_id) {
 const winnerName = finalMatch.ganador_id === finalMatch.jugador1_id
 ? finalMatch.jugador1_nombre
 : finalMatch.jugador2_nombre;
 return (
 <div className="mt-6 bg-gradient-to-r from-[#f0fdf4] via-[#e8f6eb] to-[#f0fdf4] rounded-2xl p-6 border border-[#13ec49]/30 shadow-lg text-center">
 <div className="flex flex-col items-center gap-3">
 <div className="w-16 h-16 rounded-full bg-[#13ec49]/20 flex items-center justify-center shadow-md shadow-[#13ec49]/20">
 <span className="material-symbols-outlined text-[#13ec49] text-4xl">emoji_events</span>
 </div>
 <div>
 <p className="text-xs font-black uppercase tracking-widest text-[#61896b] mb-1">Campeon del Torneo</p>
 <h3 className="text-xl font-black text-[#111813] uppercase tracking-tight">
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
