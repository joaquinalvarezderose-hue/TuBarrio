
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const Confirmation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const tournament = location.state?.tournament || { 
    id: 1, 
    title: "Abierto de Tenis TuBarrio",
    subtitle: "Singles Caballeros",
    date: "Sáb, 24 Oct • 09:00 AM"
  };

  const userStr = localStorage.getItem('app_user');
  const user = userStr ? JSON.parse(userStr) : { name: "Mateo Rossi" };

  useEffect(() => {
    const saved = localStorage.getItem('registered_tournaments');
    let registeredIds: number[] = saved ? JSON.parse(saved) : [];
    
    if (!registeredIds.includes(tournament.id)) {
      registeredIds.push(tournament.id);
      localStorage.setItem('registered_tournaments', JSON.stringify(registeredIds));
    }
  }, [tournament.id]);

  return (
    <div className="relative flex flex-col min-h-screen w-full overflow-x-hidden bg-background-light font-display">
      <header className="flex items-center p-4 justify-between sticky top-0 z-50 bg-background-light/90 backdrop-blur-md border-b border-gray-100">
        <div className="flex w-10 justify-start">
          <button 
            onClick={() => navigate('/tournaments')}
            className="flex size-10 items-center justify-center rounded-full hover:bg-black/5 transition-colors text-slate-900"
          >
            <span className="material-symbols-outlined text-[24px]">close</span>
          </button>
        </div>
        <h2 className="text-lg font-bold leading-tight tracking-tight flex-1 text-center truncate">Confirmación</h2>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 flex flex-col px-4 pb-12 overflow-y-auto no-scrollbar">
        <div className="text-center pt-2 pb-6">
          <div className="inline-flex items-center justify-center size-16 rounded-full bg-primary/20 text-primary mb-4 animate-bounce">
            <span className="material-symbols-outlined text-[32px] font-black">check_circle</span>
          </div>
          <h1 className="text-[32px] font-black leading-tight tracking-tight mb-2 text-secondary">¡Ya estás adentro!</h1>
          <p className="text-slate-600 text-base font-bold leading-relaxed px-4 opacity-80">
            Tu lugar en {tournament.title} está asegurado. ¡Prepárate para la cancha!
          </p>
        </div>

        <div className="relative w-full mb-8 drop-shadow-2xl">
          <div className="bg-white rounded-t-[2rem] overflow-hidden relative border-x border-t border-slate-100 shadow-sm">
            <div className="h-36 w-full relative">
              <img 
                alt="Tennis" 
                className="w-full h-full object-cover" 
                src={tournament.image || "https://images.unsplash.com/photo-1599586120429-48281b6f0ece?w=800&q=80"}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
              <div className="absolute bottom-4 left-5 text-white">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-0.5">Inscripción Oficial</p>
                <h3 className="text-xl font-black tracking-tight">{tournament.title}</h3>
              </div>
            </div>
            
            <div className="p-6 space-y-5">
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
                    <span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Fecha</span>
                    <span className="text-sm font-black text-secondary">{tournament.date.split('•')[0]}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[20px] font-black">schedule</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Hora</span>
                    <span className="text-sm font-black text-secondary">09:00 AM</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative h-px w-full bg-white border-x border-slate-100">
             <div className="absolute inset-x-6 top-0 border-t-2 border-dashed border-slate-200"></div>
          </div>

          <div className="bg-white rounded-b-[2rem] p-8 flex flex-col items-center justify-center border-x border-b border-slate-100">
            <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-50 mb-4 transition-transform hover:scale-105">
              <img 
                alt="QR Code" 
                className="size-36" 
                src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=TB-REG-83920"
              />
            </div>
            <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.2em] mb-1">ESCANEAR EN EL INGRESO</p>
            <p className="text-[10px] text-slate-300 font-mono font-bold">ID: #83920-TB</p>
          </div>
        </div>

        <div className="mt-auto pt-6 space-y-4">
          <button className="w-full flex items-center justify-center gap-3 bg-primary hover:bg-[#0fd641] text-secondary font-black text-lg py-5 rounded-2xl shadow-xl shadow-primary/30 transition-all active:scale-[0.98]">
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
      </main>
    </div>
  );
};

export default Confirmation;
