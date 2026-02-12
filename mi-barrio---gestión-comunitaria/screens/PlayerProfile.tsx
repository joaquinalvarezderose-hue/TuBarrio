
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const PlayerProfile: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const tournament = location.state?.tournament || { 
    title: "Abierto de Tenis TuBarrio",
    subtitle: "2da Categoría - Singles"
  };
  
  const userStr = localStorage.getItem('app_user');
  const user = userStr ? JSON.parse(userStr) : { name: "Julián Álvarez" };

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto bg-background-light dark:bg-background-dark font-display pb-28 overflow-y-auto no-scrollbar">
      {/* Header */}
      <div className="flex items-center bg-card-light dark:bg-card-dark p-4 pb-2 justify-between shadow-sm sticky top-0 z-20">
        <button 
          onClick={() => navigate(-1)}
          className="text-text-light dark:text-text-dark flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>arrow_back</span>
        </button>
        <h2 className="text-text-light dark:text-text-dark text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-12">Perfil de Jugador</h2>
      </div>

      <div className="flex-1 flex flex-col gap-4">
        {/* User Card */}
        <div className="bg-card-light dark:bg-card-dark p-6 pb-8 rounded-b-[2rem] shadow-sm mb-2">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="h-24 w-24 rounded-full bg-gray-200 overflow-hidden border-4 border-accent-bg-light dark:border-accent-bg-dark shadow-md">
                <div 
                  className="h-full w-full bg-cover bg-center" 
                  style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDvueop6RV7jnajGRJG7PLDzvYTemR0HfPDRvGzDKmtQrghf4Ukk4K-ZuxYLuYQwuKdV4uCGgsBYqbZdLAnpn65-NCHhBu7isoAyAQeY4tjCpB5WOOahqdWEFxP6pXCd7cpse4AsWLK1F6o2qrV42ueB5EW-9tnHiWKggjboGvD9LuYrv2Mbi5ryv8SirOzc8NWL-FVnat9-RrHERojqzOnKi3S6Au7GhdWWtWYH7-IJDr98-XiOBs7NnvmM3_J11KK9z1rVDz1xAQ")' }}
                ></div>
              </div>
              <div className="absolute bottom-0 right-0 h-7 w-7 bg-primary rounded-full border-2 border-white dark:border-card-dark flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-white text-[16px] font-bold">check</span>
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-text-light dark:text-text-dark tracking-tight">{user.name}</h1>
              <p className="text-secondary-text-light dark:text-secondary-text-dark font-medium mt-1">Nivel 4.5 • Socio #8291</p>
            </div>
            <div className="flex w-full justify-center gap-2 mt-2">
              <div className="flex flex-1 flex-col items-center bg-accent-bg-light dark:bg-accent-bg-dark p-3 rounded-2xl">
                <span className="text-xl font-bold text-text-light dark:text-text-dark">24</span>
                <span className="text-[10px] uppercase font-bold text-secondary-text-light dark:text-secondary-text-dark tracking-wider mt-1">Partidos</span>
              </div>
              <div className="flex flex-1 flex-col items-center bg-accent-bg-light dark:bg-accent-bg-dark p-3 rounded-2xl">
                <span className="text-xl font-bold text-primary">68%</span>
                <span className="text-[10px] uppercase font-bold text-secondary-text-light dark:text-secondary-text-dark tracking-wider mt-1">Victorias</span>
              </div>
              <div className="flex flex-1 flex-col items-center bg-accent-bg-light dark:bg-accent-bg-dark p-3 rounded-2xl">
                <span className="text-xl font-bold text-text-light dark:text-text-dark">15</span>
                <span className="text-[10px] uppercase font-bold text-secondary-text-light dark:text-secondary-text-dark tracking-wider mt-1">Sets</span>
              </div>
            </div>
          </div>
        </div>

        {/* Torneos en Curso */}
        <div className="px-4">
          <h3 className="text-text-light dark:text-text-dark text-lg font-bold leading-tight tracking-tight mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">sports_tennis</span>
            Torneos en Curso
          </h3>
          <div className="flex flex-col items-stretch justify-start rounded-xl shadow-md bg-card-light dark:bg-card-dark overflow-hidden border border-gray-100 dark:border-gray-800">
            <div className="relative h-32 w-full bg-gray-200">
              <div 
                className="absolute inset-0 bg-cover bg-center" 
                style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuBcSiNAKEJNrLa2M4arvvd0bSblQSYQDccXm2LpEdlBCsOwDZi1xu_lkLSRZdADWafgDhOPEINWFc5u5RVWd1Lo0Wbz6DgwMgcdlk2BLLay4pMzTctgF4yL0MzmMvkAnv0OulwU2J2H7ZxC_S7cSxlKJVfgfgQHORwuCnx-hu9l5yLuj0Nj0qNoXeI_H_yFeaTM1C34ickxSIZz8r3-kyBSTcXtc3Ng1kt5KFtUz8OKIrywlkVKDvGux5IuVlRKDu_2oTSAWooTEF4")' }}
              ></div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
              <div className="absolute bottom-3 left-4 right-4">
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-primary text-text-light uppercase tracking-wider mb-1">En Progreso</span>
                <p className="text-white text-lg font-bold leading-tight drop-shadow-md">{tournament.title}</p>
                <p className="text-gray-200 text-sm font-medium">{tournament.subtitle}</p>
              </div>
            </div>
            <div className="flex w-full grow flex-col gap-4 p-4">
              <div className="flex items-center gap-4 bg-accent-bg-light dark:bg-accent-bg-dark rounded-lg p-3">
                <div className="flex-1 text-center border-r border-gray-200 dark:border-gray-700">
                  <p className="text-secondary-text-light dark:text-secondary-text-dark text-xs font-medium">Posición</p>
                  <p className="text-text-light dark:text-text-dark font-bold text-lg">2do</p>
                </div>
                <div className="flex-1 text-center border-r border-gray-200 dark:border-gray-700">
                  <p className="text-secondary-text-light dark:text-secondary-text-dark text-xs font-medium">Grupo</p>
                  <p className="text-text-light dark:text-text-dark font-bold text-lg">B</p>
                </div>
                <div className="flex-1 text-center">
                  <p className="text-secondary-text-light dark:text-secondary-text-dark text-xs font-medium">Puntos</p>
                  <p className="text-text-light dark:text-text-dark font-bold text-lg">12</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-text-light dark:text-text-dark text-sm font-bold flex items-center gap-2">
                  <span className="size-2 rounded-full bg-red-500 animate-pulse"></span>
                  Próximo Partido
                </p>
                <div className="flex items-center justify-between bg-background-light dark:bg-background-dark rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col">
                    <p className="text-text-light dark:text-text-dark font-semibold text-sm">vs. Juan Pérez</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="material-symbols-outlined text-secondary-text-light dark:text-secondary-text-dark" style={{ fontSize: '14px' }}>calendar_today</span>
                      <p className="text-secondary-text-light dark:text-secondary-text-dark text-xs">15/05 - 18:00hs</p>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="material-symbols-outlined text-secondary-text-light dark:text-secondary-text-dark" style={{ fontSize: '14px' }}>location_on</span>
                      <p className="text-secondary-text-light dark:text-secondary-text-dark text-xs">Cancha 3 - Polideportivo</p>
                    </div>
                  </div>
                  <div className="bg-gray-200 dark:bg-gray-700 h-10 w-10 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-300">VS</span>
                  </div>
                </div>
              </div>
              <button className="w-full cursor-pointer items-center justify-center rounded-lg h-10 px-4 bg-primary hover:bg-primary-dark active:bg-primary-dark transition-colors text-text-light text-sm font-bold flex gap-2">
                <span>Ver Fixture Completo</span>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
              </button>
            </div>
          </div>
        </div>

        {/* Próximos Partidos */}
        <div className="px-4 pt-2">
          <h3 className="text-text-light dark:text-text-dark text-lg font-bold leading-tight tracking-tight mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">schedule</span>
            Próximos Partidos
          </h3>
          <div className="flex flex-col gap-3">
            {[
              { date: "15", month: "May", opponent: "Juan Pérez", tourney: "Abierto TuBarrio • Grupo B", time: "18:00hs", court: "Cancha 3" },
              { date: "22", month: "May", opponent: "Martín G.", tourney: "Abierto TuBarrio • Grupo B", time: "19:30hs", court: "Cancha 1" },
              { date: "01", month: "Jun", opponent: "A Confirmar", tourney: "Torneo Relámpago • Octavos", time: "TBD", court: "Club Central", opacity: "opacity-60" }
            ].map((p, i) => (
              <div key={i} className={`flex items-center p-3 bg-card-light dark:bg-card-dark rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 ${p.opacity || ''}`}>
                <div className="flex flex-col items-center justify-center w-14 h-14 bg-accent-bg-light dark:bg-accent-bg-dark rounded-lg mr-4 shrink-0">
                  <span className="text-xs font-bold text-secondary-text-light dark:text-secondary-text-dark uppercase">{p.month}</span>
                  <span className="text-lg font-bold text-text-light dark:text-text-dark">{p.date}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-text-light dark:text-text-dark text-sm font-bold truncate">vs. {p.opponent}</p>
                  <p className="text-secondary-text-light dark:text-secondary-text-dark text-xs truncate">{p.tourney}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="inline-flex items-center gap-1 text-xs text-secondary-text-light dark:text-secondary-text-dark">
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>schedule</span>
                      {p.time}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-secondary-text-light dark:text-secondary-text-dark">
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>stadium</span>
                      {p.court}
                    </span>
                  </div>
                </div>
                <button className="shrink-0 p-2 text-primary hover:bg-accent-bg-light dark:hover:bg-accent-bg-dark rounded-full transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>chevron_right</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerProfile;