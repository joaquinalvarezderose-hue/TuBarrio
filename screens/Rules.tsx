
import React from 'react';
import { useNavigate } from 'react-router-dom';

const Rules: React.FC = () => {
 const navigate = useNavigate();

 return (
 <div className="bg-background-light text-slate-900 transition-colors duration-200 min-h-screen font-display pb-24 max-w-md mx-auto no-scrollbar overflow-y-auto">
 {/* Top Navigation Bar */}
 <div className="sticky top-0 z-50 bg-white border-b border-slate-200 ">
 <div className="flex items-center justify-between px-4 py-4">
 <button 
 onClick={() => navigate(-1)}
 className="flex items-center text-slate-600 p-1 hover:bg-slate-100 rounded-full transition-colors"
 >
 <span className="material-symbols-outlined">arrow_back_ios</span>
 </button>
 <h1 className="text-lg font-bold tracking-tight text-slate-900 ">Reglamento y FAQ</h1>
 <div className="w-8"></div>
 </div>
 </div>

 <main className="max-w-md mx-auto p-0">
 {/* Search Bar Section */}
 <div className="px-4 py-6">
 <div className="relative">
 <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
 <span className="material-symbols-outlined text-xl">search</span>
 </div>
 <input 
 type="text" 
 className="block w-full p-3 pl-10 text-sm text-slate-900 border border-slate-200 rounded-xl bg-white focus:ring-[#4a9c40] focus:border-[#4a9c40] shadow-sm transition-all" 
 placeholder="Buscar regla, logística o dudas..." 
 />
 </div>
 </div>

 {/* Section Title */}
 <div className="px-4 mb-4">
 <h2 className="text-2xl font-bold ">Guía del Jugador</h2>
 <p className="text-slate-500 text-sm font-medium">Todo lo que necesitás saber sobre el torneo TuBarrio.</p>
 </div>

 {/* Accordion Container */}
 <div className="px-4 space-y-3">
 {/* Question 1 */}
 <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm" open>
 <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
 <div className="flex items-center gap-3">
 <span className="material-symbols-outlined text-[#4a9c40]">scoreboard</span>
 <span className="font-semibold text-slate-800 ">Sistema de Puntuación</span>
 </div>
 <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
 </summary>
 <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
 Los partidos se disputan al mejor de 3 sets. Se utiliza el sistema de tie-break en todos los sets si se llega a 6-6. El ganador del partido suma 3 puntos para la tabla general, mientras que el perdedor suma 1 punto por haber completado el encuentro. El W.O. otorga 0 puntos.
 </div>
 </details>

 {/* Question 2 */}
 <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
 <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
 <div className="flex items-center gap-3">
 <span className="material-symbols-outlined text-[#4a9c40]">leaderboard</span>
 <span className="font-semibold text-slate-800 ">Reglas de Clasificación</span>
 </div>
 <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
 </summary>
 <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
 Para clasificar a los Playoffs, se consideran: 1) Puntos totales. 2) Resultado directo entre los involucrados. 3) Diferencia de sets. 4) Diferencia de games. Es obligatorio haber disputado al menos el 80% de los partidos de la fase regular.
 </div>
 </details>

 {/* Question 3 */}
 <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
 <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
 <div className="flex items-center gap-3">
 <span className="material-symbols-outlined text-[#4a9c40]">stadium</span>
 <span className="font-semibold text-slate-800 ">Reserva de Canchas y Luz</span>
 </div>
 <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
 </summary>
 <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
 Ambos jugadores son responsables de coordinar el turno. El costo de la cancha se divide en partes iguales. En caso de jugar con luz artificial, el costo extra también deberá ser abonado por ambos jugadores, salvo acuerdo previo en contrario.
 </div>
 </details>

 {/* Question 4 */}
 <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
 <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
 <div className="flex items-center gap-3">
 <span className="material-symbols-outlined text-[#4a9c40]">trending_up</span>
 <span className="font-semibold text-slate-800 ">Ascensos/Descensos</span>
 </div>
 <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
 </summary>
 <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
 Al finalizar cada temporada, los dos primeros puestos de cada zona ascienden de categoría automáticamente. Los dos últimos puestos descienden. Los terceros y antepenúltimos jugarán una promoción si el calendario lo permite.
 </div>
 </details>
 </div>

 {/* Special Section: Balls Responsibility */}
 <div className="px-4 mt-8">
 <h3 className="text-lg font-bold mb-3 ">Logística Específica</h3>
 <div className="bg-[#4a9c40]/10 border border-[#4a9c40]/30 rounded-xl p-5 relative overflow-hidden group">
 <div className="absolute -right-4 -top-4 opacity-10 group-hover:scale-110 transition-transform">
 <span className="material-symbols-outlined text-8xl text-[#4a9c40]">sports_tennis</span>
 </div>
 <div className="flex items-start gap-3 relative z-10">
 <div className="bg-[#4a9c40] p-2 rounded-lg text-white shadow-sm">
 <span className="material-symbols-outlined">inventory_2</span>
 </div>
 <div>
 <h4 className="font-bold text-slate-900 ">Responsabilidad de Pelotas (P)</h4>
 <p className="text-sm text-slate-700 mt-2 leading-relaxed font-medium">
 El jugador que figura como <strong className="text-[#4a9c40]">Local</strong> en el fixture es el encargado de proveer un tubo de pelotas nuevas para el encuentro. Las pelotas deben ser de marcas homologadas por la AAT. Al finalizar el partido, las pelotas quedan para el jugador visitante.
 </p>
 </div>
 </div>
 </div>
 </div>

 {/* Contact Support */}
 <div className="px-4 mt-10 text-center">
 <p className="text-slate-500 text-sm mb-4 font-bold">¿No encontraste lo que buscabas?</p>
 <button className="w-full bg-[#111813] text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all hover:bg-slate-800 active:scale-95 shadow-lg">
 <span className="material-symbols-outlined">chat</span>
 Contactar Organización
 </button>
 <p className="mt-6 text-[10px] text-slate-400 uppercase tracking-widest font-bold">Versión 2024.3 - TuBarrio AR</p>
 </div>
 </main>

 {/* Visual Decoration */}
 <div className="fixed bottom-0 right-0 -z-10 w-64 h-64 bg-[#4a9c40]/5 rounded-full blur-3xl"></div>
 <div className="fixed top-20 left-0 -z-10 w-48 h-48 bg-[#4a9c40]/5 rounded-full blur-3xl"></div>
 </div>
 );
};

export default Rules;