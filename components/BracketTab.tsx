import React, { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Database } from '../types/database.types';

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
 es_wo: boolean;
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
 // En dobles, "mi identidad" para resaltar "Mi partido" es mi equipo, no mi perfil_id.
 const [comparisonId, setComparisonId] = useState<string | undefined>(currentUserId);

 // Load bracket matches from Supabase
 useEffect(() => {
 const loadBracketMatches = async () => {
 setLoading(true);
 setError(null);

 try {
 let isDobles = false;
 try {
 const { data: configRow } = await supabase
 .from('torneo_configuracion')
 .select('modalidad')
 .eq('torneo_id', torneo_id)
 .maybeSingle();
 isDobles = configRow?.modalidad === 'dobles';
 } catch {
 isDobles = false;
 }

 // First query: get bracket matches
 const { data: matchesData, error: queryError } = isDobles
 ? await supabase
 .from('partidos')
 .select(`
 id,
 ronda,
 posicion_bracket,
 equipo1_id,
 equipo2_id,
 equipo_ganador_id,
 estado,
 set1_j1,
 set1_j2,
 set2_j1,
 set2_j2,
 set3_j1,
 set3_j2,
 es_wo,
 siguiente_partido_id
 `)
 .eq('torneo_id', torneo_id)
 .eq('categoria', categoria)
 .eq('bracket_tipo', 'eliminacion_directa')
 .order('ronda', { ascending: true })
 .order('posicion_bracket', { ascending: true })
 : await supabase
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
 es_wo,
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
 if (isDobles) {
 // Reacomoda equipo1_id/equipo2_id/equipo_ganador_id al mismo shape que usa
 // singles (jugador1_id/jugador2_id/ganador_id) para no duplicar el render de abajo.
 const rows: any[] = matchesData as any[];
 const equipoIds = [...new Set([
 ...rows.map((m) => m.equipo1_id).filter(Boolean),
 ...rows.map((m) => m.equipo2_id).filter(Boolean),
 ])];

 let equipos: any[] = [];
 if (equipoIds.length > 0) {
 const { data: equiposData, error: equiposError } = await supabase
 .from('torneo_equipos')
 .select('id, jugador1_id, jugador2_id')
 .in('id', equipoIds);
 if (equiposError) console.error('Equipos query error:', equiposError);
 equipos = equiposData || [];
 }

 const jugadorIds = [...new Set(equipos.flatMap((e) => [e.jugador1_id, e.jugador2_id]).filter(Boolean))];
 let profilesData: any[] = [];
 if (jugadorIds.length > 0) {
 const { data, error: profilesError } = await supabase
 .from('perfiles')
 .select('id, nombre_completo')
 .in('id', jugadorIds);
 if (profilesError) console.error('Profiles query error:', profilesError);
 profilesData = data || [];
 }
 const nameByJugadorId: Record<string, string> = {};
 profilesData.forEach((p: any) => { nameByJugadorId[p.id] = p.nombre_completo || 'Jugador'; });

 const equipoNameById: Record<string, string> = {};
 equipos.forEach((e: any) => {
 equipoNameById[e.id] = `${nameByJugadorId[e.jugador1_id] || 'Jugador'} / ${nameByJugadorId[e.jugador2_id] || 'Jugador'}`;
 });

 const transformedMatches: BracketMatch[] = rows.map((match) => ({
 ...match,
 jugador1_id: match.equipo1_id,
 jugador2_id: match.equipo2_id,
 ganador_id: match.equipo_ganador_id,
 jugador1_nombre: match.equipo1_id ? (equipoNameById[match.equipo1_id] || 'A definir') : 'A definir',
 jugador2_nombre: match.equipo2_id ? (equipoNameById[match.equipo2_id] || 'A definir') : 'A definir',
 }));
 setMatches(transformedMatches);

 // Resolver mi propio equipo para el resaltado "Mi partido"
 if (currentUserId) {
 const { data: equipoScopeRows } = await supabase
 .from('torneo_equipos')
 .select('id')
 .eq('torneo_id', torneo_id)
 .or(`jugador1_id.eq.${currentUserId},jugador2_id.eq.${currentUserId}`)
 .limit(1);
 const es = Array.isArray(equipoScopeRows) ? equipoScopeRows[0] : null;
 setComparisonId(es?.id ? String(es.id) : undefined);
 } else {
 setComparisonId(undefined);
 }
 } else {
 // Get unique player IDs
 const playerIds = [...new Set([
 ...matchesData.map((m: any) => m.jugador1_id).filter(Boolean),
 ...matchesData.map((m: any) => m.jugador2_id).filter(Boolean)
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
 profilesData?.forEach((p: Database['public']['Tables']['perfiles']['Row']) => {
 nameMap[p.id] = p.nombre_completo || 'Jugador';
 });

 // Transform data to include player names
 const transformedMatches: BracketMatch[] = matchesData.map((match: Database['public']['Tables']['partidos']['Row']) => ({
 ...match,
 jugador1_nombre: nameMap[match.jugador1_id] || 'A definir',
 jugador2_nombre: nameMap[match.jugador2_id] || 'A definir',
 }));
 setMatches(transformedMatches);
 setComparisonId(currentUserId);
 }
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
 }, [torneo_id, categoria, currentUserId]);

 // Horizontal scroll hint (flecha que invita a deslizar hacia la derecha, igual que en la tabla de posiciones)
 const scrollRef = useRef<HTMLDivElement>(null);
 const [canScrollRight, setCanScrollRight] = useState(false);
 const updateScrollHint = useCallback(() => {
 const el = scrollRef.current;
 if (!el) return;
 setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
 }, []);
 useEffect(() => {
 updateScrollHint();
 window.addEventListener('resize', updateScrollHint);
 return () => window.removeEventListener('resize', updateScrollHint);
 }, [updateScrollHint, matches.length]);

 // Líneas que unen cada partido con el siguiente (llaves), calculadas a partir
 // de la posición real de las tarjetas en pantalla para que se adapten a
 // cualquier alto de tarjeta (con o sin sets, W.O., etc.)
 const bracketAreaRef = useRef<HTMLDivElement>(null);
 const matchRefs = useRef<Record<string, HTMLDivElement | null>>({});
 const [connectors, setConnectors] = useState<{ id: string; d: string }[]>([]);

 useLayoutEffect(() => {
 const computeConnectors = () => {
 const container = bracketAreaRef.current;
 if (!container) return;
 const containerRect = container.getBoundingClientRect();
 const next: { id: string; d: string }[] = [];
 matches.forEach((match) => {
 if (!match.siguiente_partido_id) return;
 const fromEl = matchRefs.current[match.id];
 const toEl = matchRefs.current[match.siguiente_partido_id];
 if (!fromEl || !toEl) return;
 const fromRect = fromEl.getBoundingClientRect();
 const toRect = toEl.getBoundingClientRect();
 const x1 = fromRect.right - containerRect.left;
 const y1 = fromRect.top + fromRect.height / 2 - containerRect.top;
 const x2 = toRect.left - containerRect.left;
 const y2 = toRect.top + toRect.height / 2 - containerRect.top;
 const midX = (x1 + x2) / 2;
 next.push({ id: match.id, d: `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}` });
 });
 setConnectors(next);
 };
 computeConnectors();
 window.addEventListener('resize', computeConnectors);
 return () => window.removeEventListener('resize', computeConnectors);
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
 <div>
 <div
 ref={scrollRef}
 onScroll={updateScrollHint}
 className="overflow-x-auto no-scrollbar pb-4 relative flex"
 >
 <div ref={bracketAreaRef} className="flex gap-6 min-w-fit relative shrink-0" style={{ minHeight: '300px' }}>
 <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
 {connectors.map((c) => (
 <path key={c.id} d={c.d} fill="none" stroke="#c3ddc9" strokeWidth="2" />
 ))}
 </svg>
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
 const isMyMatch = !isFinalized && comparisonId && (
 match.jugador1_id === comparisonId || match.jugador2_id === comparisonId
 );

 return (
 <div
 key={match.id}
 ref={(el) => { matchRefs.current[match.id] = el; }}
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
 {isFinalized && match.es_wo && (
 <div className="px-4 py-1.5 border-t border-gray-100 bg-amber-50">
 <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
 W.O.
 </span>
 </div>
 )}
 {!isFinalized && (isMyMatch || match.estado === 'en_curso') && (
 <div className={`px-4 py-1.5 border-t border-gray-100 flex items-center justify-between ${isMyMatch ? 'bg-primary/10' : 'bg-gray-50 '}`}>
 {match.estado === 'en_curso' ? (
 <span className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">⏱ En curso</span>
 ) : <span />}
 {isMyMatch && (
 <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/20 text-green-700">
 Mi partido
 </span>
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
 <div
 aria-hidden="true"
 className={`sticky right-0 shrink-0 pointer-events-none w-10 flex items-center justify-end bg-gradient-to-l from-background-light via-background-light/80 to-transparent transition-opacity duration-300 ${
 canScrollRight ? 'opacity-100' : 'opacity-0'
 }`}
 >
 <span className="material-symbols-outlined text-lg text-slate-400 animate-bounce-x">chevron_right</span>
 </div>
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
