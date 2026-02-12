
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Tournaments: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<'hub' | 'available' | 'my'>('hub');
  
  const userStr = localStorage.getItem('app_user');
  const user = userStr ? JSON.parse(userStr) : { name: "Usuario" };
  
  const [registeredIds, setRegisteredIds] = useState<number[]>([]);
  
  useEffect(() => {
    const saved = localStorage.getItem('registered_tournaments');
    if (saved) {
      setRegisteredIds(JSON.parse(saved));
    }
  }, []);

  const allTournaments = [
    {
      id: 1,
      title: "Caballeros Singles - 3ra Categoría",
      subtitle: "Singles Caballeros",
      date: "10 - 15 Mar",
      count: "24 Inscriptos",
      image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDIkCK9JuzOAYSvIEnZEzVW1-ZAVUeE8egZW2EpjfdMsZim28_IttidOyrb4lpXZ-Z4VavCZ7qY4IPZpesaLzgX3p2NRC_oHeYyyhHVSAh3ptTRqutybTxUSEScEU2OUi8rLmzApP2kELvfkgwVWxuwr6zp22cG6-SReuwbO_ycD8hLiHrtuX5YhGO0PnTj6BWMMHjQptD7EBJF1ckrVVWvvDCVYor5bi7B_ayvBHsBV07mbEFmeaHNkjX6_inckgOqIpQe_toVUJE",
      avatars: ["https://i.pravatar.cc/150?u=1", "https://i.pravatar.cc/150?u=2", "https://i.pravatar.cc/150?u=3"],
      extra: "+21"
    },
    {
      id: 2,
      title: "Caballeros Singles - 2da Categoría",
      subtitle: "Singles Caballeros",
      date: "12 - 18 Mar",
      count: "16 Inscriptos",
      image: "https://lh3.googleusercontent.com/aida-public/AB6AXuCJdWlacuqkDcu2Q0AVWRtpMog2NYZKB_m6UbjJ9vAC_kOGuh3mbwI_BfJPc5hG9H6gqtvses85VMCYm4RTvxbYb6u7SC9pOoGFf3WcsoMUQNe785z1Z9ALzLdDpndsM0Y81awbpbqwZfJ218iwcyKvs3lpN8yYLn0KLwu_XvTME6ukU9OGSrJbMbx4VyVL0raJpjrrJJz0BXQwhVWHnrVZLJ3R6KHBmMZbtCrZfvYj9AD5b57emWAExThw4FcoUkLlUnWtV4b9gbw",
      avatars: ["https://i.pravatar.cc/150?u=4", "https://i.pravatar.cc/150?u=5"],
      extra: "+14"
    },
    {
      id: 3,
      title: "Caballeros Singles - Intermedia",
      subtitle: "Singles Caballeros",
      date: "20 - 25 Mar",
      count: "8 Inscriptos",
      image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBuAVvQAMpWs1A9RwmoapmwZFYSYckJHuLnfshuYRf6nvdqffLuXkcMR81eVmc0q1dFQmvZIZ5J374TuBT7jPOc_F4CubG2eUlnWfwdL2rq3p5mpkSHKJxyjfWsXWQJ5OFnKEh3bD9ClhfY9c9iVENVc5kwGn0FoBuDU99Ep6wEDCKsBDlsCpyzr035p9WEN5KHl-25VBGQ7jirkd7xecbOFfw4WFisYaNRwRdYpqrPUFNV9dxcf8a0WbXGjADZx3z4zpwTHO-6dZA",
      avatars: ["https://i.pravatar.cc/150?u=6"],
      extra: "+7"
    },
    {
      id: 5,
      title: "Torneo de Dobles Mixto/Libre",
      subtitle: "Dobles Mixtos",
      date: "01 - 05 Abr",
      count: "12 Parejas",
      image: "https://lh3.googleusercontent.com/aida-public/AB6AXuD822xk3Z5UFXimD5jaQ65Pnav_h7KOLdQhGDXtI3BeM9pnk_Tt7U_DZ5S9em63Fv8_cmz6E0VSlWflf_IBpjHT4Wz3Xya44BAQa03zjSYZbofwQPZYe4j4iBLfRaHTKdPAu15lgCnuwsHZFrJagJNeKFqZcUxjbSt6yMTfcKpyfClnNxYaroLk8-yrFr5PKz_sruS2a2IJRKHsKhiv9EzWf43769G7WPg8cubAvG5_UXnpRvdzdUdcBrUC8rBeyJD6gUzuwaRV_A8",
      avatars: ["https://i.pravatar.cc/150?u=7", "https://i.pravatar.cc/150?u=8"],
      extra: "+22"
    },
    {
      id: 4,
      title: "Mujeres Singles - Categoría Libre",
      subtitle: "Singles Damas",
      date: "08 - 14 Abr",
      count: "32 Inscriptas",
      image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDxjuplDHRtHd-OUwF9Wwm5vPaBjuJZjHY8AvJejxsz0vrfcVLBOxqADQ76jP5vZAekynJhedQty64BTK8MDV3qzGosWwiEh7pXTKvx42CIvBNVHf8eziGbWpAGDVguikTH8Uena9SbZ4riqBdijv_eW4jffLPebFJ-NPHWRaFjJrPofF6isZ5DXtu-TIzHxMkKw3jdO-I0jdBxgrq7t9SZF7mD-KSZTRCsDROfxNYnleiVj0IbvOYw7jkZsmAOaioxUSes-yG8X0M",
      avatars: ["https://i.pravatar.cc/150?u=9", "https://i.pravatar.cc/150?u=10"],
      extra: "+30"
    }
  ];

  const myRegisteredTournaments = allTournaments.filter(t => registeredIds.includes(t.id));

  // AVAILABLE TOURNAMENTS VIEW
  if (view === 'available') {
    return (
      <div className="relative flex min-h-full w-full flex-col bg-background-light dark:bg-background-dark font-display pb-32 md:pb-0">
        <header className="flex items-center p-4 md:px-8 pb-2 justify-between bg-background-light dark:bg-background-dark sticky top-0 z-40 border-b border-transparent md:border-gray-100 dark:md:border-white/5">
          <button 
            onClick={() => setView('hub')}
            className="flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-[#111813] dark:text-white"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h2 className="text-[#111813] dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center md:text-left md:pl-4">Centro de Torneos</h2>
          <div className="flex w-12 items-center justify-end">
            <button className="flex items-center justify-center rounded-full size-12 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-[#111813] dark:text-white">
              <span className="material-symbols-outlined">search</span>
            </button>
          </div>
        </header>

        <div className="max-w-7xl mx-auto w-full">
          <h1 className="text-[#111813] dark:text-white text-[22px] font-bold leading-tight tracking-[-0.015em] px-4 md:px-8 text-left pb-3 pt-4">Torneos Disponibles</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4 md:p-8 pt-0">
            {allTournaments.map((tournament) => (
              <div 
                key={tournament.id}
                className="flex flex-col rounded-xl bg-white dark:bg-[#1a2e1f] shadow-[0_2px_8px_rgba(0,0,0,0.08)] overflow-hidden transition-all hover:scale-[1.01] hover:shadow-lg group"
              >
                <div className="relative h-48 w-full bg-gray-100 dark:bg-gray-700">
                  <div 
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-500 group-hover:scale-105" 
                    style={{ backgroundImage: `url("${tournament.image}")` }}
                  ></div>
                  <div className="absolute top-3 right-3 bg-white/90 dark:bg-black/80 backdrop-blur-sm px-3 py-1 rounded-full border border-gray-100 dark:border-gray-800">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#111813] dark:text-white">Inscripción Abierta</p>
                  </div>
                </div>
                <div className="p-5 flex flex-col gap-3 flex-1">
                  <div className="flex flex-col gap-1">
                    <p className="text-[#111813] dark:text-white text-xl font-bold leading-tight">{tournament.title}</p>
                    <div className="flex items-center gap-2 text-secondary-text dark:text-gray-400 text-sm">
                      <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                      <span>{tournament.date} • {tournament.count}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-auto pt-4">
                    <div className="flex -space-x-2 overflow-hidden">
                      {tournament.avatars.map((avatar, i) => (
                        <img key={i} className="inline-block h-8 w-8 rounded-full ring-2 ring-white dark:ring-[#1a2e1f] object-cover" src={avatar} alt="P" />
                      ))}
                      {tournament.extra && (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 ring-2 ring-white dark:ring-[#1a2e1f] text-[10px] font-bold text-gray-500 dark:text-gray-300">
                          {tournament.extra}
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => navigate('/tournament-details', { state: { tournament } })}
                      className="bg-[#4a9c40] hover:bg-[#3d8b33] text-white font-bold py-2 px-5 rounded-lg text-sm transition-colors flex items-center gap-1 shadow-md shadow-[#4a9c40]/20"
                    >
                      Ver detalles
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // MY TOURNAMENTS VIEW
  if (view === 'my') {
    return (
      <div className="relative flex min-h-full w-full flex-col bg-background-light dark:bg-background-dark font-display pb-32 md:pb-0">
        <header className="flex items-center bg-white dark:bg-background-dark p-4 md:px-8 justify-between border-b border-gray-100 dark:border-gray-800 sticky top-0 z-20">
          <button 
            onClick={() => setView('hub')}
            className="size-12 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-[#111813] dark:text-white"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h2 className="text-lg font-bold text-[#111813] dark:text-white flex-1 text-center md:text-left md:pl-4">Mis Torneos</h2>
          <div className="w-12"></div>
        </header>

        <div className="max-w-7xl mx-auto w-full p-4 md:p-8">
          {myRegisteredTournaments.length === 0 ? (
            <div className="bg-white dark:bg-[#1a2e1f] p-12 rounded-3xl text-center shadow-sm border border-gray-100 dark:border-gray-800 max-w-lg mx-auto mt-10">
              <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-6xl mb-4">sports_tennis</span>
              <p className="text-gray-500 dark:text-gray-400 font-medium text-lg">No tienes torneos activos.</p>
              <button onClick={() => setView('available')} className="mt-6 text-[#4a9c40] font-bold text-lg hover:underline">Ver torneos disponibles</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myRegisteredTournaments.map(t => (
                <div 
                  key={t.id} 
                  onClick={() => navigate('/tournament-panel', { state: { tournament: t } })}
                  className="bg-white dark:bg-[#1a2e1f] rounded-3xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex items-center gap-4 hover:scale-[1.01] hover:shadow-md transition-all cursor-pointer group"
                >
                  <img src={t.image} className="size-24 rounded-2xl object-cover" alt={t.title} />
                  <div className="flex-1">
                    <h4 className="font-bold text-lg text-[#111813] dark:text-white leading-tight mb-2">{t.title}</h4>
                    <p className="text-xs text-gray-400">{t.date}</p>
                    <span className="text-primary text-xs font-bold mt-1 inline-block">Ver Panel</span>
                  </div>
                  <span className="material-symbols-outlined text-gray-400 group-hover:text-primary transition-colors">chevron_right</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // HUB VIEW
  return (
    <div className="relative flex min-h-full w-full flex-col bg-background-light dark:bg-background-dark font-display pb-28 md:pb-0">
      <header className="flex items-center p-4 md:px-8 pb-2 justify-between bg-background-light dark:bg-background-dark sticky top-0 z-10 border-b border-transparent md:border-gray-100 dark:md:border-white/5">
        <div 
          onClick={() => navigate('/')}
          className="flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors cursor-pointer text-[#111813] dark:text-white"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </div>
        <h2 className="text-[#111813] dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center md:text-left md:pl-4">Centro de Torneos</h2>
        <div className="flex w-12 items-center justify-end"></div>
      </header>

      <div className="flex flex-col md:flex-row gap-5 px-4 md:px-8 py-4 md:py-8 flex-1 max-w-7xl mx-auto w-full">
        {/* Card: Mis Torneos */}
        <div 
          onClick={() => setView('my')}
          className="group relative flex flex-col justify-between overflow-hidden rounded-3xl bg-white dark:bg-[#1a2e1f] p-8 shadow-md transition-all hover:shadow-xl hover:-translate-y-1 cursor-pointer flex-1 min-h-[240px] border border-transparent hover:border-[#4a9c40]"
        >
          <div className="absolute right-0 top-0 h-64 w-64 translate-x-12 translate-y-[-3rem] rounded-full bg-primary/5 blur-3xl group-hover:bg-primary/10 transition-colors"></div>
          <div className="flex justify-between items-start relative z-10">
            <div className="rounded-2xl bg-[#4a9c40]/10 p-5 text-[#4a9c40] group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-5xl">sports_tennis</span>
            </div>
            <span className="inline-flex items-center rounded-full bg-[#4a9c40]/20 px-4 py-1.5 text-xs font-bold text-green-800 dark:text-green-200 ring-1 ring-inset ring-green-600/20">
              {registeredIds.length} {registeredIds.length === 1 ? 'Activo' : 'Activos'}
            </span>
          </div>
          <div className="mt-auto relative z-10">
            <h3 className="text-4xl font-bold text-[#111813] dark:text-white mb-2">Mis Torneos</h3>
            <p className="text-secondary-text dark:text-gray-400 text-lg font-medium">Gestioná tus competencias actuales</p>
          </div>
          <div className="absolute bottom-8 right-8 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0 translate-x-4">
            <span className="material-symbols-outlined text-[#4a9c40] text-4xl">arrow_forward</span>
          </div>
        </div>

        {/* Card: Torneos Disponibles */}
        <div 
          onClick={() => setView('available')}
          className="group relative flex flex-col justify-between overflow-hidden rounded-3xl bg-[#111813] dark:bg-black p-8 shadow-md transition-all hover:shadow-xl hover:-translate-y-1 cursor-pointer flex-1 min-h-[240px] border border-gray-800"
        >
          <div className="absolute right-0 bottom-0 h-64 w-64 translate-x-16 translate-y-16 rounded-full bg-[#4a9c40]/15 blur-3xl group-hover:bg-[#4a9c40]/25 transition-colors"></div>
          <div className="flex justify-between items-start relative z-10">
            <div className="rounded-2xl bg-white/10 p-5 text-[#4a9c40] group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-5xl">emoji_events</span>
            </div>
          </div>
          <div className="mt-auto relative z-10">
            <h3 className="text-4xl font-bold text-white mb-2">Torneos Disponibles</h3>
            <p className="text-[#4a9c40] font-bold text-lg">¡Inscribite ahora!</p>
          </div>
          <div className="absolute bottom-8 right-8 bg-[#4a9c40] rounded-full p-4 text-background-dark flex items-center justify-center group-hover:bg-[#3d8b33] transition-all group-hover:scale-110 shadow-lg shadow-[#4a9c40]/40">
            <span className="material-symbols-outlined text-3xl font-bold">add</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tournaments;
