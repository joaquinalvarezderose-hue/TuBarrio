
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Fixture: React.FC = () => {
  const navigate = useNavigate();
  const [category, setCategory] = useState<'Segunda' | 'Intermedia'>('Segunda');
  const [activeFecha, setActiveFecha] = useState(1);

  const fechas = [1, 2, 3, 4, 5];

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto bg-white dark:bg-background-dark font-display text-[#111813] dark:text-white transition-colors duration-200 pb-24">
      {/* Header Section */}
      <div className="sticky top-0 z-20 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-[#dbe6de] dark:border-[#2a3c2e]">
        <div className="flex items-center p-4 pb-2 justify-between">
          <button 
            onClick={() => navigate(-1)}
            className="text-[#111813] dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-background-light dark:hover:bg-white/10 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back_ios_new</span>
          </button>
          <h1 className="text-[#111813] dark:text-white text-xl font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-10">Fixture y Calendario</h1>
        </div>

        {/* Category Selector */}
        <div className="flex px-4 py-3">
          <div className="flex h-11 flex-1 items-center justify-center rounded-xl bg-background-light dark:bg-[#1a2e1f] p-1.5 shadow-inner">
            {(['Segunda', 'Intermedia'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-semibold transition-all ${
                  category === cat 
                    ? 'bg-white dark:bg-[#2e4a35] shadow-sm text-[#111813] dark:text-primary' 
                    : 'text-[#61896b]'
                }`}
              >
                <span className="truncate">{cat}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Date/Round Horizontal Scroll */}
        <div className="overflow-x-auto no-scrollbar">
          <div className="flex px-4 gap-6 min-w-max">
            {fechas.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFecha(f)}
                className={`flex flex-col items-center justify-center border-b-[3px] pb-3 pt-4 transition-all ${
                  activeFecha === f 
                    ? 'border-primary text-[#111813] dark:text-white' 
                    : 'border-transparent text-[#61896b]'
                }`}
              >
                <p className={`text-sm tracking-wide ${activeFecha === f ? 'font-bold' : 'font-semibold'}`}>FECHA {f}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark pb-8 no-scrollbar">
        <div className="px-4 py-4">
          <h3 className="text-[#111813] dark:text-white text-base font-bold uppercase tracking-wider mb-3">Sábado 14 de Octubre</h3>
          <div className="flex flex-col gap-4">
            {/* Match Card 1 (Scheduled) */}
            <div className="flex flex-col gap-4 rounded-xl bg-white dark:bg-[#1a2e1f] p-4 shadow-sm border border-[#dbe6de] dark:border-[#2a3c2e] hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-3 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[#111813] dark:text-white font-bold text-lg">G. Coria</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#111813] dark:text-white font-bold text-lg">D. Nalbandian</span>
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[#4a9c40]" title="Provee las pelotas">
                      <span className="text-[10px] font-black italic">P</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="bg-primary/10 text-[#4a9c40] text-[10px] font-bold px-2 py-0.5 rounded-full">PROGRAMADO</span>
                  <div className="flex items-center gap-1 text-[#61896b] text-sm font-medium">
                    <span className="material-symbols-outlined text-sm">schedule</span>
                    <span>14:00</span>
                  </div>
                  <div className="flex items-center gap-1 text-[#61896b] text-xs">
                    <span className="material-symbols-outlined text-sm">sports_tennis</span>
                    <span>Cancha 3</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 h-10 rounded-lg bg-background-light dark:bg-[#2e4a35] text-[#111813] dark:text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform">
                  <span className="material-symbols-outlined text-lg">info</span>
                  Ver Detalle
                </button>
                <button className="w-12 h-10 rounded-lg bg-[#4a9c40] text-white flex items-center justify-center active:scale-95 transition-transform shadow-sm">
                  <span className="material-symbols-outlined font-bold">location_on</span>
                </button>
              </div>
            </div>

            {/* Match Card 2 (Completed) */}
            <div className="flex flex-col gap-4 rounded-xl bg-white dark:bg-[#1a2e1f] p-4 shadow-sm border border-[#dbe6de] dark:border-[#2a3c2e] opacity-90">
              <div className="flex justify-between items-center">
                <div className="flex flex-col gap-3 flex-1">
                  <div className="flex items-center justify-between pr-4">
                    <span className="text-[#111813] dark:text-white font-bold text-lg">J.M. Del Potro</span>
                    <div className="flex gap-2 font-black text-[#4a9c40]">
                      <span>6</span>
                      <span>6</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[#61896b] font-medium text-lg">G. Gaudio</span>
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[#4a9c40]">
                        <span className="text-[10px] font-black italic">P</span>
                      </div>
                    </div>
                    <div className="flex gap-2 font-bold text-[#61896b]">
                      <span>4</span>
                      <span>2</span>
                    </div>
                  </div>
                </div>
                <div className="border-l border-[#dbe6de] dark:border-[#2a3c2e] pl-4 flex flex-col items-center">
                  <span className="text-[#61896b] text-[10px] font-bold uppercase mb-1">Final</span>
                  <div className="size-8 rounded-full bg-[#f0f4f1] dark:bg-[#2e4a35] flex items-center justify-center text-[#4a9c40]">
                    <span className="material-symbols-outlined">check_circle</span>
                  </div>
                </div>
              </div>
              <div className="h-[1px] bg-[#dbe6de] dark:bg-[#2a3c2e]"></div>
              <div className="flex justify-between items-center text-[#61896b] text-xs font-medium">
                <p>Jugado en Cancha Central</p>
                <p>12 Oct 2023</p>
              </div>
            </div>
          </div>

          <h3 className="text-[#111813] dark:text-white text-base font-bold uppercase tracking-wider mb-3 mt-8">Domingo 15 de Octubre</h3>
          <div className="flex flex-col gap-4">
            {/* Match Card 3 (Scheduled) */}
            <div className="flex flex-col gap-4 rounded-xl bg-white dark:bg-[#1a2e1f] p-4 shadow-sm border border-[#dbe6de] dark:border-[#2a3c2e] hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-3 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[#111813] dark:text-white font-bold text-lg">M. Vilas</span>
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[#4a9c40]">
                      <span className="text-[10px] font-black italic">P</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#111813] dark:text-white font-bold text-lg">G. Vilas</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="bg-primary/10 text-[#4a9c40] text-[10px] font-bold px-2 py-0.5 rounded-full">PRÓXIMO</span>
                  <div className="flex items-center gap-1 text-[#61896b] text-sm font-medium">
                    <span className="material-symbols-outlined text-sm">schedule</span>
                    <span>10:30</span>
                  </div>
                  <div className="flex items-center gap-1 text-[#61896b] text-xs">
                    <span className="material-symbols-outlined text-sm">sports_tennis</span>
                    <span>Cancha 1</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 h-10 rounded-lg bg-background-light dark:bg-[#2e4a35] text-[#111813] dark:text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform">
                  <span className="material-symbols-outlined text-lg">info</span>
                  Ver Detalle
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Empty/Upcoming State Section */}
        <div className="p-8 mt-4 flex flex-col items-center text-center">
          <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center text-[#4a9c40] mb-4">
            <span className="material-symbols-outlined text-4xl">event_available</span>
          </div>
          <h4 className="text-[#111813] dark:text-white font-bold mb-1">Más partidos pronto</h4>
          <p className="text-[#61896b] text-sm max-w-[240px]">El calendario para las siguientes fechas será publicado al finalizar la actual.</p>
        </div>
      </main>

      {/* Floating Action Button for Location (Quick Map) */}
      <div className="fixed bottom-6 right-6 z-30">
        <button className="size-14 rounded-full bg-[#4a9c40] text-white shadow-lg flex items-center justify-center active:scale-90 transition-transform">
          <span className="material-symbols-outlined text-3xl font-bold">map</span>
        </button>
      </div>
    </div>
  );
};

export default Fixture;