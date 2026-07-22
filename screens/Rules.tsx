
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
 Los partidos se disputan al mejor de 3 sets. Se utiliza el sistema de tie-break en todos los sets si se llega a 6-6. En caso de empate 1 a 1 en sets, se disputará un Super Tie-Break a 10 puntos para definir al ganador del partido. El ganador del partido suma 3 puntos para la tabla general, mientras que el perdedor suma 1 punto por haber completado el encuentro. El W.O. otorga 0 puntos.
 </div>
 </details>

 {/* Fase de Grupos */}
 <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
 <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
 <div className="flex items-center gap-3">
 <span className="material-symbols-outlined text-[#4a9c40]">groups</span>
 <span className="font-semibold text-slate-800">Fase de Grupos</span>
 </div>
 <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
 </summary>
 <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
 En la fase de grupos cada jugador enfrenta a todos los demás de su zona (round-robin). Se suman puntos por cada partido: <strong className="text-slate-800">3 puntos</strong> por victoria, <strong className="text-slate-800">1 punto</strong> por completar el encuentro y <strong className="text-slate-800">0</strong> en caso de W.O. Al finalizar la fase, los mejores clasificados de cada grupo avanzan a los Playoffs según la configuración del torneo.
 </div>
 </details>

 {/* Criterios de Desempate */}
 <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
 <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
 <div className="flex items-center gap-3">
 <span className="material-symbols-outlined text-[#4a9c40]">balance</span>
 <span className="font-semibold text-slate-800">Criterios de Desempate</span>
 </div>
 <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
 </summary>
 <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
 <p className="mb-3">Cuando dos o más jugadores igualan en puntos, el orden se determina aplicando los siguientes criterios en orden de prioridad:</p>
 <ol className="space-y-2 list-none">
 <li className="flex gap-2"><span className="font-bold text-[#4a9c40] shrink-0">1°</span> Puntos acumulados</li>
 <li className="flex gap-2"><span className="font-bold text-[#4a9c40] shrink-0">2°</span> Diferencia de sets (ganados − perdidos)</li>
 <li className="flex gap-2"><span className="font-bold text-[#4a9c40] shrink-0">3°</span> Sets ganados (total)</li>
 <li className="flex gap-2"><span className="font-bold text-[#4a9c40] shrink-0">4°</span> Resultado directo entre los empatados (H2H)</li>
 <li className="flex gap-2"><span className="font-bold text-[#4a9c40] shrink-0">5°</span> Promedio de puntos por partido</li>
 </ol>
 </div>
 </details>

 {/* Playoffs */}
 <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
 <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
 <div className="flex items-center gap-3">
 <span className="material-symbols-outlined text-[#4a9c40]">account_tree</span>
 <span className="font-semibold text-slate-800">Playoffs — Eliminación Directa</span>
 </div>
 <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
 </summary>
 <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
 Los Playoffs se juegan en formato de eliminación directa. El ganador de cada cruce avanza a la siguiente ronda y el perdedor queda eliminado. Los partidos son al mejor de 3 sets. El cuadro se genera automáticamente al cierre de la fase de grupos, cruzando a los clasificados según su posición final: el 1° de un grupo enfrenta al 2° de otro, alternando semillas para equilibrar el cuadro.
 </div>
 </details>

 {/* Mejores Terceros */}
 <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
 <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
 <div className="flex items-center gap-3">
 <span className="material-symbols-outlined text-[#4a9c40]">emoji_events</span>
 <span className="font-semibold text-slate-800">Mejores Terceros</span>
 </div>
 <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
 </summary>
 <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
 <p className="mb-3">Cuando el formato lo requiere para completar el cuadro de Playoffs a una potencia de 2, los mejores terceros puestos de todos los grupos también clasifican. Para determinar cuáles pasan, se comparan todos los jugadores que terminaron 3° en su grupo usando:</p>
 <ol className="space-y-2 list-none mb-3">
 <li className="flex gap-2"><span className="font-bold text-[#4a9c40] shrink-0">1°</span> Puntos acumulados</li>
 <li className="flex gap-2"><span className="font-bold text-[#4a9c40] shrink-0">2°</span> Sets ganados (total)</li>
 <li className="flex gap-2"><span className="font-bold text-[#4a9c40] shrink-0">3°</span> Menos partidos jugados</li>
 </ol>
 <p className="text-xs text-slate-500">El resultado directo (H2H) y la diferencia de sets no aplican en este ranking ya que son comparaciones entre grupos distintos.</p>
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

 {/* ¿Cuándo juego? */}
 <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
 <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
 <div className="flex items-center gap-3">
 <span className="material-symbols-outlined text-[#4a9c40]">calendar_month</span>
 <span className="font-semibold text-slate-800">¿Cuándo juego?</span>
 </div>
 <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
 </summary>
 <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
 Los participantes coordinarán por privado y por WhatsApp el día y horario de la semana que les resulte conveniente para jugar. Se programa un partido por semana.
 </div>
 </details>

 {/* ¿Qué ocurre si el partido no se disputa dentro de la semana correspondiente? */}
 <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
 <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
 <div className="flex items-center gap-3">
 <span className="material-symbols-outlined text-[#4a9c40]">event_busy</span>
 <span className="font-semibold text-slate-800">¿Qué ocurre si el partido no se disputa dentro de la semana correspondiente?</span>
 </div>
 <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
 </summary>
 <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
 Si cumplido el plazo de la fecha uno de los jugadores no puede presentarse el día domingo, tendrá W.O. (partido perdido por no presentarse). Aplicará para ambos si ninguno puede presentarse, incluso si llueve o se cancelan canchas por SS. <strong className="text-slate-800">Ante un W.O., es obligatorio avisar a la organización.</strong>
 </div>
 </details>

 {/* ¿Qué pasa si pactan horario y uno cancela? */}
 <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
 <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
 <div className="flex items-center gap-3">
 <span className="material-symbols-outlined text-[#4a9c40]">cancel</span>
 <span className="font-semibold text-slate-800">¿Qué pasa si pactan horario y uno cancela?</span>
 </div>
 <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
 </summary>
 <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
 Si los jugadores confirman por mensaje de WhatsApp día y horario, y uno finalmente cancela, tendrá W.O. (partido perdido por no presentarse), a menos que ambos accedan a reprogramar. En caso de lluvia o cancelación de cancha por SS, deben reprogramar nuevo día y horario. <strong className="text-slate-800">Ante un W.O., es obligatorio avisar a la organización.</strong>
 </div>
 </details>

 {/* ¿Qué ocurre si el rival no responde por WhatsApp? */}
 <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
 <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
 <div className="flex items-center gap-3">
 <span className="material-symbols-outlined text-[#4a9c40]">chat_bubble</span>
 <span className="font-semibold text-slate-800">¿Qué ocurre si el rival no responde por WhatsApp?</span>
 </div>
 <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
 </summary>
 <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
 Si hasta el día jueves inclusive no hubo respuesta a los mensajes de WhatsApp, el jugador que no respondió perderá el partido por W.O. <strong className="text-slate-800">Ante un W.O., es obligatorio avisar a la organización.</strong>
 </div>
 </details>

 {/* ¿Puedo adelantar partidos? */}
 <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
 <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
 <div className="flex items-center gap-3">
 <span className="material-symbols-outlined text-[#4a9c40]">fast_forward</span>
 <span className="font-semibold text-slate-800">¿Puedo adelantar partidos?</span>
 </div>
 <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
 </summary>
 <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
 Se pueden anticipar partidos siempre y cuando los jugadores puedan coordinarlo. El resultado se puede cargar apenas termine el partido, sin necesidad de esperar a la fecha del calendario.
 </div>
 </details>

 {/* ¿Cómo informo un resultado? */}
 <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
 <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
 <div className="flex items-center gap-3">
 <span className="material-symbols-outlined text-[#4a9c40]">upload</span>
 <span className="font-semibold text-slate-800">¿Cómo informo un resultado?</span>
 </div>
 <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
 </summary>
 <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
 Para cargar un resultado ingresá a la pantalla <strong className="text-slate-800">Fixture</strong>, buscá tu partido y tocá <strong className="text-slate-800">"Cargar Resultado"</strong>. Allí ingresás el marcador set por set con los botones <strong className="text-slate-800">+</strong> y <strong className="text-slate-800">−</strong>; si el partido quedó 1 a 1, aparecerá automáticamente la sección del Super Tie-Break. Una vez que el marcador sea válido, tocá <strong className="text-slate-800">"Enviar Resultado"</strong>. Tu rival recibirá la propuesta y deberá confirmarla desde la app. Si fue tu rival quien cargó primero, te aparecerá la opción de <strong className="text-slate-800">Confirmar</strong> o <strong className="text-slate-800">Rechazar</strong> el marcador propuesto. El resultado queda finalizado cuando ambos están de acuerdo.
 </div>
 </details>

 {/* ¿Cuál es el plazo para informar un partido y corregir errores? */}
 <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
 <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
 <div className="flex items-center gap-3">
 <span className="material-symbols-outlined text-[#4a9c40]">timer</span>
 <span className="font-semibold text-slate-800">¿Cuál es el plazo para informar un partido y corregir errores de resultados cargados?</span>
 </div>
 <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
 </summary>
 <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
 El resultado del partido debe informarse dentro de las <strong className="text-slate-800">24 horas</strong> de finalizado el encuentro. En caso de haber cargado un resultado con errores, la corrección puede solicitarse hasta <strong className="text-slate-800">48 horas</strong> después de disputado el partido.
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
 Ambos jugadores son responsables de organizarse para determinar quién lleva el tubo de pelotas. Las pelotas deben ser de marcas homologadas por la AAT. La organización recomienda que cada jugador lleve su propio tubo.
 </p>
 </div>
 </div>
 </div>
 </div>

 {/* Contact Support */}
 <div className="px-4 mt-10 text-center">
 <p className="text-slate-500 text-sm mb-4 font-bold">¿No encontraste lo que buscabas?</p>
 <a href="https://wa.me/5491164219155" target="_blank" rel="noopener noreferrer" className="w-full bg-[#111813] text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all hover:bg-slate-800 active:scale-95 shadow-lg">
 <span className="material-symbols-outlined">chat</span>
 Contactar Organización
 </a>
 <p className="mt-6 text-[10px] text-slate-400 uppercase tracking-widest font-bold">Versión 2026.3 - TuBarrio AR</p>
 </div>
 </main>

 {/* Visual Decoration */}
 <div className="fixed bottom-0 right-0 -z-10 w-64 h-64 bg-[#4a9c40]/5 rounded-full blur-3xl"></div>
 <div className="fixed top-20 left-0 -z-10 w-48 h-48 bg-[#4a9c40]/5 rounded-full blur-3xl"></div>
 </div>
 );
};

export default Rules;
