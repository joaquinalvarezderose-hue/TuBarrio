
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

const normalizeStatus = (status?: string) => String(status || 'RECRUITING').trim().toUpperCase();
const OPEN_SIGNUP_STATUSES = new Set(['RECRUITING', 'INSCRIPCION_ABIERTA']);
const PANEL_READY_STATUSES = new Set([
  'INSCRIPCION_CERRADA',
  'ARMADO_FIXTURE',
  'ACTIVO',
  'EN_CURSO',
  'LOCKED',
  'PLAYOFFS',
  'FINALIZADO',
]);
const STATUS_PRIORITY: Record<string, number> = {
  FINALIZADO: 90,
  PLAYOFFS: 80,
  EN_CURSO: 70,
  ACTIVO: 65,
  ARMADO_FIXTURE: 60,
  INSCRIPCION_CERRADA: 55,
  LOCKED: 50,
  RECRUITING: 10,
  INSCRIPCION_ABIERTA: 10,
};

const getStatusPriority = (status?: string) => STATUS_PRIORITY[normalizeStatus(status)] ?? 0;

const isTournamentOpenForSignup = (status?: string) => OPEN_SIGNUP_STATUSES.has(normalizeStatus(status));
const isTournamentReadyForPanel = (status?: string) => PANEL_READY_STATUSES.has(normalizeStatus(status));

type Torneo = {
  id: number;
  titulo: string;
  subtitulo: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  imagen_url: string | null;
  activo: boolean;
};

const formatearFecha = (inicio: string | null, fin: string | null): string => {
  if (!inicio) return 'Fecha a confirmar';
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  return fin ? `${fmt(inicio)} - ${fmt(fin)}` : `Desde ${fmt(inicio)}`;
};

const Tournaments: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<'hub' | 'available' | 'my'>('hub');

  const userStr = localStorage.getItem('app_user');
  const user = userStr ? JSON.parse(userStr) : { name: 'Usuario' };

  const [registeredIds, setRegisteredIds] = useState<number[]>([]);
  const [statusByTournamentId, setStatusByTournamentId] = useState<Record<number, string>>({});
  const [capacityByTournamentId, setCapacityByTournamentId] = useState<Record<number, { current: number; max: number }>>({});
  const [torneos, setTorneos] = useState<Torneo[]>([]);
  const [cargandoTorneos, setCargandoTorneos] = useState(true);

  useEffect(() => {
    const loadRegistrations = async () => {
      const { data: authData } = await (supabase as any).auth.getUser();
      const authUserId = authData?.user?.id || user?.id;
      const userId = String(authUserId || 'anon');
      const cacheKey = `registered_tournaments_${userId}`;
      const saved = localStorage.getItem(cacheKey);
      const localIds: number[] = saved ? JSON.parse(saved) : [];
      try {
        if (!authUserId) {
          setRegisteredIds(localIds);
          return;
        }

        const [{ data: jugadoresData, error: jugadoresError }, { data: inscripcionesData, error: inscripcionesError }] = await Promise.all([
          supabase
            .from('torneo_jugadores')
            .select('torneo_id')
            .eq('perfil_id', authUserId),
          supabase
            .from('inscripciones_torneo')
            .select('torneo_id, estado')
            .eq('perfil_id', authUserId)
            .in('estado', ['pendiente_revision', 'pagado_aprobado'])
        ]);

        if (jugadoresError) throw jugadoresError;
        if (inscripcionesError) throw inscripcionesError;

        const jugadorIds = (jugadoresData || [])
          .map((row: any) => Number(row.torneo_id || 0))
          .filter((id: number) => id > 0);

        const inscripcionIds = (inscripcionesData || [])
          .map((row: any) => Number(row.torneo_id || 0))
          .filter((id: number) => id > 0);

        const remoteIds = Array.from(new Set([...jugadorIds, ...inscripcionIds]));

        setRegisteredIds(remoteIds);
        localStorage.setItem(cacheKey, JSON.stringify(remoteIds));
      } catch (err) {
        console.error('Error cargando inscripciones desde Supabase', err);
        setRegisteredIds(localIds);
      }
    };
    loadRegistrations();
  }, []);

  useEffect(() => {
    const loadTournamentLifecycle = async () => {
      try {
        const { data, error } = await supabase
          .from('torneo_estado')
          .select('torneo_id, estado, current_participantes, max_participantes');

        if (error) throw error;

        const nextStatus: Record<number, string> = {};
        const nextStatusPriority: Record<number, number> = {};
        const nextCapacity: Record<number, { current: number; max: number }> = {};

        (data || []).forEach((row: any) => {
          const id = Number(row.torneo_id);
          const normalized = normalizeStatus(row.estado);
          const priority = getStatusPriority(normalized);

          if ((nextStatusPriority[id] ?? -1) <= priority) {
            nextStatus[id] = normalized;
            nextStatusPriority[id] = priority;
            nextCapacity[id] = {
              current: Number(row.current_participantes || 0),
              max: Number(row.max_participantes || 0),
            };
          }
        });

        setStatusByTournamentId(nextStatus);
        setCapacityByTournamentId(nextCapacity);
      } catch (err) {
        console.error('No se pudo cargar el estado de torneos desde Supabase', err);
      }
    };

    loadTournamentLifecycle();
  }, []);

  useEffect(() => {
    const cargarTorneos = async () => {
      setCargandoTorneos(true);
      try {
        const { data, error } = await supabase
          .from('torneos')
          .select('id, titulo, subtitulo, fecha_inicio, fecha_fin, imagen_url, activo')
          .eq('activo', true)
          .order('id', { ascending: true });
        if (error) throw error;
        setTorneos((data || []) as Torneo[]);
      } catch (err) {
        console.error('No se pudo cargar la lista de torneos', err);
      } finally {
        setCargandoTorneos(false);
      }
    };
    cargarTorneos();
  }, []);

  // Convierte una fila de DB al objeto que esperan las sub-pantallas del torneo
  const toNavTorneo = (t: Torneo) => ({
    id: t.id,
    title: t.titulo,
    subtitle: t.subtitulo,
    image: t.imagen_url || '',
    date: formatearFecha(t.fecha_inicio, t.fecha_fin),
  });

  const myRegisteredTournaments = torneos.filter(t => registeredIds.includes(t.id));
  const availableTournaments = torneos.filter((t) => {
    if (registeredIds.includes(t.id)) return false;
    const status = statusByTournamentId[t.id];
    if (!status) return true;
    return isTournamentOpenForSignup(status);
  });

  const goToTournamentDetails = (t: Torneo) => {
    navigate('/tournament-details', { state: { tournament: toNavTorneo(t) } });
  };

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

          {availableTournaments.length === 0 && (
            <div className="px-4 md:px-8 pb-4">
              <div className="rounded-xl bg-white dark:bg-[#1a2e1f] p-4 border border-gray-100 dark:border-gray-800 text-sm text-gray-600 dark:text-gray-300">
                No hay torneos en estado de inscripcion abierta en este momento.
              </div>
            </div>
          )}

          {cargandoTorneos && (
            <div className="px-4 md:px-8 py-12 text-center">
              <span className="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600">sync</span>
              <p className="text-sm text-gray-400 mt-2">Cargando torneos...</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4 md:p-8 pt-0">
            {availableTournaments.map((tournament) => (
              <div 
                key={tournament.id}
                className="flex flex-col rounded-xl bg-white dark:bg-[#1a2e1f] shadow-[0_2px_8px_rgba(0,0,0,0.08)] overflow-hidden transition-all hover:scale-[1.01] hover:shadow-lg group"
              >
                <div className="relative h-48 w-full bg-gray-100 dark:bg-gray-700">
                  <div 
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-500 group-hover:scale-105" 
                    style={{ backgroundImage: `url("${tournament.imagen_url || ''}")` }}
                  ></div>
                  <div className="absolute top-3 right-3 bg-white/90 dark:bg-black/80 backdrop-blur-sm px-3 py-1 rounded-full border border-gray-100 dark:border-gray-800">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#111813] dark:text-white">Inscripción Abierta</p>
                  </div>
                </div>
                <div className="p-5 flex flex-col gap-3 flex-1">
                  <div className="flex flex-col gap-1">
                    <p className="text-[#111813] dark:text-white text-xl font-bold leading-tight">{tournament.titulo}</p>
                    <div className="flex items-center gap-2 text-secondary-text dark:text-gray-400 text-sm">
                      <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                      <span>
                        {formatearFecha(tournament.fecha_inicio, tournament.fecha_fin)} • {
                          capacityByTournamentId[tournament.id]
                            ? `${capacityByTournamentId[tournament.id].current}/${capacityByTournamentId[tournament.id].max} Inscriptos`
                            : 'Cupo disponible'
                        }
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-auto pt-4">
                    <span className="text-xs font-semibold text-[#4a9c40] bg-[#4a9c40]/10 px-3 py-1 rounded-full">
                      {tournament.subtitulo}
                    </span>
                    <button 
                      onClick={() => goToTournamentDetails(tournament)}
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
              {myRegisteredTournaments.map((t) => {
                const status = statusByTournamentId[t.id] || 'RECRUITING';
                const isReady = isTournamentReadyForPanel(status);
                const hasLifecycleInfo = Boolean(statusByTournamentId[t.id]);
                const canOpenPanel = isReady || !hasLifecycleInfo;

                return (
                <div 
                  key={t.id} 
                  onClick={() => {
                    if (canOpenPanel) {
                      navigate('/tournament-panel', { state: { tournament: toNavTorneo(t) } });
                    }
                  }}
                  className={`bg-white dark:bg-[#1a2e1f] rounded-3xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex items-center gap-4 transition-all group ${canOpenPanel ? 'hover:scale-[1.01] hover:shadow-md cursor-pointer' : 'opacity-75 cursor-not-allowed'}`}
                >
                  <img src={t.imagen_url || ''} className="size-24 rounded-2xl object-cover" alt={t.titulo} />
                  <div className="flex-1">
                    <h4 className="font-bold text-lg text-[#111813] dark:text-white leading-tight mb-2">{t.titulo}</h4>
                    <p className="text-xs text-gray-400">{formatearFecha(t.fecha_inicio, t.fecha_fin)}</p>
                    <span className={`text-xs font-bold mt-1 inline-block ${canOpenPanel ? 'text-primary' : 'text-amber-600 dark:text-amber-300'}`}>
                      {canOpenPanel ? 'Ver Panel' : 'Torneo en preparación'}
                    </span>
                  </div>
                  <span className="material-symbols-outlined text-gray-400 group-hover:text-primary transition-colors">chevron_right</span>
                </div>
                );
              })}
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
