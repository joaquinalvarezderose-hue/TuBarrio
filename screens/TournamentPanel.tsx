
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useNextMatch } from '../hooks/useNextMatch';

const normalizeStatus = (status?: string) => String(status || 'RECRUITING').trim().toUpperCase();
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
const isTournamentReadyForPanel = (status?: string) => PANEL_READY_STATUSES.has(normalizeStatus(status));

type TournamentScope = {
  categoria: string;
  grupo: string;
};

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
  const appUser = localStorage.getItem('app_user') ? JSON.parse(localStorage.getItem('app_user') as string) : null;
  const [currentUserId, setCurrentUserId] = useState<string>(String(appUser?.id || ''));

  const [loadingData, setLoadingData] = useState(true);
  const [tournamentStatus, setTournamentStatus] = useState<string>('RECRUITING');
  const [hasLifecycleStatus, setHasLifecycleStatus] = useState<boolean>(true);
  const [userScope, setUserScope] = useState<TournamentScope | null>(null);
  const [groupPosition, setGroupPosition] = useState<number | null>(null);
  const [groupSize, setGroupSize] = useState<number>(0);

  // Hook centralizado para el próximo partido + datos del rival
  const { match: nextMatch, loading: loadingNextMatch } = useNextMatch(tournament.id);

  useEffect(() => {
    localStorage.setItem('active_tournament', JSON.stringify(tournament));
  }, [tournament]);

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const { data } = await (supabase as any).auth.getUser();
        const authUserId = data?.user?.id;
        if (authUserId) {
          setCurrentUserId(String(authUserId));
        } else {
          setCurrentUserId(String(appUser?.id || ''));
        }
      } catch {
        setCurrentUserId(String(appUser?.id || ''));
      }
    };

    loadCurrentUser();
  }, []);

  useEffect(() => {
    const loadPanelData = async () => {
      setLoadingData(true);
      try {
        let resolvedScope: TournamentScope | null = null;

        if (currentUserId) {
          const { data: jugadorScopeRows } = await supabase
            .from('torneo_jugadores')
            .select('categoria, grupo')
            .eq('torneo_id', tournament.id)
            .eq('perfil_id', currentUserId)
            .limit(1);

          const jugadorScope = Array.isArray(jugadorScopeRows) ? jugadorScopeRows[0] : null;
          if (jugadorScope?.categoria && jugadorScope?.grupo) {
            resolvedScope = {
              categoria: String(jugadorScope.categoria),
              grupo: String(jugadorScope.grupo),
            };
          }
        }

        if (!resolvedScope && currentUserId) {
          const { data: inscripcionScopeRows } = await supabase
            .from('inscripciones_torneo')
            .select('categoria, grupo')
            .eq('torneo_id', tournament.id)
            .eq('perfil_id', currentUserId)
            .in('estado', ['pagado_aprobado', 'pendiente_revision'])
            .limit(1);

          const inscripcionScope = Array.isArray(inscripcionScopeRows) ? inscripcionScopeRows[0] : null;
          if (inscripcionScope?.categoria && inscripcionScope?.grupo) {
            resolvedScope = {
              categoria: String(inscripcionScope.categoria),
              grupo: String(inscripcionScope.grupo),
            };
          }
        }

        setUserScope(resolvedScope);

        let statusQuery: any = supabase
          .from('torneo_estado')
          .select('estado, categoria, grupo')
          .eq('torneo_id', tournament.id);

        if (resolvedScope) {
          statusQuery = statusQuery
            .eq('categoria', resolvedScope.categoria)
            .eq('grupo', resolvedScope.grupo);
        }

        const { data: statusRows, error: statusError } = await statusQuery;

        let vHasLifecycleStatus = false;

        if (statusError) {
          console.warn('No se pudo leer torneo_estado; se aplica fallback de panel por fixture.', statusError.message);
          setHasLifecycleStatus(false);
        } else {
          vHasLifecycleStatus = Array.isArray(statusRows) && statusRows.length > 0;
          setHasLifecycleStatus(vHasLifecycleStatus);
        }

        const resolvedStatus = (statusRows || []).reduce((best: string, row: any) => {
          const candidate = normalizeStatus(row?.estado);
          return getStatusPriority(candidate) >= getStatusPriority(best) ? candidate : best;
        }, 'RECRUITING');

        setTournamentStatus(resolvedStatus);

        if ((vHasLifecycleStatus && !isTournamentReadyForPanel(resolvedStatus)) || !currentUserId) {
          return;
        }

        // La carga del próximo partido es manejada por el hook useNextMatch.
        // Aquí solo cargamos la posición en el grupo.
        if (resolvedScope && currentUserId) {
          const { data: tableRows, error: tableError } = await supabase
            .from('torneo_jugadores')
            .select('perfil_id, puntos, sets_ganados, partidos_jugados')
            .eq('torneo_id', tournament.id)
            .eq('categoria', resolvedScope.categoria)
            .eq('grupo', resolvedScope.grupo);

          if (!tableError && Array.isArray(tableRows) && tableRows.length > 0) {
            const sorted = [...tableRows].sort((a: any, b: any) => {
              const pointsDiff = Number(b.puntos || 0) - Number(a.puntos || 0);
              if (pointsDiff !== 0) return pointsDiff;

              const setsDiff = Number(b.sets_ganados || 0) - Number(a.sets_ganados || 0);
              if (setsDiff !== 0) return setsDiff;

              return Number(a.partidos_jugados || 0) - Number(b.partidos_jugados || 0);
            });

            const userIndex = sorted.findIndex((row: any) => String(row.perfil_id) === currentUserId);
            setGroupSize(sorted.length);
            setGroupPosition(userIndex >= 0 ? userIndex + 1 : null);
          } else {
            setGroupSize(0);
            setGroupPosition(null);
          }
        } else {
          setGroupSize(0);
          setGroupPosition(null);
        }
      } catch (error) {
        console.error('No se pudo cargar el panel del torneo', error);
        setGroupSize(0);
        setGroupPosition(null);
      } finally {
        setLoadingData(false);
      }
    };

    loadPanelData();
  }, [currentUserId, tournament.id]);

  // El panel se considera "cargando" hasta que tanto el estado general
  // como los datos del próximo partido estén resueltos.
  const isLoading = loadingData || loadingNextMatch;
  const isReady = !hasLifecycleStatus || isTournamentReadyForPanel(tournamentStatus);

  const tournamentPhaseLabel = useMemo(() => {
    switch (tournamentStatus) {
      case 'RECRUITING':
      case 'INSCRIPCION_ABIERTA':
        return 'En preparación';
      case 'INSCRIPCION_CERRADA':
        return 'Inscripción cerrada';
      case 'ARMADO_FIXTURE':
        return 'Armando fixture';
      case 'ACTIVO':
        return 'Activo';
      case 'EN_CURSO':
        return 'En curso';
      case 'LOCKED':
        return 'Cupo completo';
      case 'PLAYOFFS':
        return 'Playoffs';
      case 'FINALIZADO':
        return 'Finalizado';
      default:
        return 'En curso';
    }
  }, [tournamentStatus]);

  const estaFinalizado = tournamentStatus === 'FINALIZADO';

  const rivalWaLink = useMemo(() => {
    const whatsapp = nextMatch?.rival?.whatsapp ?? nextMatch?.rivalWhatsapp;
    if (!whatsapp) return null;
    const digits = String(whatsapp).replace(/[^\d]/g, '');
    if (!digits) return null;
    return `https://wa.me/${digits}`;
  }, [nextMatch?.rival?.whatsapp, nextMatch?.rivalWhatsapp]);

  const nextMatchDateLabel = useMemo(() => {
    if (!nextMatch?.fecha_programada) return 'Fecha a confirmar por la organización';
    const date = new Date(nextMatch.fecha_programada);
    if (Number.isNaN(date.getTime())) return 'Fecha a confirmar por la organización';
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [nextMatch?.fecha_programada]);

  const groupProgressWidth = useMemo(() => {
    if (!groupPosition || !groupSize || groupSize <= 0) return 0;
    const progress = ((groupSize - groupPosition + 1) / groupSize) * 100;
    return Math.max(8, Math.min(100, Math.round(progress)));
  }, [groupPosition, groupSize]);

  if (!isLoading && !isReady) {
    return (
      <div className="max-w-md mx-auto min-h-screen flex flex-col bg-background-light dark:bg-background-dark font-display">
        <header className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md px-4 py-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-[#111813] dark:text-white hover:bg-black/5 dark:hover:bg-white/5 p-1 rounded-full transition-colors"
          >
            <span className="material-symbols-outlined text-2xl">arrow_back_ios</span>
          </button>
          <h1 className="text-lg font-bold tracking-tight text-[#111813] dark:text-white">Panel del Torneo</h1>
          <div className="w-8"></div>
        </header>

        <main className="flex-1 p-4 flex items-center">
          <div className="w-full rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 p-6 text-center">
            <span className="material-symbols-outlined text-amber-500 text-4xl">schedule</span>
            <h2 className="mt-3 text-xl font-bold text-amber-800 dark:text-amber-200">Torneo en preparación</h2>
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300 font-medium">
              Este torneo todavía no está listo para ver detalle deportivo. Volvé cuando la organización lo marque como activo.
            </p>
          </div>
        </main>
      </div>
    );
  }

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
                <span className="text-primary text-xs font-bold uppercase tracking-widest">{tournamentPhaseLabel}</span>
                <h2 className="text-xl font-bold leading-tight text-[#111813] dark:text-white">{tournament.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="bg-primary/10 text-[#4a9c40] dark:bg-primary/20 px-2 py-0.5 rounded text-xs font-semibold">{userScope?.categoria || tournament.subtitle || 'Categoría general'}</span>
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
            <div className={`size-12 rounded-full flex items-center justify-center transition-colors shadow-md ${
              estaFinalizado
                ? 'bg-gray-400 dark:bg-gray-600 text-white'
                : 'bg-[#4a9c40] text-white group-hover:bg-[#3d8b33]'
            }`}>
              <span className="material-symbols-outlined text-3xl">{estaFinalizado ? 'history' : 'sports_tennis'}</span>
            </div>
            <span className="text-sm font-semibold text-center text-[#111813] dark:text-white">
              {estaFinalizado ? 'Ver Historial' : 'Cargar Resultado'}
            </span>
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
                <p className="text-xs font-bold text-[#4a9c40] uppercase tracking-wider">{nextMatch ? `Fecha ${nextMatch.jornada}` : 'Sin partido'}</p>
                <h4 className="text-lg font-bold text-[#111813] dark:text-white">{nextMatch ? `vs. ${nextMatch.rivalName}` : 'Rival por definir'}</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{nextMatchDateLabel}</p>
              </div>
              <div className="size-12 rounded-full bg-emerald-100 text-emerald-700 shrink-0 border-2 border-white dark:border-gray-700 shadow-sm flex items-center justify-center text-sm font-bold uppercase">
                {String(nextMatch?.rivalName || 'Rival')
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((chunk) => chunk[0])
                  .join('') || 'R'}
              </div>
            </div>
            
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  if (rivalWaLink) window.open(rivalWaLink, '_blank', 'noopener,noreferrer');
                }}
                disabled={!rivalWaLink}
                className="flex items-center justify-center gap-2 w-full py-3 bg-[#25D366] text-white rounded-lg font-bold shadow-md hover:bg-[#20bd5a] transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="size-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"></path>
                </svg>
                {rivalWaLink ? 'WhatsApp del Rival' : 'Rival sin WhatsApp'}
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
          <p className="text-xs text-gray-500 dark:text-gray-500 font-bold uppercase tracking-wide">
            {groupPosition && groupSize > 0
              ? `Estás en la posición #${groupPosition} de ${groupSize} en tu grupo`
              : 'Posición de grupo disponible cuando haya tabla cargada'}
          </p>
          <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-[#4a9c40] h-full rounded-full shadow-[0_0_8px_rgba(74,156,64,0.4)]"
              style={{ width: `${groupProgressWidth}%` }}
            ></div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default TournamentPanel;