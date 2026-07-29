import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import Logo from '../../components/Logo';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useGolfNextRound } from '../../hooks/useGolfNextRound';
import { Skeleton } from '../../components/Skeleton';

const sanitizeImage = (url?: string): string => {
  if (!url || url.startsWith('http')) return '/images/tournament-default.jpg';
  return url;
};

const GolfPanel: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { perfil } = useCurrentUser();

  const savedTournament = localStorage.getItem('active_tournament_golf');
  const rawTournament = location.state?.tournament || (savedTournament ? JSON.parse(savedTournament) : null);
  const tournament = rawTournament ? { ...rawTournament, image: sanitizeImage(rawTournament?.image) } : null;

  const [creadoPor, setCreadoPor] = useState<string | null>(null);
  const [estadoTorneo, setEstadoTorneo] = useState<string>('RECRUITING');
  const [loadingEstado, setLoadingEstado] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const { loading: loadingRound, round } = useGolfNextRound(tournament?.id ?? '', Boolean(tournament?.id));

  useEffect(() => {
    if (tournament) localStorage.setItem('active_tournament_golf', JSON.stringify(tournament));
  }, [tournament]);

  useEffect(() => {
    if (!tournament?.id) return;
    let cancelled = false;
    (async () => {
      setLoadingEstado(true);
      const [{ data: torneoRow }, { data: estadoRows }] = await Promise.all([
        supabase.from('torneos').select('creado_por').eq('id', tournament.id).maybeSingle(),
        supabase.from('torneo_estado').select('estado').eq('torneo_id', tournament.id).limit(1),
      ]);
      if (cancelled) return;
      setCreadoPor((torneoRow as any)?.creado_por ?? null);
      setEstadoTorneo(String(estadoRows?.[0]?.estado ?? 'RECRUITING'));
      setLoadingEstado(false);
    })();
    return () => { cancelled = true; };
  }, [tournament?.id]);

  const canManage = !!perfil && (perfil.rol === 'admin' || (perfil.rol === 'organizador' && creadoPor === perfil.id));

  const goTo = (path: string) => navigate(path, { state: { tournament } });

  const handleIniciar = async () => {
    if (!tournament?.id) return;
    setActionBusy(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const { error } = await supabase.rpc('iniciar_torneo_golf', { p_torneo_id: tournament.id });
      if (error) throw error;
      setEstadoTorneo('EN_CURSO');
      setActionMessage('Torneo iniciado.');
    } catch (err: any) {
      setActionError(err?.message || 'No se pudo iniciar el torneo.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleFinalizar = async () => {
    if (!tournament?.id) return;
    if (!window.confirm('¿Finalizar el torneo? Se define el campeon segun el leaderboard actual.')) return;
    setActionBusy(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const { error } = await supabase.rpc('finalizar_torneo_golf', { p_torneo_id: tournament.id });
      if (error) throw error;
      setEstadoTorneo('FINALIZADO');
      setActionMessage('Torneo finalizado.');
    } catch (err: any) {
      setActionError(err?.message || 'No se pudo finalizar el torneo.');
    } finally {
      setActionBusy(false);
    }
  };

  if (!tournament) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background-light p-6 text-center">
        <span className="material-symbols-outlined text-5xl text-slate-300 mb-3">golf_course</span>
        <p className="text-slate-500 font-medium">No encontramos el torneo de golf seleccionado.</p>
        <button onClick={() => navigate('/tournaments')} className="mt-4 text-[#4a9c40] font-bold">Volver a Torneos</button>
      </div>
    );
  }

  return (
    <div className="bg-background-light min-h-screen font-display pb-24 max-w-md mx-auto">
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/tournaments')} className="text-slate-500 hover:text-slate-800 p-1 rounded-full hover:bg-slate-100">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="flex-1 flex justify-center">
          <Logo variant="tournament" className="h-[90px] w-auto" />
        </div>
        <div className="w-8" />
      </div>

      <div className="p-4 space-y-5">
        <div className="rounded-2xl overflow-hidden bg-white border border-slate-100 shadow-sm">
          <div className="h-32 w-full bg-cover bg-center" style={{ backgroundImage: `url("${tournament.image}")` }} />
          <div className="p-4">
            <h1 className="text-xl font-bold text-[#111813]">{tournament.title}</h1>
            {tournament.subtitle && <p className="text-sm text-slate-500 mt-0.5">{tournament.subtitle}</p>}
            {!loadingEstado && (
              <span className="inline-block mt-2 text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-[#4a9c40]/10 text-[#4a9c40]">
                {estadoTorneo.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        </div>

        {/* Flight asignado */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <h2 className="text-sm font-bold uppercase text-slate-500 mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#4a9c40]">golf_course</span>
            Tu Flight
          </h2>
          {loadingRound ? (
            <Skeleton className="h-16 w-full" />
          ) : !round ? (
            <p className="text-sm text-slate-500">Todavia no fuiste sorteado en ningun flight de este torneo.</p>
          ) : (
            <div>
              <p className="font-bold text-[#111813]">Ronda {round.numeroRonda}{round.flightNumero != null ? ` · Flight ${round.flightNumero}` : ''}</p>
              <p className="text-sm text-slate-500 mb-3">{round.canchaNombre || 'Cancha a confirmar'} · Coordiná el horario de salida con tus compañeros.</p>
              {round.companeros.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase">Companeros de flight</p>
                  {round.companeros.map((c) => (
                    <div key={c.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                      <span className="text-sm font-medium text-slate-800">{c.nombre_completo}</span>
                      {c.whatsappLink && (
                        <a href={c.whatsappLink} target="_blank" rel="noreferrer" className="text-[#4a9c40]">
                          <span className="material-symbols-outlined text-[20px]">chat</span>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Accesos */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => goTo('/golf/scorecard')} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-col items-center gap-2 active:scale-[0.98] transition">
            <span className="material-symbols-outlined text-[#4a9c40] text-2xl">edit_note</span>
            <span className="text-sm font-bold text-slate-800">Scorecard</span>
          </button>
          <button onClick={() => goTo('/golf/leaderboard')} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-col items-center gap-2 active:scale-[0.98] transition">
            <span className="material-symbols-outlined text-[#4a9c40] text-2xl">leaderboard</span>
            <span className="text-sm font-bold text-slate-800">Leaderboard</span>
          </button>
          <button onClick={() => goTo('/golf/hoyo')} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-col items-center gap-2 active:scale-[0.98] transition">
            <span className="material-symbols-outlined text-[#4a9c40] text-2xl">flag</span>
            <span className="text-sm font-bold text-slate-800">Info del Hoyo</span>
          </button>
          <button onClick={() => goTo('/golf/rules')} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-col items-center gap-2 active:scale-[0.98] transition">
            <span className="material-symbols-outlined text-[#4a9c40] text-2xl">gavel</span>
            <span className="text-sm font-bold text-slate-800">Reglamento</span>
          </button>
        </div>

        {/* Panel del organizador */}
        {canManage && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
            <h2 className="text-sm font-bold uppercase text-slate-500">Organizador</h2>
            {actionMessage && <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-2">{actionMessage}</div>}
            {actionError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{actionError}</div>}
            <button onClick={() => goTo('/golf/flights')} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-xl transition">
              Sortear Flights
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button disabled={actionBusy} onClick={handleIniciar} className="bg-[#4a9c40] hover:bg-[#3d8b33] disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition">
                Iniciar Torneo
              </button>
              <button disabled={actionBusy} onClick={handleFinalizar} className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition">
                Finalizar Torneo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GolfPanel;
