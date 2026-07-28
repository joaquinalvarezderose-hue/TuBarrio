
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ResponsiveScreen from '../components/layouts/ResponsiveScreen';
import { formatTournamentDate } from '../utils/tournamentDate';

const Confirmation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const tournament = location.state?.tournament || { 
    id: 1, 
    title: "Abierto de Tenis TuBarrio",
    subtitle: "Singles Caballeros",
    date: formatTournamentDate(null, null)
  };
  const enrollmentStatus = location.state?.enrollmentStatus || 'pendiente_revision';

  const userStr = localStorage.getItem('app_user');
  const user = userStr ? JSON.parse(userStr) : { name: "Mateo Rossi" };
  const handleShareWhatsapp = () => {
    const message = `Hola! Me inscribi en ${tournament.title} (${tournament.subtitle}) - temporada ${tournament.date}. Sumate en TuBarrio.`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const header = (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-gray-100 bg-background-light/90 p-4 backdrop-blur-md">
      <div className="flex w-10 justify-start">
        <button
          onClick={() => navigate('/tournaments')}
          className="flex size-10 items-center justify-center rounded-full text-slate-900 transition-colors hover:bg-black/5"
        >
          <span className="material-symbols-outlined text-[24px]">close</span>
        </button>
      </div>
      <h2 className="flex-1 truncate text-center text-lg font-bold leading-tight tracking-tight">Confirmación</h2>
      <div className="w-10"></div>
    </header>
  );

  const main = (
    <>
      <div className="pb-8 pt-5 text-center md:max-w-xl md:pb-0 md:pt-14 md:text-left">
          <div className="inline-flex items-center justify-center size-16 rounded-full bg-primary/20 text-primary mb-4 animate-bounce">
            <span className="material-symbols-outlined text-[32px] font-black">check_circle</span>
          </div>
          {enrollmentStatus === 'pagado_aprobado' ? (
            <>
              <h1 className="mx-auto max-w-[20ch] md:mx-0 text-[32px] font-black leading-tight tracking-tight mb-3 text-secondary">Inscripción ya aprobada</h1>
              <p className="mx-auto max-w-[34ch] md:mx-0 md:max-w-[42ch] text-slate-600 text-base font-bold leading-relaxed px-2 md:px-0 opacity-80">
                Tu lugar en {tournament.title} ya estaba confirmado. No registramos una nueva inscripción.
              </p>
            </>
          ) : (
            <>
              <h1 className="mx-auto max-w-[18ch] md:mx-0 text-[32px] font-black leading-tight tracking-tight mb-3 text-secondary">Pago en revisión</h1>
              <p className="mx-auto max-w-[36ch] md:mx-0 md:max-w-[42ch] text-slate-600 text-base font-bold leading-relaxed px-2 md:px-0 opacity-80">
                Ya recibimos tu comprobante para {tournament.title}. Te avisaremos en cuanto validemos la transferencia y tu lugar quede confirmado.
              </p>
            </>
          )}
      </div>
    </>
  );

  const aside = (
    <div className="relative mb-10 w-full drop-shadow-2xl md:mb-0 md:mt-10 md:w-[380px] md:justify-self-end">
          <div className="bg-white rounded-t-[2rem] overflow-hidden relative border-x border-t border-slate-100 shadow-sm">
            <div className="h-44 md:h-56 w-full relative">
              <img
                alt="Tennis"
                className="w-full h-full object-cover"
                src={tournament.image || "/images/payment-tournament.jpg"}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
              <div className="absolute bottom-4 left-5 text-white">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-0.5">Inscripción Oficial</p>
                <h3 className="text-xl font-black tracking-tight">{tournament.title}</h3>
              </div>
            </div>
            
            <div className="p-6 md:p-7 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Jugador</p>
                  <p className="text-lg font-black text-secondary tracking-tight">{user.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Categoría</p>
                  <p className="text-lg font-black text-secondary tracking-tight">{tournament.subtitle}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-slate-50 pt-5">
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[20px] font-black">calendar_month</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Temporada</span>
                    <span className="text-sm font-black text-secondary">{tournament.date}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[20px] font-black">schedule</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Horario</span>
                    <span className="text-sm font-black text-secondary">A confirmar</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative h-px w-full bg-white border-x border-slate-100">
             <div className="absolute inset-x-6 top-0 border-t-2 border-dashed border-slate-200"></div>
          </div>

          <div className="bg-white rounded-b-[2rem] p-8 flex flex-col items-center justify-center border-x border-b border-slate-100">
            <p className="text-sm text-slate-500 font-bold text-center">
              Tu inscripción está en revisión administrativa.
            </p>
            <p className="text-xs text-slate-400 font-semibold text-center mt-1">
              Cuando quede aprobada, vas a ver tus partidos en el panel del torneo.
            </p>
          </div>
    </div>
  );

  const footer = (
    <div className="space-y-4 md:w-[380px] md:justify-self-end">
      <button
        onClick={handleShareWhatsapp}
        className="w-full flex items-center justify-center gap-3 bg-primary hover:bg-[#0fd641] text-secondary font-black text-lg py-5 rounded-2xl shadow-xl shadow-primary/30 transition-all active:scale-[0.98]"
      >
        <span className="material-symbols-outlined font-black">share</span>
        Compartir con Vecinos
      </button>
      <button
        onClick={() => navigate('/tournaments')}
        className="w-full py-2 text-sm font-black text-slate-400 hover:text-secondary transition-colors uppercase tracking-[0.1em]"
      >
        Volver al Centro de Torneos
      </button>
    </div>
  );

  return (
    <ResponsiveScreen
      header={header}
      main={main}
      aside={aside}
      footer={footer}
      contentClassName="px-4 md:px-8 pb-52 md:pb-12"
      footerContainerClassName="md:flex md:justify-end"
    />
  );
};

export default Confirmation;
