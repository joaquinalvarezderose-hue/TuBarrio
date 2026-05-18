
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
const TOURNAMENT_SEASON_LABEL = 'Mayo a Julio';

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

type TorneoHistorialItem = {
  torneo_id: number;
  titulo: string;
  subtitulo: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  partidos_jugados: number;
  sets_ganados: number;
  sets_perdidos: number;
  campeon_nombre: string | null;
  campeon_perfil_id: string | null;
  es_campeon: boolean;
};

const DEFAULT_TOURNAMENT_IMAGE = 'https://lh3.googleusercontent.com/aida-public/AB6AXuDIkCK9JuzOAYSvIEnZEzVW1-ZAVUeE8egZW2EpjfdMsZim28_IttidOyrb4lpXZ-Z4VavCZ7qY4IPZpesaLzgX3p2NRC_oHeYyyhHVSAh3ptTRqutybTxUSEScEU2OUi8rLmzApP2kELvfkgwVWxuwr6zp22cG6-SReuwbO_ycD8hLiHrtuX5YhGO0PnTj6BWMMHjQptD7EBJF1ckrVVWvvDCVYor5bi7B_ayvBHsBV07mbEFmeaHNkjX6_inckgOqIpQe_toVUJE';

const FALLBACK_TORNEOS: Torneo[] = [
  {
    id: 1,
    titulo: 'Caballeros Singles - 3ra Categoria',
    subtitulo: 'Singles Caballeros',
    fecha_inicio: '2026-03-10',
    fecha_fin: '2026-03-15',
    imagen_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDIkCK9JuzOAYSvIEnZEzVW1-ZAVUeE8egZW2EpjfdMsZim28_IttidOyrb4lpXZ-Z4VavCZ7qY4IPZpesaLzgX3p2NRC_oHeYyyhHVSAh3ptTRqutybTxUSEScEU2OUi8rLmzApP2kELvfkgwVWxuwr6zp22cG6-SReuwbO_ycD8hLiHrtuX5YhGO0PnTj6BWMMHjQptD7EBJF1ckrVVWvvDCVYor5bi7B_ayvBHsBV07mbEFmeaHNkjX6_inckgOqIpQe_toVUJE',
    activo: true,
  },
  {
    id: 2,
    titulo: 'Caballeros Singles - 2da Categoria',
    subtitulo: 'Singles Caballeros',
    fecha_inicio: '2026-03-12',
    fecha_fin: '2026-03-18',
    imagen_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCJdWlacuqkDcu2Q0AVWRtpMog2NYZKB_m6UbjJ9vAC_kOGuh3mbwI_BfJPc5hG9H6gqtvses85VMCYm4RTvxbYb6u7SC9pOoGFf3WcsoMUQNe785z1Z9ALzLdDpndsM0Y81awbpbqwZfJ218iwcyKvs3lpN8yYLn0KLwu_XvTME6ukU9OGSrJbMbx4VyVL0raJpjrrJJz0BXQwhVWHnrVZLJ3R6KHBmMZbtCrZfvYj9AD5b57emWAExThw4FcoUkLlUnWtV4b9gbw',
    activo: true,
  },
  {
    id: 3,
    titulo: 'Caballeros Singles - Intermedia',
    subtitulo: 'Singles Caballeros',
    fecha_inicio: '2026-03-20',
    fecha_fin: '2026-03-25',
    imagen_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBuAVvQAMpWs1A9RwmoapmwZFYSYckJHuLnfshuYRf6nvdqffLuXkcMR81eVmc0q1dFQmvZIZ5J374TuBT7jPOc_F4CubG2eUlnWfwdL2rq3p5mpkSHKJxyjfWsXWQJ5OFnKEh3bD9ClhfY9c9iVENVc5kwGn0FoBuDU99Ep6wEDCKsBDlsCpyzr035p9WEN5KHl-25VBGQ7jirkd7xecbOFfw4WFisYaNRwRdYpqrPUFNV9dxcf8a0WbXGjADZx3z4zpwTHO-6dZA',
    activo: true,
  },
  {
    id: 4,
    titulo: 'Mujeres Singles - Categoria Libre',
    subtitulo: 'Singles Damas',
    fecha_inicio: '2026-04-08',
    fecha_fin: '2026-04-14',
    imagen_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDxjuplDHRtHd-OUwF9Wwm5vPaBjuJZjHY8AvJejxsz0vrfcVLBOxqADQ76jP5vZAekynJhedQty64BTK8MDV3qzGosWwiEh7pXTKvx42CIvBNVHf8eziGbWpAGDVguikTH8Uena9SbZ4riqBdijv_eW4jffLPebFJ-NPHWRaFjJrPofF6isZ5DXtu-TIzHxMkKw3jdO-I0jdBxgrq7t9SZF7mD-KSZTRCsDROfxNYnleiVj0IbvOYw7jkZsmAOaioxUSes-yG8X0M',
    activo: true,
  },
  {
    id: 5,
    titulo: 'Torneo de Dobles Mixto/Libre',
    subtitulo: 'Dobles Mixtos',
    fecha_inicio: '2026-04-01',
    fecha_fin: '2026-04-05',
    imagen_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD822xk3Z5UFXimD5jaQ65Pnav_h7KOLdQhGDXtI3BeM9pnk_Tt7U_DZ5S9em63Fv8_cmz6E0VSlWflf_IBpjHT4Wz3Xya44BAQa03zjSYZbofwQPZYe4j4iBLfRaHTKdPAu15lgCnuwsHZFrJagJNeKFqZcUxjbSt6yMTfcKpyfClnNxYaroLk8-yrFr5PKz_sruS2a2IJRKHsKhiv9EzWf43769G7WPg8cubAvG5_UXnpRvdzdUdcBrUC8rBeyJD6gUzuwaRV_A8',
    activo: true,
  },
];

const Tournaments: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<'hub' | 'available' | 'my'>('hub');

  const [registeredIds, setRegisteredIds] = useState<number[]>([]);
  // Torneos en los que el usuario está inscripto (datos completos, cargados directamente)
  const [myTorneos, setMyTorneos] = useState<Torneo[]>([]);
  const [statusByTournamentId, setStatusByTournamentId] = useState<Record<number, string>>({});
  const [capacityByTournamentId, setCapacityByTournamentId] = useState<
    Record<number, { current: number; max: number | null }>
  >({});
  const [torneos, setTorneos] = useState<Torneo[]>([]);
  const [cargandoTorneos, setCargandoTorneos] = useState(true);
  const [torneosError, setTorneosError] = useState<string | null>(null);
  const [usingFallbackData, setUsingFallbackData] = useState(false);
  const [historialTorneos, setHistorialTorneos] = useState<TorneoHistorialItem[]>([]);
  const [mySubView, setMySubView] = useState<'activos' | 'finalizados'>('activos');

  useEffect(() => {
    const loadRegistrations = async () => {
      const { data: authData } = await (supabase as any).auth.getUser();
      const authUserId = authData?.user?.id;
      const userId = String(authUserId || 'anon');
      const cacheKey = `registered_tournaments_${userId}`;
      const saved = localStorage.getItem(cacheKey);
      const localIds: number[] = saved ? JSON.parse(saved) : [];
      try {
        console.log('Mis Torneos authUserId', authUserId, 'saved localIds', localIds);

        if (!authUserId) {
          setRegisteredIds(localIds);
          return;
        }

        // Cargar inscripciones aprobadas/pendientes con datos del torneo en un solo query
        const { data: inscripcionesData, error: inscripcionesError } = await supabase
          .from('inscripciones_torneo')
          .select('torneo_id, estado, torneos(id, titulo, subtitulo, fecha_inicio, fecha_fin, imagen_url, activo)')
          .eq('perfil_id', authUserId)
          .in('estado', ['pendiente_revision', 'pagado_aprobado']);

        if (inscripcionesError) {
          console.error('Supabase error inscripciones_torneo', {
            status: (inscripcionesError as any).status,
            message: inscripcionesError.message,
            details: inscripcionesError.details,
            hint: inscripcionesError.hint,
            code: inscripcionesError.code,
          });
          throw inscripcionesError;
        }

        let jugadoresData: any[] = [];
        try {
          const { data, error } = await supabase
            .from('torneo_jugadores')
            .select('torneo_id')
            .eq('perfil_id', authUserId);

          if (error) {
            console.error('Supabase error torneo_jugadores', {
              status: (error as any).status,
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code,
            });
          } else {
            jugadoresData = data || [];
          }
        } catch (error) {
          console.error('Unexpected error querying torneo_jugadores', error);
        }

        console.log('Mis Torneos debug:', {
          authUserId,
          jugadoresData,
          inscripcionesData,
        });

        const jugadorIds = (jugadoresData || [])
          .map((row: any) => Number(row.torneo_id || 0))
          .filter((id: number) => id > 0);

        const inscripcionIds = (inscripcionesData || [])
          .map((row: any) => Number(row.torneo_id || 0))
          .filter((id: number) => id > 0);

        const remoteIds = Array.from(new Set([...jugadorIds, ...inscripcionIds]));

        setRegisteredIds(remoteIds);
        localStorage.setItem(cacheKey, JSON.stringify(remoteIds));

        // Construir lista de torneos propios directamente desde la respuesta
        // (evita depender de que la lista general de torneos esté cargada)
        const torneosFromInscripciones: Torneo[] = (inscripcionesData || [])
          .map((row: any) => row.torneos)
          .filter(Boolean)
          .filter((t: any, idx: number, arr: any[]) => arr.findIndex((x: any) => x.id === t.id) === idx);

        setMyTorneos(torneosFromInscripciones);
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
        const [{ data: estadoData, error: estadoError }, { data: configData, error: configError }] = await Promise.all([
          supabase.from('torneo_estado').select('torneo_id, estado, current_participantes, max_participantes'),
          supabase.from('torneo_configuracion').select('torneo_id, max_participantes_total'),
        ]);

        if (estadoError) throw estadoError;
        if (configError) throw configError;

        const maxTotalByTournamentId: Record<number, number | null | undefined> = {};
        (configData || []).forEach((row: any) => {
          const id = Number(row.torneo_id);
          const v = row.max_participantes_total;
          maxTotalByTournamentId[id] = v === null || v === undefined ? null : Number(v);
        });

        const sumCurrentByTorneo: Record<number, number> = {};
        const sumMaxEstadoByTorneo: Record<number, number> = {};
        (estadoData || []).forEach((row: any) => {
          const id = Number(row.torneo_id);
          sumCurrentByTorneo[id] = (sumCurrentByTorneo[id] || 0) + Number(row.current_participantes || 0);
          sumMaxEstadoByTorneo[id] = (sumMaxEstadoByTorneo[id] || 0) + Number(row.max_participantes || 0);
        });

        const nextStatus: Record<number, string> = {};
        const nextStatusPriority: Record<number, number> = {};

        (estadoData || []).forEach((row: any) => {
          const id = Number(row.torneo_id);
          const normalized = normalizeStatus(row.estado);
          const priority = getStatusPriority(normalized);

          if ((nextStatusPriority[id] ?? -1) <= priority) {
            nextStatus[id] = normalized;
            nextStatusPriority[id] = priority;
          }
        });

        const nextCapacity: Record<number, { current: number; max: number | null }> = {};
        const allIds = new Set<number>();
        Object.keys(sumCurrentByTorneo).forEach((k) => allIds.add(Number(k)));
        Object.keys(maxTotalByTournamentId).forEach((k) => allIds.add(Number(k)));

        allIds.forEach((id) => {
          const configured = maxTotalByTournamentId[id];
          const fallbackGrupoMaxSum = sumMaxEstadoByTorneo[id] || 0;
          const max =
            configured !== null && configured !== undefined && configured > 0
              ? configured
              : fallbackGrupoMaxSum > 0
                ? fallbackGrupoMaxSum
                : null;

          nextCapacity[id] = {
            current: sumCurrentByTorneo[id] || 0,
            max,
          };
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
      setTorneosError(null);
      setUsingFallbackData(false);
      try {
        const { data, error } = await supabase
          .from('torneos')
          .select('id, titulo, subtitulo, fecha_inicio, fecha_fin, imagen_url, activo')
          .order('id', { ascending: true });
        if (error) throw error;
        const activos = ((data || []) as Torneo[]).filter((t) => t.activo !== false);

        if (activos.length === 0) {
          setTorneos(FALLBACK_TORNEOS);
          setUsingFallbackData(true);
          setTorneosError('No llegaron torneos activos desde Supabase. Mostrando datos de respaldo.');
          return;
        }

        setTorneos(activos);
      } catch (err) {
        console.error('No se pudo cargar la lista de torneos', err);
        const message = String(err?.message || 'error desconocido');
        setTorneos(FALLBACK_TORNEOS);
        setUsingFallbackData(true);
        setTorneosError(`No se pudo cargar desde Supabase (${message}). Mostrando datos de respaldo.`);
      } finally {
        setCargandoTorneos(false);
      }
    };
    cargarTorneos();
  }, []);

  useEffect(() => {
    const loadHistorial = async () => {
      const { data: authData } = await (supabase as any).auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) return;

      const { data: jugadoresData, error: jugErr } = await supabase
        .from('torneo_jugadores')
        .select('torneo_id, partidos_jugados, sets_ganados, sets_perdidos')
        .eq('perfil_id', userId);

      if (jugErr || !jugadoresData?.length) return;

      const torneoIds = (jugadoresData as any[]).map((r) => Number(r.torneo_id));

      const { data: torneosData } = await supabase
        .from('torneos')
        .select('id, titulo, subtitulo, fecha_inicio, fecha_fin')
        .eq('activo', false)
        .in('id', torneoIds);

      if (!torneosData?.length) return;

      const finalizadoIds = (torneosData as any[]).map((t) => t.id);

      const { data: estadoData } = await supabase
        .from('torneo_estado')
        .select('torneo_id, campeon_perfil_id, perfiles:campeon_perfil_id(nombre)')
        .in('torneo_id', finalizadoIds)
        .like('grupo', '%_PLAYOFFS')
        .not('campeon_perfil_id', 'is', null);

      const campeonByTorneo: Record<number, { nombre: string | null; perfil_id: string | null }> = {};
      (estadoData || []).forEach((row: any) => {
        const id = Number(row.torneo_id);
        if (!campeonByTorneo[id]) {
          campeonByTorneo[id] = {
            nombre: row.perfiles?.nombre || null,
            perfil_id: row.campeon_perfil_id || null,
          };
        }
      });

      const jugadoresByTorneo: Record<number, any> = {};
      (jugadoresData as any[]).forEach((row) => {
        jugadoresByTorneo[Number(row.torneo_id)] = row;
      });

      const items: TorneoHistorialItem[] = (torneosData as any[]).map((t) => {
        const stats = jugadoresByTorneo[t.id] || {};
        const campeon = campeonByTorneo[t.id] || {};
        return {
          torneo_id: t.id,
          titulo: t.titulo,
          subtitulo: t.subtitulo,
          fecha_inicio: t.fecha_inicio,
          fecha_fin: t.fecha_fin,
          partidos_jugados: stats.partidos_jugados || 0,
          sets_ganados: stats.sets_ganados || 0,
          sets_perdidos: stats.sets_perdidos || 0,
          campeon_nombre: campeon.nombre || null,
          campeon_perfil_id: campeon.perfil_id || null,
          es_campeon: campeon.perfil_id === userId,
        };
      });

      setHistorialTorneos(items);
    };

    loadHistorial();
  }, []);

  // Convierte una fila de DB al objeto que esperan las sub-pantallas del torneo
  const toNavTorneo = (t: Torneo) => ({
    id: t.id,
    title: t.titulo,
    subtitle: t.subtitulo,
    image: t.imagen_url || '',
    date: TOURNAMENT_SEASON_LABEL,
  });

  // Combinar torneos propios: primero los cargados directamente desde inscripciones,
  // luego completar con los de la lista general si hay IDs que no estén cubiertos
  // (ej: torneos en torneo_jugadores sin inscripcion directa)
  const myRegisteredTournaments = (() => {
    const seen = new Set<number>(myTorneos.map((t: Torneo) => t.id));
    const fromGeneral = torneos.filter((t: Torneo) => registeredIds.includes(t.id) && !seen.has(t.id));
    return [...myTorneos, ...fromGeneral];
  })();

  const availableTournaments = torneos.filter((t: Torneo) => {
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

          {(torneosError || usingFallbackData) && (
            <div className="px-4 md:px-8 pb-4">
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 p-4 border border-amber-200 dark:border-amber-700/50 text-sm text-amber-800 dark:text-amber-200">
                {torneosError || 'Mostrando datos de respaldo mientras se restablece la conexion con Supabase.'}
              </div>
            </div>
          )}

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
                    style={{ backgroundImage: `url("${tournament.imagen_url || DEFAULT_TOURNAMENT_IMAGE}")` }}
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
                        {TOURNAMENT_SEASON_LABEL} • {(() => {
                          const cap = capacityByTournamentId[tournament.id];
                          if (!cap) return 'Cupo disponible';
                          const m = cap.max;
                          if (m !== null && m > 0) {
                            return `${cap.current}/${m} Inscriptos`;
                          }
                          return cap.current > 0 ? `${cap.current} Inscriptos` : 'Cupo disponible';
                        })()}
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

        {/* Sub-tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-background-dark sticky top-[73px] z-10">
          <button
            onClick={() => setMySubView('activos')}
            className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${mySubView === 'activos' ? 'border-[#4a9c40] text-[#4a9c40]' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
          >
            Activos
          </button>
          <button
            onClick={() => setMySubView('finalizados')}
            className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${mySubView === 'finalizados' ? 'border-[#4a9c40] text-[#4a9c40]' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
          >
            Finalizados {historialTorneos.length > 0 && <span className="ml-1 text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">{historialTorneos.length}</span>}
          </button>
        </div>

        <div className="max-w-7xl mx-auto w-full p-4 md:p-8">
          {mySubView === 'activos' && (
            myRegisteredTournaments.length === 0 ? (
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
                    <img src={t.imagen_url || DEFAULT_TOURNAMENT_IMAGE} className="size-24 rounded-2xl object-cover" alt={t.titulo} />
                    <div className="flex-1">
                      <h4 className="font-bold text-lg text-[#111813] dark:text-white leading-tight mb-2">{t.titulo}</h4>
                      <span className={`text-xs font-bold mt-1 inline-block ${canOpenPanel ? 'text-primary' : 'text-amber-600 dark:text-amber-300'}`}>
                        {canOpenPanel ? 'Ver Panel' : 'Torneo en preparación'}
                      </span>
                    </div>
                    <span className="material-symbols-outlined text-gray-400 group-hover:text-primary transition-colors">chevron_right</span>
                  </div>
                  );
                })}
              </div>
            )
          )}

          {mySubView === 'finalizados' && (
            historialTorneos.length === 0 ? (
              <div className="bg-white dark:bg-[#1a2e1f] p-12 rounded-3xl text-center shadow-sm border border-gray-100 dark:border-gray-800 max-w-lg mx-auto mt-10">
                <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-6xl mb-4">emoji_events</span>
                <p className="text-gray-500 dark:text-gray-400 font-medium text-lg">Todavía no participaste en torneos finalizados.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {historialTorneos.map((t) => (
                  <div key={t.torneo_id} className="bg-white dark:bg-[#1a2e1f] rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h4 className="font-bold text-base text-[#111813] dark:text-white leading-tight">{t.titulo}</h4>
                        <p className="text-xs text-gray-400 mt-0.5">{t.subtitulo}</p>
                      </div>
                      {t.es_campeon && (
                        <span className="text-yellow-500 text-2xl" title="Campeón">🏆</span>
                      )}
                    </div>

                    {t.campeon_nombre && (
                      <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl px-3 py-2">
                        <span className="material-symbols-outlined text-yellow-500 text-[18px]">emoji_events</span>
                        <span className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
                          {t.es_campeon ? 'Sos el campeón' : `Campeón: ${t.campeon_nombre}`}
                        </span>
                      </div>
                    )}

                    <div className="flex gap-3 text-center">
                      <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl py-2">
                        <p className="text-lg font-bold text-[#111813] dark:text-white">{t.partidos_jugados}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Partidos</p>
                      </div>
                      <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl py-2">
                        <p className="text-lg font-bold text-[#4a9c40]">{t.sets_ganados}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Sets G</p>
                      </div>
                      <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl py-2">
                        <p className="text-lg font-bold text-red-400">{t.sets_perdidos}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Sets P</p>
                      </div>
                    </div>

                    {(t.fecha_inicio || t.fecha_fin) && (
                      <p className="text-[11px] text-gray-400 text-right">
                        {[t.fecha_inicio, t.fecha_fin].filter(Boolean).join(' — ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )
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
