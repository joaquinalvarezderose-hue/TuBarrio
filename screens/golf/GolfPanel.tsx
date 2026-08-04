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

  const estadoLabel = (() => {
    switch (estadoTorneo) {
      case 'RECRUITING':
      case 'INSCRIPCION_ABIERTA':
        return 'En preparación';
      case 'EN_CURSO':
        return 'En curso';
      case 'FINALIZADO':
        return 'Finalizado';
      default:
        return 'En curso';
    }
  })();

  if (!tournament) {
    return (
      <div className="max-w-md mx-auto min-h-screen flex flex-col bg-background-light font-display">
        <header className="sticky top-0 z-50 bg-background-light/80 backdrop-blur-md px-4 py-4 flex items-center justify-between border-b border-gray-200">
          <button
            onClick={() => navigate('/tournaments')}
            className="flex items-center text-[#111813] hover:bg-black/5 p-1 rounded-full transition-colors"
          >
            <span className="material-symbols-outlined text-2xl">arrow_back_ios</span>
          </button>
          <Logo variant="tournament" className="h-[120px] w-auto" />
          <div className="w-8"></div>
        </header>
        <main className="flex-1 p-4 flex flex-col items-center justify-center text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 shadow-sm mb-3">
            <span className="material-symbols-outlined text-[#4a9c40] text-4xl">golf_course</span>
          </div>
          <p className="text-slate-500 font-medium">No encontramos el torneo de golf seleccionado.</p>
          <button onClick={() => navigate('/tournaments')} className="mt-4 text-[#4a9c40] font-bold">Volver a Torneos</button>
        </main>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col pb-24 bg-background-light transition-colors duration-300 font-display no-scrollbar overflow-y-auto">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background-light/80 backdrop-blur-md px-4 py-4 flex items-center justify-between border-b border-gray-200">
        <button
          onClick={() => navigate('/tournaments')}
          className="flex items-center text-[#111813] hover:bg-black/5 p-1 rounded-full transition-colors"
        >
          <span className="material-symbols-outlined text-2xl">arrow_back_ios</span>
        </button>
        <Logo variant="tournament" className="h-[120px] w-auto" />
        <div className="w-8"></div>
      </header>

      <main className="flex-1 p-4 space-y-6">
        {/* Tournament Highlight Card */}
        <section>
          <div className="relative overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100">
            <div
              className="w-full h-32 bg-cover bg-center"
              style={{ backgroundImage: `url("${tournament.image}")` }}
            ></div>
            <div className="p-5">
              <div className="flex flex-col gap-1">
                <span className="text-primary text-xs font-bold uppercase tracking-widest">{loadingEstado ? '...' : estadoLabel}</span>
                <h2 className="text-xl font-bold leading-tight text-[#111813]">{tournament.title}</h2>
                {tournament.subtitle && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="bg-primary/10 text-[#4a9c40] px-2 py-0.5 rounded text-xs font-semibold">{tournament.subtitle}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Flight asignado */}
        <section className="space-y-3">
          <h3 className="text-lg font-bold tracking-tight px-1 text-[#111813]">Tu Flight</h3>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            {loadingRound ? (
              <Skeleton className="h-16 w-full" />
            ) : !round ? (
              <p className="text-sm text-slate-500">Todavía no fuiste sorteado en ningún flight de este torneo.</p>
            ) : (
              <div>
                <p className="font-bold text-[#111813]">Ronda {round.numeroRonda}{round.flightNumero != null ? ` · Flight ${round.flightNumero}` : ''}</p>
                <p className="text-sm text-slate-500 mb-3">{round.canchaNombre || 'Cancha a confirmar'} · Coordiná el horario de salida con tus compañeros.</p>
                {round.companeros.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Compañeros de flight</p>
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
        </section>

        {/* Quick Action Grid 2x2 */}
        <section className="grid grid-cols-2 gap-4">
          <button
            onClick={() => goTo('/golf/scorecard')}
            className="flex flex-col items-center justify-center gap-3 p-6 bg-white rounded-xl shadow-sm border border-gray-100 active:scale-95 transition-transform group"
          >
            <div className="size-12 rounded-full flex items-center justify-center transition-colors shadow-md bg-[#4a9c40] text-white group-hover:bg-[#3d8b33]">
              <span className="material-symbols-outlined text-3xl">edit_note</span>
            </div>
            <span className="text-sm font-semibold text-center text-[#111813]">Scorecard</span>
          </button>

          <button
            onClick={() => goTo('/golf/tarjeta-completa')}
            className="flex flex-col items-center justify-center gap-3 p-6 bg-white rounded-xl shadow-sm border border-gray-100 active:scale-95 transition-transform group"
          >
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-[#4a9c40] group-hover:bg-primary/20 transition-colors">
              <span className="material-symbols-outlined text-3xl">table_chart</span>
            </div>
            <span className="text-sm font-semibold text-center text-[#111813]">Ver Tarjeta</span>
          </button>

          <button
            onClick={() => goTo('/golf/leaderboard')}
            className="flex flex-col items-center justify-center gap-3 p-6 bg-white rounded-xl shadow-sm border border-gray-100 active:scale-95 transition-transform group"
          >
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-[#4a9c40] group-hover:bg-primary/20 transition-colors">
              <span className="material-symbols-outlined text-3xl">emoji_events</span>
            </div>
            <span className="text-sm font-semibold text-center text-[#111813]">Tabla de Posiciones</span>
          </button>

          <button
            onClick={() => goTo('/golf/rules')}
            className="flex flex-col items-center justify-center gap-3 p-6 bg-white rounded-xl shadow-sm border border-gray-100 active:scale-95 transition-transform group"
          >
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-[#4a9c40] group-hover:bg-primary/20 transition-colors">
              <span className="material-symbols-outlined text-3xl">info</span>
            </div>
            <span className="text-sm font-semibold text-center text-[#111813]">Reglamento</span>
          </button>
        </section>

        {/* Panel del organizador */}
        {canManage && (
          <section className="space-y-3">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Admin</p>
                  <h3 className="text-base font-bold text-slate-900">Organizador</h3>
                </div>
                <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">Admin</span>
              </div>

              {actionMessage && <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-sm font-medium text-emerald-700">{actionMessage}</div>}
              {actionError && <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm font-medium text-red-700">{actionError}</div>}

              <button onClick={() => goTo('/golf/flights')} className="w-full rounded-lg bg-slate-900 text-white font-bold py-3 px-4 disabled:opacity-50 disabled:cursor-not-allowed">
                Sortear Flights
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button
                  disabled={actionBusy}
                  onClick={handleIniciar}
                  className="w-full rounded-lg bg-[#4a9c40] text-white font-bold py-3 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Iniciar Torneo
                </button>
                <button
                  disabled={actionBusy}
                  onClick={handleFinalizar}
                  className="w-full rounded-lg bg-indigo-700 text-white font-bold py-3 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Finalizar Torneo
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default GolfPanel;
