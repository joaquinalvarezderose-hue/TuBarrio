
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const TournamentPanel: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const savedTournament = localStorage.getItem('active_tournament');
  const tournament = location.state?.tournament || (savedTournament ? JSON.parse(savedTournament) : { 
    title: "Abierto de Tenis TuBarrio",
    id: 1,
    subtitle: "2da Categoría - Singles",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDIkCK9JuzOAYSvIEnZEzVW1-ZAVUeE8egZW2EpjfdMsZim28_IttidOyrb4lpXZ-Z4VavCZ7qY4IPZpesaLzgX3p2NRC_oHeYyyhHVSAh3ptTRqutybTxUSEScEU2OUi8rLmzApP2kELvfkgwVWxuwr6zp22cG6-SReuwbO_ycD8hLiHrtuX5YhGO0PnTj6BWMMHjQptD7EBJF1ckrVVWvvDCVYor5bi7B_ayvBHsBV07mbEFmeaHNkjX6_inckgOqIpQe_toVUJE"
  });

  useEffect(() => {
    localStorage.setItem('active_tournament', JSON.stringify(tournament));
  }, [tournament]);

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col pb-24 bg-background-light dark:bg-background-dark transition-colors duration-300 font-display no-scrollbar overflow-y-auto">
      {/* Header iOS Style */}
      <header className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md px-4 py-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center text-[#111813] dark:text-white hover:bg-black/5 dark:hover:bg-white/5 p-1 rounded-full transition-colors"
        >
          <span className="material-symbols-outlined text-2xl">arrow_back_ios</span>
        </button>
        <h1 className="text-lg font-bold tracking-tight text-[#111813] dark:text-white">Panel del Torneo</h1>
        <div className="w-8"></div> {/* Spacer for centering */}
      </header>

      <main className="flex-1 p-4 space-y-6">
        {/* Tournament Highlight Card */}
        <section className="">
          <div className="relative overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-sm border border-gray-100 dark:border-gray-800">
            <div 
              className="w-full h-32 bg-cover bg-center" 
              style={{ backgroundImage: `url("${tournament.image}")` }}
            ></div>
            <div className="p-5">
              <div className="flex flex-col gap-1">
                <span className="text-primary text-xs font-bold uppercase tracking-widest">En curso</span>
                <h2 className="text-xl font-bold leading-tight text-[#111813] dark:text-white">{tournament.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="bg-primary/10 text-[#4a9c40] dark:bg-primary/20 px-2 py-0.5 rounded text-xs font-semibold">Categoría: Segunda</span>
                  <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded text-xs font-semibold">Grupo C</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Action Grid 2x2 */}
        <section className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => navigate('/fixture', { state: { tournament } })}
            className="flex flex-col items-center justify-center gap-3 p-6 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 active:scale-95 transition-transform group"
          >
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-[#4a9c40] group-hover:bg-primary/20 transition-colors">
              <span className="material-symbols-outlined text-3xl">calendar_month</span>
            </div>
            <span className="text-sm font-semibold text-center text-[#111813] dark:text-white">Fixture y Fechas</span>
          </button>
          
          <button 
            onClick={() => navigate('/standings', { state: { tournament } })}
            className="flex flex-col items-center justify-center gap-3 p-6 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 active:scale-95 transition-transform group"
          >
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-[#4a9c40] group-hover:bg-primary/20 transition-colors">
              <span className="material-symbols-outlined text-3xl">emoji_events</span>
            </div>
            <span className="text-sm font-semibold text-center text-[#111813] dark:text-white">Tabla de Posiciones</span>
          </button>
          
          <button 
            onClick={() => navigate('/match-result', { state: { tournament } })}
            className="flex flex-col items-center justify-center gap-3 p-6 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 active:scale-95 transition-transform group"
          >
            <div className="size-12 rounded-full bg-[#4a9c40] flex items-center justify-center text-white group-hover:bg-[#3d8b33] transition-colors shadow-md">
              <span className="material-symbols-outlined text-3xl">sports_tennis</span>
            </div>
            <span className="text-sm font-semibold text-center text-[#111813] dark:text-white">Cargar Resultado</span>
          </button>
          
          <button 
            onClick={() => navigate('/rules')}
            className="flex flex-col items-center justify-center gap-3 p-6 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 active:scale-95 transition-transform group"
          >
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-[#4a9c40] group-hover:bg-primary/20 transition-colors">
              <span className="material-symbols-outlined text-3xl">info</span>
            </div>
            <span className="text-sm font-semibold text-center text-[#111813] dark:text-white">Reglamento y FAQ</span>
          </button>
        </section>

        {/* Mi Próximo Partido */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold tracking-tight px-1 text-[#111813] dark:text-white">Mi Próximo Partido</h3>
          <div className="bg-white dark:bg-gray-900 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 relative overflow-hidden">
            {/* Accent bar */}
            <div className="absolute top-0 left-0 w-1.5 h-full bg-[#4a9c40]"></div>
            
            <div className="flex justify-between items-start mb-4">
              <div className="space-y-1">
                <p className="text-xs font-bold text-[#4a9c40] uppercase tracking-wider">Fecha 4</p>
                <h4 className="text-lg font-bold text-[#111813] dark:text-white">vs. Mariano Rodríguez</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Jugar antes del 15/10</p>
              </div>
              <div className="size-12 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden shrink-0 border-2 border-white dark:border-gray-700 shadow-sm">
                <img 
                  alt="Mariano Rodríguez" 
                  className="w-full h-full object-cover" 
                  src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&h=120&fit=crop"
                />
              </div>
            </div>
            
            <div className="flex flex-col gap-3">
              <button className="flex items-center justify-center gap-2 w-full py-3 bg-[#25D366] text-white rounded-lg font-bold shadow-md hover:bg-[#20bd5a] transition-all active:scale-[0.98]">
                <svg className="size-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"></path>
                </svg>
                WhatsApp del Rival
              </button>
              
              <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <span className="material-symbols-outlined text-gray-400">location_on</span>
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Sede Central - Cancha 3 (Polvo)</span>
              </div>
            </div>
          </div>
        </section>

        {/* Status Footer */}
        <section className="mt-8 text-center px-4">
          <p className="text-xs text-gray-500 dark:text-gray-500 font-bold uppercase tracking-wide">Estás en la posición #4 de tu grupo</p>
          <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full mt-3 overflow-hidden">
            <div className="bg-[#4a9c40] h-full w-[65%] rounded-full shadow-[0_0_8px_rgba(74,156,64,0.4)]"></div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default TournamentPanel;