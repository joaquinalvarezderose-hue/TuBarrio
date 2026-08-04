import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { Skeleton } from '../components/Skeleton';

type ResultDetailProps = {
 partidoId: string;
 tournament: { id: number; title: string; subtitle: string };
};

type GameDetail = {
 p1: number;
 p2: number;
 tb?: number;
};

type HistorialData = {
 jugador1_nombre: string;
 jugador2_nombre: string;
 sets_json: GameDetail[] | null;
 sets_jugador1: number;
 sets_jugador2: number;
 ganador_perfil_id: string | null;
 jugador1_id: string;
 jugador2_id: string;
 esWo: boolean;
};

const ResultDetail: React.FC = () => {
 const navigate = useNavigate();
 const location = useLocation();

 const tournament = location.state?.tournament as any;
 const partidoId = location.state?.partidoId as string;
 const currentUserId = location.state?.currentUserId as string;

 const [historial, setHistorial] = useState<HistorialData | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);

 useEffect(() => {
 const loadResultDetail = async () => {
 try {
 if (!partidoId || !tournament?.id) {
 setError('No se pudo cargar el detalle del resultado.');
 return;
 }

 // Cargar historial + perfiles
 const [{ data: historialData, error: historialError }, { data: perfData, error: perfError }] = await Promise.all([
 supabase
 .from('torneo_partidos_historial')
 .select('jugador1_perfil_id, jugador2_perfil_id, sets_json, sets_jugador1, sets_jugador2, ganador_perfil_id, es_wo')
 .eq('partido_id', partidoId)
 .maybeSingle(),
 supabase
 .from('perfiles')
 .select('id, nombre_completo'),
 ]);

 if (historialError) throw historialError;
 if (perfError) throw perfError;

 if (!historialData) {
 setError('No hay resultado registrado para este partido.');
 return;
 }

 const perfilesMap = Object.fromEntries((perfData || []).map((p: any) => [p.id, p.nombre_completo]));

 setHistorial({
 jugador1_nombre: perfilesMap[historialData.jugador1_perfil_id] || 'Jugador 1',
 jugador2_nombre: perfilesMap[historialData.jugador2_perfil_id] || 'Jugador 2',
 sets_json: Array.isArray(historialData.sets_json) ? (historialData.sets_json as unknown as GameDetail[]) : null,
 sets_jugador1: historialData.sets_jugador1 || 0,
 sets_jugador2: historialData.sets_jugador2 || 0,
 ganador_perfil_id: historialData.ganador_perfil_id,
 jugador1_id: historialData.jugador1_perfil_id,
 jugador2_id: historialData.jugador2_perfil_id,
 esWo: Boolean((historialData as any).es_wo),
 });
 } catch (err) {
 console.error('Error cargando detalle del resultado:', err);
 setError('Hubo un error al cargar el detalle del resultado.');
 } finally {
 setLoading(false);
 }
 };

 loadResultDetail();
 }, [partidoId, tournament?.id]);

 const formatSetScore = (set: GameDetail): string => {
 if (set.tb !== undefined) {
 return `${Math.max(set.p1, set.p2)}-${Math.min(set.p1, set.p2)}(${set.tb})`;
 }
 return `${set.p1}-${set.p2}`;
 };

 const isParticipant = currentUserId && historial &&
 (historial.jugador1_id === currentUserId || historial.jugador2_id === currentUserId);
 const userWon = isParticipant && historial!.ganador_perfil_id === currentUserId;
 const userLost = isParticipant && !!historial!.ganador_perfil_id && historial!.ganador_perfil_id !== currentUserId;

 return (
 <div className="min-h-screen bg-gradient-to-b from-background-light to-background flex flex-col">
 <header className="sticky top-0 z-40 bg-white border-b border-[#dbe6de] px-4 py-3 shadow-sm">
 <div className="flex items-center justify-between max-w-3xl mx-auto">
 <button
 onClick={() => navigate(-1)}
 className="text-[#111813] active:scale-90 transition-transform"
 >
 <span className="material-symbols-outlined">arrow_back</span>
 </button>
 <h1 className="text-lg font-bold text-[#111813] ">Detalle del Resultado</h1>
 <div className="w-6" />
 </div>
 </header>

 <main className="flex-1 p-4 max-w-3xl mx-auto w-full">
 {loading && (
 <div className="space-y-6">
 <div className="bg-white rounded-xl p-6 shadow-sm border border-[#dbe6de]">
 <div className="text-center space-y-4">
 <Skeleton className="h-3.5 w-32 mx-auto" />
 <div className="space-y-3">
 <div className="flex items-center justify-between">
 <Skeleton className="h-5 w-28" />
 <Skeleton className="h-6 w-6" />
 </div>
 <div className="h-px bg-[#dbe6de]" />
 <div className="flex items-center justify-between">
 <Skeleton className="h-5 w-28" />
 <Skeleton className="h-6 w-6" />
 </div>
 </div>
 </div>
 </div>
 <div className="bg-white rounded-xl p-6 shadow-sm border border-[#dbe6de]">
 <Skeleton className="h-3.5 w-36 mb-4" />
 <div className="space-y-3">
 {Array.from({ length: 3 }).map((_, i) => (
 <div key={i} className="flex items-center justify-between p-3 bg-[#f5f7f6] rounded-lg">
 <Skeleton className="h-3.5 w-10" />
 <div className="flex items-center gap-4">
 <Skeleton className="h-6 w-8" />
 <Skeleton className="h-6 w-8" />
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 )}

 {error && (
 <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-rose-800 text-sm">
 {error}
 </div>
 )}

 {historial && !loading && (
 <div className="space-y-6">
 {/* Resultado General */}
 <div className="bg-white rounded-xl p-6 shadow-sm border border-[#dbe6de] ">
 <div className="text-center space-y-4">
 <h2 className="text-sm font-semibold text-[#61896b] uppercase tracking-wide">Resultado Final</h2>

 {historial.esWo && (
 <span className="inline-block px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">
 W.O.
 </span>
 )}

 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <span
 className={`text-lg font-bold ${
 historial.ganador_perfil_id === historial.jugador1_id ? 'text-[#4a9c40]' : 'text-[#111813] '
 }`}
 >
 {historial.jugador1_nombre}
 </span>
 {!historial.esWo && <span className="text-2xl font-black text-[#4a9c40]">{historial.sets_jugador1}</span>}
 </div>

 <div className="h-px bg-[#dbe6de] " />

 <div className="flex items-center justify-between">
 <span
 className={`text-lg font-bold ${
 historial.ganador_perfil_id === historial.jugador2_id ? 'text-[#4a9c40]' : 'text-[#111813] '
 }`}
 >
 {historial.jugador2_nombre}
 </span>
 {!historial.esWo && <span className="text-2xl font-black text-[#4a9c40]">{historial.sets_jugador2}</span>}
 </div>
 </div>

 {currentUserId && (
 <div className="pt-4">
 {userWon && (
 <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
 GANASTE
 </span>
 )}
 {userLost && (
 <span className="inline-block px-3 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded-full">
 PERDISTE
 </span>
 )}
 </div>
 )}
 </div>
 </div>

 {/* Desglose de Sets */}
 {historial.sets_json && historial.sets_json.length > 0 && (
 <div className="bg-white rounded-xl p-6 shadow-sm border border-[#dbe6de] ">
 <h3 className="text-sm font-semibold text-[#61896b] uppercase tracking-wide mb-4">Desglose de Sets</h3>

 <div className="space-y-3">
 {historial.sets_json.map((set, idx) => (
 <div key={idx} className="flex items-center justify-between p-3 bg-[#f5f7f6] rounded-lg">
 <span className="text-xs font-semibold text-[#61896b]">Set {idx + 1}</span>
 <div className="flex items-center gap-4">
 <div className="text-right">
 <div className="text-sm font-bold text-[#111813] ">{historial.jugador1_nombre}</div>
 <div className="text-lg font-black text-[#4a9c40]">{set.p1}</div>
 </div>
 <span className="text-[#61896b] font-bold">-</span>
 <div className="text-left">
 <div className="text-sm font-bold text-[#111813] ">{historial.jugador2_nombre}</div>
 <div className="text-lg font-black text-[#4a9c40]">{set.p2}</div>
 </div>
 </div>
 {set.tb !== undefined && (
 <div className="text-xs font-semibold text-[#61896b] bg-[#e8f0eb] px-2 py-1 rounded">
 TB: {set.tb}
 </div>
 )}
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Botón Volver */}
 <button
 onClick={() => navigate(-1)}
 className="w-full py-3 rounded-lg bg-[#4a9c40] text-white font-bold active:scale-95 transition-transform"
 >
 Volver
 </button>
 </div>
 )}
 </main>
 </div>
 );
};

export default ResultDetail;
