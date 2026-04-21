
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import ResponsiveScreen from '../components/layouts/ResponsiveScreen';

const TournamentDetails: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isRegistered, setIsRegistered] = useState(false);
  const appUser = localStorage.getItem('app_user') ? JSON.parse(localStorage.getItem('app_user') as string) : null;
  const isAdmin = String(appUser?.rol || '').trim().toLowerCase() === 'admin';

  const tournament = location.state?.tournament || {
    id: 1,
    title: "Abierto de Tenis TuBarrio",
    subtitle: "Singles Damas y Caballeros",
    date: "Mayo a Julio"
  };

  useEffect(() => {
    const checkRegistration = async () => {
      const { data: authData } = await (supabase as any).auth.getUser();
      const authUserId = authData?.user?.id;

      // Chequeo rápido en localStorage
      const userStr = localStorage.getItem('app_user');
      const user = userStr ? JSON.parse(userStr) : null;
      const cacheKey = `registered_tournaments_${String(authUserId || user?.id || 'anon')}`;
      const savedScoped = localStorage.getItem(cacheKey);
      const savedLegacy = localStorage.getItem('registered_tournaments');
      const localIds: number[] = Array.from(
        new Set([
          ...(savedScoped ? JSON.parse(savedScoped) : []),
          ...(savedLegacy ? JSON.parse(savedLegacy) : []),
        ]),
      );
      if (localIds.includes(Number(tournament.id))) {
        setIsRegistered(true);
        return;
      }

      // Si no está en local, verificar en Supabase
      const perfilId = authUserId || user?.id;
      if (!perfilId) return;
      try {
        const { data, error } = await supabase
          .from('torneo_jugadores')
          .select('torneo_id')
          .eq('perfil_id', perfilId)
          .eq('torneo_id', Number(tournament.id))
          .maybeSingle();
        if (!error && data) {
          setIsRegistered(true);
          // Sincronizar localStorage
          const merged = Array.from(new Set([...localIds, Number(tournament.id)]));
          localStorage.setItem(cacheKey, JSON.stringify(merged));
          localStorage.setItem('registered_tournaments', JSON.stringify(merged));
        }
      } catch (_) {}
    };
    checkRegistration();
  }, [tournament.id]);

  const header = (
    <div className="sticky top-0 z-30 flex items-center justify-between bg-background-light/95 p-4 pb-2 backdrop-blur-md transition-colors duration-200 md:px-8">
      <button
        onClick={() => navigate(-1)}
        className="group flex size-10 items-center justify-center rounded-full text-gray-900 transition-colors hover:bg-gray-200"
      >
        <span className="material-symbols-outlined transition-transform group-hover:-translate-x-0.5">arrow_back</span>
      </button>
      <h2 className="flex-1 pr-10 text-center text-lg font-bold leading-tight tracking-tight">Detalles del Torneo</h2>
    </div>
  );

  const main = (
    <div className="w-full px-4 sm:px-5 md:px-8">
      <div className="py-3">
        <div className="relative flex min-h-[280px] flex-col justify-end overflow-hidden rounded-xl bg-gray-200 shadow-sm">
            <div 
              className="absolute inset-0 z-0 bg-cover bg-center transition-transform duration-700 hover:scale-105" 
              role="img" 
              style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuAVx1WQP7vZEiH8vKxHErY6qX5YFqmrDQUB9rEk_ll74Py9T8DIc2L8ycxTgz4bU4Nbw_zOIQpN_Xslyr0DjQPLL8AbtD1E8qHGdoaleJsH06qvESuPUyjZ36C6Xfdexr91gskv9GQ-vu1ETAdJ_Y0Q-6ZO-QFdbyliEsQY0fp6Ovrk3-5GZNgiNn82ZwmQTDpkMNign_zqT57NAxEMIOf9w_uCCGYx5yPsSBs0FNN6mZJQuWz_7InHrmdy4Gb3DR_t0ZTobexNG9E")' }}
            ></div>
            <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
            <div className="relative z-20 flex flex-col p-5 gap-2">
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[#6dec13] px-2.5 py-0.5 text-xs font-bold text-black uppercase tracking-wider">
                INSCRIPCIONES ABIERTAS
              </span>
              <h1 className="text-white tracking-tight text-3xl font-bold leading-tight drop-shadow-sm">
                {tournament.title}
              </h1>
              <div className="flex items-center gap-2 text-gray-200 text-sm">
                <span className="material-symbols-outlined text-[18px]">group</span>
                <span>{tournament.subtitle || "Singles Damas y Caballeros"}</span>
              </div>
            </div>
          </div>
        </div>

      <div className="grid grid-cols-[40px_1fr] gap-x-2 px-5 mt-2">
        <div className="flex flex-col items-center gap-1 pt-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm border border-gray-100 text-[#6dec13]">
            <span className="material-symbols-outlined">calendar_today</span>
          </div>
          <div className="w-[2px] bg-gray-200 h-full grow rounded-full"></div>
        </div>
        <div className="flex flex-1 flex-col py-2 pb-6">
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wide">FECHAS DEL TORNEO</p>
          <p className="text-gray-900 text-lg font-medium leading-normal">Mayo a Julio</p>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="w-[2px] bg-gray-200 h-6 rounded-full"></div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm border border-gray-100 text-[#6dec13]">
            <span className="material-symbols-outlined">location_on</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col py-2">
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wide">UBICACIÓN</p>
          <p className="text-gray-900 text-lg font-medium leading-normal">Canchas del Barrio El Canton</p>
          <div className="mt-3 h-24 w-full overflow-hidden rounded-xl relative border border-gray-200">
            <div 
              className="absolute inset-0 bg-cover bg-center opacity-80" 
              style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuBZFkqBmThhKQvkFpbT4fetiHM-5Qwb1EB49RzxQMvybIvdYS0-_rV_YwFhARurSeiEAyaiyb8CEZYChh8S1sMwDq73wrqUEZw0IpTJdJeUjgnKygNggWdxujsI92y0Rw-KXIV9aw7H-t5cwPlGYmpB29c1apBELhOwLOEOTos3uSczGbjazrRVXg9DHZzby-STciMc403zow0oXWSLOmalfjEqulvdscR-_X9rO2xyOQIqKpe9RVexjMcoef7MWNOvC9pEnweOuro")' }}
            ></div>
            <a
              href="https://maps.app.goo.gl/W5j2pF2XkeEyLCqq5"
              target="_blank"
              rel="noreferrer"
              className="absolute inset-0 bg-black/10 flex items-center justify-center cursor-pointer"
            >
              <span className="bg-white/90 px-3 py-1 rounded-full text-xs font-bold shadow-sm backdrop-blur-sm">Ver en el Mapa</span>
            </a>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 px-5 py-6">
        <div className="flex min-w-[140px] flex-1 flex-col gap-1 rounded-2xl p-5 bg-white border border-gray-100 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 size-20 rounded-full bg-[#6dec13]/10 group-hover:bg-[#6dec13]/20 transition-colors"></div>
          <div className="relative z-10 flex items-center gap-2 text-gray-500 mb-1">
            <span className="material-symbols-outlined text-[20px]">payments</span>
            <span className="text-sm font-medium">Inscripción</span>
          </div>
          <p className="relative z-10 text-gray-900 text-3xl font-bold leading-tight">$50.000</p>
        </div>
        <div className="flex min-w-[140px] flex-1 flex-col gap-1 rounded-2xl p-5 bg-white border border-gray-100 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 size-20 rounded-full bg-[#6dec13]/10 group-hover:bg-[#6dec13]/20 transition-colors"></div>
          <div className="relative z-10 flex items-center gap-2 text-gray-500 mb-1">
            <span className="material-symbols-outlined text-[20px]">emoji_events</span>
            <span className="text-sm font-medium">Premios</span>
          </div>
          <p className="relative z-10 text-gray-900 text-lg font-bold leading-snug">Premios para los mejores</p>
        </div>
      </div>

      <div className="px-5 pb-8">
        <h3 className="text-lg font-bold leading-tight text-gray-900 mb-4 flex items-center gap-2">
          Requisitos
          <span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">OBLIGATORIO</span>
        </h3>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-4 rounded-xl bg-white p-4 border border-gray-100">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6dec13]/20 text-green-700">
              <span className="material-symbols-outlined">verified_user</span>
            </div>
            <div className="flex flex-col">
              <p className="text-sm font-bold text-gray-900">Pertenecer al Barrio El Canton</p>
              <p className="text-xs text-gray-500">Es el único requisito obligatorio para participar.</p>
            </div>
            <div className="ml-auto">
              <span className="material-symbols-outlined text-green-500 text-[20px] filled">check_circle</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const footer = (
    <>
        {isRegistered ? (
          <div className="flex flex-col gap-3 md:w-[420px]">
            <div className="w-full flex items-center justify-center gap-3 bg-primary/10 border-2 border-primary/30 rounded-xl py-4 px-5">
              <span className="material-symbols-outlined text-primary text-[24px] font-black">check_circle</span>
              <div className="flex flex-col">
                <span className="text-secondary font-black text-base leading-tight">¡Ya estás inscripto!</span>
                <span className="text-slate-500 text-xs font-bold">Tu lugar está reservado en este torneo</span>
              </div>
            </div>
            <button
              onClick={() => navigate('/tournament-panel', { state: { tournament } })}
              className="w-full bg-secondary hover:bg-secondary/90 active:scale-[0.98] transition-all text-white font-black text-lg h-14 rounded-xl shadow-lg flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined font-black">sports_tennis</span>
              <span>Ir a mi Panel</span>
            </button>
          </div>
        ) : isAdmin ? (
          <div className="flex flex-col gap-3 md:w-[420px]">
            <div className="w-full flex items-center justify-center gap-3 bg-slate-100 border border-slate-200 rounded-xl py-4 px-5">
              <span className="material-symbols-outlined text-slate-700 text-[24px] font-black">admin_panel_settings</span>
              <div className="flex flex-col">
                <span className="text-slate-900 font-black text-base leading-tight">Modo administrador</span>
                <span className="text-slate-500 text-xs font-bold">Podés gestionar sorteo e inicio aunque no estés inscripto</span>
              </div>
            </div>
            <button
              onClick={() => navigate('/tournament-panel', { state: { tournament } })}
              className="w-full bg-slate-900 hover:bg-slate-800 active:scale-[0.98] transition-all text-white font-black text-lg h-14 rounded-xl shadow-lg flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined font-black">tune</span>
              <span>Administrar Torneo</span>
            </button>
            <button
              onClick={() => navigate('/payment', { state: { tournament } })}
              className="w-full bg-primary hover:bg-[#5cd60f] active:scale-[0.98] transition-all text-black font-bold text-lg h-14 rounded-xl shadow-lg shadow-primary/25 flex items-center justify-center gap-2"
            >
              <span>Inscribirme al Torneo</span>
              <span className="material-symbols-outlined font-black">arrow_forward</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate('/payment', { state: { tournament } })}
            className="w-full md:w-[420px] bg-primary hover:bg-[#5cd60f] active:scale-[0.98] transition-all text-black font-bold text-lg h-14 rounded-xl shadow-lg shadow-primary/25 flex items-center justify-center gap-2"
          >
            <span>Inscribirme al Torneo</span>
            <span className="material-symbols-outlined font-black">arrow_forward</span>
          </button>
        )}
    </>
  );

  return (
    <ResponsiveScreen
      header={header}
      main={main}
      footer={footer}
      contentClassName="pb-28"
      footerContainerClassName="md:flex md:justify-end"
    />
  );
};

export default TournamentDetails;
