
import React from 'react';
import { useNavigate } from 'react-router-dom';

const Services: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto no-scrollbar pb-20">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-gray-100">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-lg font-black tracking-tight">Directorio de Servicios</h2>
        <button className="p-2 -mr-2 rounded-full hover:bg-gray-100">
          <span className="material-symbols-outlined">tune</span>
        </button>
      </header>

      <div className="px-4 py-4">
        <div className="relative mb-6">
          <input 
            type="text" 
            placeholder="Buscar plomero, jardinero, etc..." 
            className="w-full bg-gray-50 border-gray-100 rounded-2xl py-3.5 pl-11 text-sm font-medium focus:ring-primary focus:border-primary"
          />
          <span className="material-symbols-outlined absolute left-3.5 top-3.5 text-gray-400">search</span>
        </div>

        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-black">Recomendados</h3>
            <button className="text-primary text-xs font-bold">Ver todos</button>
          </div>
          <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-4 px-4 pb-2">
            {[
              { name: "Carlos", job: "Jardinero", rank: 98, img: "https://picsum.photos/seed/serv1/100/100" },
              { name: "Ana", job: "Pintora", rank: 95, img: "https://picsum.photos/seed/serv2/100/100" },
              { name: "Juan", job: "Plomero", rank: 92, img: "https://picsum.photos/seed/serv3/100/100" },
              { name: "Lucía", job: "Tutora", rank: 90, img: "https://picsum.photos/seed/serv4/100/100" }
            ].map((p, i) => (
              <div key={i} className="flex flex-col items-center gap-2 min-w-[100px] group cursor-pointer">
                <div className="relative">
                   <img src={p.img} className="size-20 rounded-2xl object-cover shadow-sm group-hover:scale-105 transition-transform" alt={p.name} />
                   <div className="absolute -bottom-1 -right-1 bg-primary border-2 border-white rounded-full p-0.5">
                     <span className="material-symbols-outlined text-[12px] text-white filled">verified</span>
                   </div>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-secondary">{p.name}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase">{p.job}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-base font-black mb-4">Profesionales destacados</h3>
          <div className="space-y-4">
            {[
              { name: "Juan Perez", specialty: "Plomero Matriculado", score: 98, tasks: 24, img: "https://picsum.photos/seed/p1/120/120" },
              { name: "Maria Garcia", specialty: "Electricista", score: 95, tasks: 18, img: "https://picsum.photos/seed/p2/120/120" }
            ].map((p, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex gap-4">
                  <img src={p.img} className="size-20 rounded-xl object-cover" alt={p.name} />
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <h4 className="font-black text-secondary leading-tight">{p.name}</h4>
                        <div className="flex items-center gap-0.5 text-primary text-xs font-bold">
                          <span className="material-symbols-outlined text-xs filled">star</span>
                          {p.score}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 font-bold mt-0.5">{p.specialty}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] bg-gray-50 text-gray-500 font-bold px-2 py-1 rounded-lg border border-gray-100">
                        {p.tasks} contrataciones en el barrio
                      </span>
                    </div>
                  </div>
                </div>
                <button className="w-full mt-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-xl text-xs font-bold text-secondary flex items-center justify-center gap-2 transition-colors">
                  Ver perfil completo <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Services;
