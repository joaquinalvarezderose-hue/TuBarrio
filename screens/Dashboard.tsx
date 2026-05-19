
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { perfil } = useCurrentUser();
  const displayName = perfil?.nombre_completo || 'Mi Barrio';

  return (
    <div className="relative flex h-full w-full flex-col bg-white dark:bg-background-dark font-display text-[#111813] dark:text-white antialiased pb-24 md:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between bg-white dark:bg-background-dark px-4 md:px-8 py-3 shadow-sm transition-colors border-b border-gray-50 dark:border-white/5">
        <div className="flex items-center gap-3">
          <div className="relative cursor-pointer" onClick={() => navigate('/profile')}>
            <div className="bg-center bg-no-repeat bg-cover rounded-full size-10 ring-2 ring-primary/20" 
                 style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDWCTIBw_oy-Ors3ZoHYHQLWWrP2rYitUAFYDQC96qpBg5zRQ0UJuzTU7TEXguGpmAtxIPehAFk_tIgue4CCUN_W31HX3c55gL_84iUycQWel6T6UNHnhJIl2xGIJHC1UnS12MTxFZeY96N83at-jCptspK9-sdolZivh3Kdq9PXrWqIV-o0608UHWWTicGLNzlT9hA1hEWMwr0k-wV_VKfbfmm5DgQiB8jSEBNeHXaqmRcsZGrX2D-oynMXF4IBFfHV75S21ziPMU")' }}></div>
            <div className="absolute bottom-0 right-0 size-3 rounded-full bg-primary border-2 border-white dark:border-background-dark"></div>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 leading-none">Hola de nuevo,</span>
            <h2 className="text-[#111813] dark:text-white text-lg font-bold leading-tight tracking-[-0.015em]">{displayName}</h2>
          </div>
        </div>
        <button className="relative flex items-center justify-center rounded-full size-10 bg-gray-50 dark:bg-white/10 hover:bg-gray-100 dark:hover:bg-white/20 text-[#111813] dark:text-white transition-colors">
          <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>notifications</span>
          <span className="absolute top-2.5 right-2.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
        </button>
      </header>

      <main className="flex-1 p-4 md:p-8 flex flex-col gap-6 w-full max-w-2xl mx-auto">
        <div
          onClick={() => navigate('/services')}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#13ec49] via-green-500 to-green-700 p-6 shadow-xl text-white group cursor-pointer flex items-center justify-between h-48 active:scale-[0.98] transition-transform"
        >
          <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-white/20 blur-3xl group-hover:bg-white/30 transition-all"></div>
          <div className="relative z-10 flex flex-col justify-center gap-2 h-full">
            <div className="inline-flex items-center justify-center rounded-xl bg-white/20 p-3 backdrop-blur-sm w-fit mb-1">
              <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>home_repair_service</span>
            </div>
            <h4 className="text-2xl font-bold leading-tight tracking-tight">Contratar Servicios</h4>
            <p className="text-green-50 text-sm font-medium opacity-90">Plomería, electricidad y más</p>
          </div>
          <div className="relative z-10 bg-white/20 rounded-full p-3 backdrop-blur-sm flex items-center justify-center self-center transition-transform group-hover:scale-110 group-hover:bg-white/30">
            <span className="material-symbols-outlined text-2xl font-bold">arrow_forward</span>
          </div>
        </div>

        <div
          onClick={() => navigate('/tournaments')}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 p-6 shadow-xl text-white group cursor-pointer flex items-center justify-between h-48 active:scale-[0.98] transition-transform"
        >
          <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-white/20 blur-3xl group-hover:bg-white/30 transition-all"></div>
          <div className="relative z-10 flex flex-col justify-center gap-2 h-full">
            <div className="inline-flex items-center justify-center rounded-xl bg-white/20 p-3 backdrop-blur-sm w-fit mb-1">
              <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>emoji_events</span>
            </div>
            <h4 className="text-2xl font-bold leading-tight tracking-tight">Torneos del Barrio</h4>
            <p className="text-amber-50 text-sm font-medium opacity-90">Participa y gana premios</p>
          </div>
          <div className="relative z-10 bg-white/20 rounded-full p-3 backdrop-blur-sm flex items-center justify-center self-center transition-transform group-hover:scale-110 group-hover:bg-white/30">
            <span className="material-symbols-outlined text-2xl font-bold">arrow_forward</span>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
