
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import ResponsiveScreen from '../components/layouts/ResponsiveScreen';
import Logo from '../components/Logo';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { formatTournamentDate } from '../utils/tournamentDate';

const TournamentDetails: React.FC = () => {
 const navigate = useNavigate();
 const location = useLocation();
 const requireAuth = useRequireAuth();
 const [isRegistered, setIsRegistered] = useState(false);
 const [inscripcionPendiente, setInscripcionPendiente] = useState(false);
 const appUser = localStorage.getItem('app_user') ? JSON.parse(localStorage.getItem('app_user') as string) : null;
 const isAdmin = String(appUser?.rol || '').trim().toLowerCase() === 'admin';

 const tournament = location.state?.tournament || {
 id: 1,
 title: "Abierto de Tenis TuBarrio",
 subtitle: "Singles Damas y Caballeros",
 date: formatTournamentDate(null, null)
 };
 const isGolf = String(tournament.deporte || 'tenis') === 'golf';
 const panelPath = isGolf ? '/golf/panel' : '/tournament-panel';
 const rulesPath = isGolf ? '/golf/rules' : '/rules';

 // Fallback solo para el caso de que el torneo llegue sin estos campos
 // (ej: flujo de intent/deep link que no selecciona todas las columnas).
 const montoExpensas = Number(tournament.precio_expensas ?? 5000);
 const montoTransferir = Number(tournament.precio_transferencia ?? 45000);
 const costoInscripcion = montoExpensas + montoTransferir;
 const formatMonto = (n: number) => `$${n.toLocaleString('es-AR')}`;

 useEffect(() => {
 const checkRegistration = async () => {
 const { data: authData } = await supabase.auth.getUser();
 const authUserId = authData?.user?.id;
 const userStr = localStorage.getItem('app_user');
 const user = userStr ? JSON.parse(userStr) : null;
 const perfilId = authUserId || user?.id;
 if (!perfilId) return;

 try {
 // Verificar si el usuario está en torneo_jugadores (pago aprobado y sorteado)
 const { data: jugadorData } = await supabase
 .from('torneo_jugadores')
 .select('torneo_id')
 .eq('perfil_id', perfilId)
 .eq('torneo_id', Number(tournament.id))
 .maybeSingle();

 if (jugadorData) {
 setIsRegistered(true);
 return;
 }

 // Si no está en torneo_jugadores, verificar inscripcion_torneo para saber el estado exacto
 const { data: inscripcionData } = await supabase
 .from('inscripciones_torneo')
 .select('estado')
 .eq('perfil_id', perfilId)
 .eq('torneo_id', Number(tournament.id))
 .in('estado', ['pagado_aprobado', 'pendiente_revision'])
 .maybeSingle();

 if (inscripcionData?.estado === 'pagado_aprobado') {
 setIsRegistered(true);
 } else if (inscripcionData?.estado === 'pendiente_revision') {
 setInscripcionPendiente(true);
 }
 } catch (err) {
 console.error('[TournamentDetails] Error checking registration status:', err);
 }
 };
 checkRegistration();
 }, [tournament.id]);

 const header = (
 <div className="sticky top-0 z-30 flex items-center justify-between bg-background-light/95 p-4 pb-2 backdrop-blur-md transition-colors duration-200 md:px-8">
 <button
 onClick={() => navigate(-1)}
 className="group flex size-10 items-center justify-center rounded-full text-gray-900 transition-colors hover:bg-gray-200"
 >
 <span className="material-symbols-outlined transition-transform group-hover:-translate-x-0.5">arrow_back</span>
 </button>
 <div className="flex-1 flex justify-center pr-10">
 <Logo variant="tournament" className="h-[120px] w-auto" />
 </div>
 </div>
 );

 const main = (
 <div className="w-full px-4 sm:px-5 md:px-8">
 <div className="py-3">
 <div className="relative flex min-h-[280px] flex-col justify-end overflow-hidden rounded-xl bg-gray-200 shadow-sm">
 <div 
 className="absolute inset-0 z-0 bg-cover bg-center transition-transform duration-700 hover:scale-105" 
 role="img" 
 style={{ backgroundImage: 'url("/images/tournament-detail-1.jpg")' }}
 ></div>
 <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
 <div className="relative z-20 flex flex-col p-5 gap-2">
 <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[#6dec13] px-2.5 py-0.5 text-xs font-bold text-black uppercase tracking-wider">
 INSCRIPCIONES ABIERTAS
 </span>
 <h1 className="text-white tracking-tight text-3xl font-bold leading-tight drop-shadow-sm">
 {tournament.title}
 </h1>
 <div className="flex items-center gap-2 text-gray-200 text-sm">
 <span className="material-symbols-outlined text-[18px]">group</span>
 <span>{tournament.subtitle || "Singles Damas y Caballeros"}</span>
 </div>
 </div>
 </div>
 </div>

 <div className="grid grid-cols-[40px_1fr] gap-x-2 px-5 mt-2">
 <div className="flex flex-col items-center gap-1 pt-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm border border-gray-100 text-[#6dec13]">
 <span className="material-symbols-outlined">calendar_today</span>
 </div>
 <div className="w-[2px] bg-gray-200 h-full grow rounded-full"></div>
 </div>
 <div className="flex flex-1 flex-col py-2 pb-6">
 <p className="text-gray-500 text-sm font-medium uppercase tracking-wide">FECHAS DEL TORNEO</p>
 <p className="text-gray-900 text-lg font-medium leading-normal">{tournament.date}</p>
 </div>

 <div className="flex flex-col items-center gap-1">
 <div className="w-[2px] bg-gray-200 h-6 rounded-full"></div>
 <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm border border-gray-100 text-[#6dec13]">
 <span className="material-symbols-outlined">location_on</span>
 </div>
 </div>
 <div className="flex flex-1 flex-col py-2">
 <p className="text-gray-500 text-sm font-medium uppercase tracking-wide">UBICACIÓN</p>
 <p className="text-gray-900 text-lg font-medium leading-normal">Canchas del Barrio El Canton</p>
 <div className="mt-3 h-24 w-full overflow-hidden rounded-xl relative border border-gray-200">
 <div 
 className="absolute inset-0 bg-cover bg-center opacity-80"
 style={{ backgroundImage: 'url("/images/tournament-detail-2.jpg")' }}
 ></div>
 <a
 href="https://maps.app.goo.gl/W5j2pF2XkeEyLCqq5"
 target="_blank"
 rel="noreferrer"
 className="absolute inset-0 bg-black/10 flex items-center justify-center cursor-pointer"
 >
 <span className="bg-white/90 px-3 py-1 rounded-full text-xs font-bold shadow-sm backdrop-blur-sm">Ver en el Mapa</span>
 </a>
 </div>
 </div>
 </div>

 <div className="flex gap-4 px-5 py-6">
 <div className="flex min-w-[140px] flex-1 flex-col gap-1 rounded-2xl p-5 bg-white border border-gray-100 shadow-sm relative overflow-hidden group">
 <div className="absolute -right-4 -top-4 size-20 rounded-full bg-[#6dec13]/10 group-hover:bg-[#6dec13]/20 transition-colors"></div>
 <div className="relative z-10 flex items-center gap-2 text-gray-500 mb-1">
 <span className="material-symbols-outlined text-[20px]">payments</span>
 <span className="text-sm font-medium">Inscripción</span>
 </div>
 <p className="relative z-10 text-gray-900 text-3xl font-bold leading-tight">{formatMonto(montoTransferir)}</p>
 <p className="relative z-10 text-gray-500 text-xs font-medium">+ {formatMonto(montoExpensas)} por expensas</p>
 <p className="relative z-10 text-gray-400 text-[10px] font-medium mt-0.5">Total: {formatMonto(costoInscripcion)}</p>
 </div>
 <div className="flex flex-col gap-4 flex-1 min-w-[140px]">
 <div className="flex flex-col gap-1 rounded-2xl p-3 bg-white border border-gray-100 shadow-sm relative overflow-hidden group">
 <div className="absolute -right-4 -top-4 size-16 rounded-full bg-[#6dec13]/10 group-hover:bg-[#6dec13]/20 transition-colors"></div>
 <div className="relative z-10 flex items-center gap-2 text-gray-500 mb-0.5">
 <span className="material-symbols-outlined text-[18px]">emoji_events</span>
 <span className="text-sm font-medium">Premios</span>
 </div>
 <p className="relative z-10 text-gray-900 text-base font-bold leading-snug">Del 1° al 4°</p>
 </div>
 <button
 onClick={() => navigate(rulesPath)}
 className="flex items-center justify-between gap-2 rounded-2xl p-3 bg-white border border-gray-100 shadow-sm relative overflow-hidden group text-left w-full active:scale-[0.98] transition-transform"
 >
 <div className="absolute -right-4 -top-4 size-16 rounded-full bg-[#6dec13]/10 group-hover:bg-[#6dec13]/20 transition-colors"></div>
 <div className="relative z-10 flex flex-col gap-0.5">
 <div className="flex items-center gap-2 text-gray-500 mb-0.5">
 <span className="material-symbols-outlined text-[18px]">gavel</span>
 <span className="text-sm font-medium">Reglamento</span>
 </div>
 <p className="text-gray-900 text-base font-bold leading-snug">Ver reglas</p>
 </div>
 <span className="material-symbols-outlined text-gray-400 relative z-10">chevron_right</span>
 </button>
 </div>
 </div>

 </div>
 );

 const footer = (
 <>
 {inscripcionPendiente ? (
 <div className="flex flex-col gap-3 md:w-[420px]">
 <div className="w-full flex items-center justify-center gap-3 bg-amber-50 border-2 border-amber-200 rounded-xl py-4 px-5">
 <span className="material-symbols-outlined text-amber-500 text-[24px] font-black">schedule</span>
 <div className="flex flex-col">
 <span className="text-amber-800 font-black text-base leading-tight">Pago en revisión</span>
 <span className="text-amber-600 text-xs font-bold">Te avisamos cuando tu inscripción sea aprobada</span>
 </div>
 </div>
 </div>
 ) : isRegistered ? (
 <div className="flex flex-col gap-3 md:w-[420px]">
 <div className="w-full flex items-center justify-center gap-3 bg-primary/10 border-2 border-primary/30 rounded-xl py-4 px-5">
 <span className="material-symbols-outlined text-primary text-[24px] font-black">check_circle</span>
 <div className="flex flex-col">
 <span className="text-secondary font-black text-base leading-tight">¡Ya estás inscripto!</span>
 <span className="text-slate-500 text-xs font-bold">Tu lugar está reservado en este torneo</span>
 </div>
 </div>
 <button
 onClick={() => navigate(panelPath, { state: { tournament } })}
 className="w-full bg-secondary hover:bg-secondary/90 active:scale-[0.98] transition-all text-white font-black text-lg h-14 rounded-xl shadow-lg flex items-center justify-center gap-2"
 >
 <span className="material-symbols-outlined font-black">{isGolf ? 'golf_course' : 'sports_tennis'}</span>
 <span>Ir a mi Panel</span>
 </button>
 </div>
 ) : isAdmin ? (
 <div className="flex flex-col gap-3 md:w-[420px]">
 <div className="w-full flex items-center justify-center gap-3 bg-slate-100 border border-slate-200 rounded-xl py-4 px-5">
 <span className="material-symbols-outlined text-slate-700 text-[24px] font-black">admin_panel_settings</span>
 <div className="flex flex-col">
 <span className="text-slate-900 font-black text-base leading-tight">Modo administrador</span>
 <span className="text-slate-500 text-xs font-bold">Podés gestionar sorteo e inicio aunque no estés inscripto</span>
 </div>
 </div>
 <button
 onClick={() => navigate(panelPath, { state: { tournament } })}
 className="w-full bg-slate-900 hover:bg-slate-800 active:scale-[0.98] transition-all text-white font-black text-lg h-14 rounded-xl shadow-lg flex items-center justify-center gap-2"
 >
 <span className="material-symbols-outlined font-black">tune</span>
 <span>Administrar Torneo</span>
 </button>
 <button
 onClick={() => requireAuth(
 { type: 'tournament-signup', payload: { tournament } },
 () => navigate('/payment', { state: { tournament } })
 )}
 className="w-full bg-primary hover:bg-[#5cd60f] active:scale-[0.98] transition-all text-black font-bold text-lg h-14 rounded-xl shadow-lg shadow-primary/25 flex items-center justify-center gap-2"
 >
 <span>Inscribirme al Torneo</span>
 <span className="material-symbols-outlined font-black">arrow_forward</span>
 </button>
 </div>
 ) : (
 <button
 onClick={() => requireAuth(
 { type: 'tournament-signup', payload: { tournament } },
 () => navigate('/payment', { state: { tournament } })
 )}
 className="w-full md:w-[420px] bg-primary hover:bg-[#5cd60f] active:scale-[0.98] transition-all text-black font-bold text-lg h-14 rounded-xl shadow-lg shadow-primary/25 flex items-center justify-center gap-2"
 >
 <span>Inscribirme al Torneo</span>
 <span className="material-symbols-outlined font-black">arrow_forward</span>
 </button>
 )}
 </>
 );

 return (
 <ResponsiveScreen
 header={header}
 main={main}
 footer={footer}
 contentClassName="pb-28"
 footerContainerClassName="md:flex md:justify-end"
 />
 );
};

export default TournamentDetails;
