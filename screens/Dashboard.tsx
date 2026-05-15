
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

      <main className="flex-1 p-4 md:p-8 flex flex-col gap-6 w-full max-w-7xl mx-auto">
        {/* Contribution Points Section */}
        <section aria-label="Estado de Puntos" className="w-full">
          <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-card-dark p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-gray-100 dark:border-white/5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Puntos de Contribución</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-[#111813] dark:text-white tracking-tight">1.250</span>
                <span className="text-sm font-bold text-primary">pts</span>
              </div>
            </div>
            <div className="h-14 w-14 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-primary ring-1 ring-primary/10">
              <span className="material-symbols-outlined text-2xl">stars</span>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Quick Access Grid */}
          <section aria-label="Accesos Rápidos" className="md:col-span-2">
            <h3 className="text-[#111813] dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] mb-4">Accesos Rápidos</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div 
                onClick={() => navigate('/services')}
                className="col-span-2 md:col-span-2 relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#13ec49] via-green-500 to-green-700 p-6 shadow-xl text-white group cursor-pointer flex items-center justify-between h-48 md:h-56 active:scale-[0.98] transition-transform"
              >
                <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-white/20 blur-3xl group-hover:bg-white/30 transition-all"></div>
                <div className="relative z-10 flex flex-col justify-center gap-2 h-full">
                  <div className="inline-flex items-center justify-center rounded-xl bg-white/20 p-3 backdrop-blur-sm w-fit mb-1">
                    <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>home_repair_service</span>
                  </div>
                  <h4 className="text-2xl md:text-3xl font-bold leading-tight tracking-tight">Contratar <br/> Servicios</h4>
                  <p className="text-green-50 text-xs md:text-sm font-medium opacity-90">Plomería, electricidad y más</p>
                </div>
                <div className="relative z-10 bg-white/20 rounded-full p-3 backdrop-blur-sm flex items-center justify-center self-center transition-transform group-hover:scale-110 group-hover:bg-white/30">
                  <span className="material-symbols-outlined text-2xl font-bold">arrow_forward</span>
                </div>
              </div>

              <div 
                onClick={() => navigate('/tournaments')}
                className="col-span-1 relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 p-5 shadow-lg text-white group cursor-pointer flex flex-col justify-between h-40 md:h-56 active:scale-[0.98] transition-transform"
              >
                <div className="absolute right-0 top-0 h-24 w-24 -mr-6 -mt-6 rounded-full bg-white/20 blur-2xl group-hover:bg-white/30 transition-all"></div>
                <div className="relative z-10">
                  <div className="inline-flex items-center justify-center rounded-lg bg-white/20 p-2 backdrop-blur-sm">
                    <span className="material-symbols-outlined">emoji_events</span>
                  </div>
                </div>
                <div className="relative z-10">
                  <h4 className="text-base md:text-lg font-bold leading-tight">Mis<br/>Torneos</h4>
                  <span className="text-[10px] md:text-xs font-bold uppercase opacity-75 tracking-tight mt-1 block">Competir ahora</span>
                </div>
              </div>

              <div 
                className="col-span-1 md:hidden relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 p-5 shadow-lg text-white cursor-pointer hover:shadow-xl transition-all h-40 active:scale-[0.98] group"
              >
                <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10 blur-xl group-hover:bg-white/20 transition-all"></div>
                <div className="mb-2 relative z-10">
                  <div className="inline-flex items-center justify-center rounded-lg bg-white/20 p-2 backdrop-blur-sm">
                    <span className="material-symbols-outlined">forum</span>
                  </div>
                </div>
                <div className="mt-auto relative z-10">
                  <h4 className="font-bold text-white leading-tight mb-1 text-base">Comunidad</h4>
                  <span className="text-[10px] font-bold uppercase opacity-80 tracking-tight">Noticias y Avisos</span>
                </div>
              </div>
            </div>
          </section>

          {/* Neighborhood Activity */}
          <section aria-label="Actividad del Barrio" className="md:col-span-1">
            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="text-[#111813] dark:text-white text-lg font-bold leading-tight tracking-[-0.015em]">Actividad del Barrio</h3>
              <button className="text-primary text-sm font-semibold hover:underline">Ver todo</button>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-4 bg-white dark:bg-card-dark px-4 py-4 rounded-xl shadow-sm border border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer">
                <div className="bg-center bg-no-repeat bg-cover rounded-full h-12 w-12 shrink-0 ring-2 ring-gray-100 dark:ring-white/10" 
                     style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop")' }}></div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-0.5">
                    <p className="text-[#111813] dark:text-white text-sm font-bold truncate">Reparación de Luminaria</p>
                    <span className="text-gray-400 text-xs whitespace-nowrap ml-2">Hace 1h</span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 text-xs font-normal leading-normal line-clamp-2">
                    El equipo de mantenimiento viene mañana a las 9 AM.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 bg-white dark:bg-card-dark px-4 py-4 rounded-xl shadow-sm border border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer">
                <div className="bg-center bg-no-repeat bg-cover rounded-full h-12 w-12 shrink-0 ring-2 ring-gray-100 dark:ring-white/10" 
                     style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop")' }}></div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-0.5">
                    <p className="text-[#111813] dark:text-white text-sm font-bold truncate">Recomendación de Plomero</p>
                    <span className="text-gray-400 text-xs whitespace-nowrap ml-2">Hace 3h</span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 text-xs font-normal leading-normal line-clamp-2">
                    ¡Súper recomiendo a Mario para filtraciones! Llegó en una hora.
                  </p>
                </div>
              </div>
              {/* Desktop extra items */}
              <div className="hidden md:flex items-center gap-4 bg-white dark:bg-card-dark px-4 py-4 rounded-xl shadow-sm border border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-full h-12 w-12 shrink-0 flex items-center justify-center text-white">
                    <span className="material-symbols-outlined">campaign</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-0.5">
                    <p className="text-[#111813] dark:text-white text-sm font-bold truncate">Aviso de Seguridad</p>
                    <span className="text-gray-400 text-xs whitespace-nowrap ml-2">Ayer</span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 text-xs font-normal leading-normal line-clamp-2">
                    Se reportó actividad sospechosa en la zona norte.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
