import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Logo from '../components/Logo';
import { supabase } from '../services/supabaseClient';
import { usePlayerTournamentStatus } from '../hooks/usePlayerTournamentStatus';
import { useNextMatch } from '../hooks/useNextMatch';
import { toWhatsAppLink } from '../utils/whatsapp';

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

// Sanitize external URLs (CSP blocks http/https for images, use local fallback instead)
const sanitizeTournamentImage = (url?: string): string => {
  if (!url || url.startsWith('http')) return '/images/tournament-default.jpg';
  return url;
};

type TournamentScope = {
 categoria: string;
 grupo: string;
};

type TournamentConfigRow = {
 jugadores_por_grupo: number;
 sortear_grupos_en_sorteo: boolean;
 grupo_base: string | null;
 grupo_base_id: string | null;
 clasificados_por_grupo: number;
 crear_playoffs_eliminacion_directa: boolean;
};

type GroupStatusRow = {
 categoria: string;
 grupo: string;
 estado: string;
 current_participantes: number;
 sorteo_realizado: boolean;
};

const TournamentPanel: React.FC = () => {
 const navigate = useNavigate();
 const location = useLocation();
 const savedTournament = localStorage.getItem('active_tournament');
 const rawTournament = location.state?.tournament || (savedTournament ? JSON.parse(savedTournament) : {
 title: "Abierto de Tenis TuBarrio",
 id: 1,
 subtitle: "2da Categoría - Singles",
 image: "/images/tournament-default.jpg"
 });
 // Sanitize image URL to reject external URLs (CSP compliance + localStorage cache cleanup)
 const tournament = { ...rawTournament, image: sanitizeTournamentImage(rawTournament?.image) };
 const appUser = localStorage.getItem('app_user') ? JSON.parse(localStorage.getItem('app_user') as string) : null;
 const [currentUserId, setCurrentUserId] = useState<string>(String(appUser?.id || ''));
 const isAdmin = String(appUser?.rol || '').trim().toLowerCase() === 'admin';

 const [loadingData, setLoadingData] = useState(true);
 const [tournamentStatus, setTournamentStatus] = useState<string>('RECRUITING');
 const [hasLifecycleStatus, setHasLifecycleStatus] = useState<boolean>(true);
 const [userScope, setUserScope] = useState<TournamentScope | null>(null);
 const [groupPosition, setGroupPosition] = useState<number | null>(null);
 const [groupSize, setGroupSize] = useState<number>(0);
 const [tournamentConfig, setTournamentConfig] = useState<TournamentConfigRow | null>(null);
 const [groupStatuses, setGroupStatuses] = useState<GroupStatusRow[]>([]);
 const [adminActionLoading, setAdminActionLoading] = useState<'draw' | 'start' | 'playoffs' | null>(null);
 const [adminMessage, setAdminMessage] = useState<string | null>(null);
 const [adminError, setAdminError] = useState<string | null>(null);
 const [refreshKey, setRefreshKey] = useState(0);
 const [proposalMustConfirmBy, setProposalMustConfirmBy] = useState<string | null>(null);
 const [loadingProposal, setLoadingProposal] = useState(false);
 const [pendingConfirmMatch, setPendingConfirmMatch] = useState<{ id: string; jornada: number } | null>(null);
 const [bracketMatchesExist, setBracketMatchesExist] = useState(false);
 const [userBracketMatchExists, setUserBracketMatchExists] = useState(false);
 const [tournamentChampion, setTournamentChampion] = useState<string | null>(null);
 const [inscripcionPendiente, setInscripcionPendiente] = useState(false);
 const [checkingInscripcion, setCheckingInscripcion] = useState(true);
 // Single authoritative backend hook for player status
 const { loading: loadingNextMatch, status: playerStatus } = usePlayerTournamentStatus(tournament.id, currentUserId || undefined);
 // Direct query fallback for when the RPC doesn't return proximo_partido
 const { match: nextMatchFallback } = useNextMatch(tournament.id);

 const rpcNextMatch = playerStatus?.proximo_partido ?? null;
 const nextMatch = rpcNextMatch ?? (nextMatchFallback ? {
 id: nextMatchFallback.id,
 jornada: nextMatchFallback.jornada,
 estado: nextMatchFallback.estado,
 fecha_programada: nextMatchFallback.fecha_programada,
 jugador1_id: nextMatchFallback.jugador1_id,
 jugador2_id: nextMatchFallback.jugador2_id,
 ronda: null as number | null,
 bracket_tipo: null as string | null,
 grupo: '',
 categoria: '',
 stage_name: null as string | null,
 rival_id: nextMatchFallback.rivalId,
 rival_nombre: nextMatchFallback.rivalName,
 rival_whatsapp: nextMatchFallback.rivalWhatsapp,
 } : null);
 
 const isEliminated = playerStatus?.estado === 'eliminado';
 const isCampeon = playerStatus?.estado === 'campeon';
 const isFinalista = playerStatus?.estado === 'finalista';
 const isWaiting = playerStatus?.estado === 'esperando_siguiente_ronda';
 const isGroupStageOngoing = playerStatus?.estado === 'fase_grupos_en_curso' && nextMatch?.estado !== 'esperando_validacion';

 const matchIsWaitingValidation = nextMatch?.estado === 'esperando_validacion';
 // pendingConfirmMatch is set by a separate effect that finds any esperando_validacion match
 // where the current user is debe_confirmar_por — independent of nextMatch ordering.
 const isUserMustConfirm = !!pendingConfirmMatch;
 const isUserWaitingRivalConfirm = matchIsWaitingValidation && !isUserMustConfirm;

 const noPlayoffMatch = !nextMatch && bracketMatchesExist && !userBracketMatchExists && !isEliminated && !isCampeon && !isFinalista && !isWaiting && !loadingNextMatch;
 const rawStats = playerStatus?.stats ?? null;
 const tournamentStats = rawStats && rawStats.total > 0 ? {
 totalMatches: rawStats.total,
 wins: rawStats.wins,
 losses: rawStats.losses,
 setsWon: rawStats.sets_won,
 setsLost: rawStats.sets_lost,
 winRate: rawStats.win_rate,
 } : null;

 useEffect(() => {
 localStorage.setItem('active_tournament', JSON.stringify(tournament));
 }, [tournament]);

 // Chequeo rápido y paralelo: solo determina si el pago está pendiente,
 // sin esperar al resto de la carga del panel.
 useEffect(() => {
 const perfilId = String(appUser?.id || '');
 if (!perfilId || !tournament?.id) {
 setCheckingInscripcion(false);
 return;
 }
 let cancelled = false;
 (async () => {
 try {
 const [{ data: jugador }, { data: inscripcion }] = await Promise.all([
 supabase
 .from('torneo_jugadores')
 .select('perfil_id')
 .eq('torneo_id', tournament.id)
 .eq('perfil_id', perfilId)
 .maybeSingle(),
 supabase
 .from('inscripciones_torneo')
 .select('estado')
 .eq('torneo_id', tournament.id)
 .eq('perfil_id', perfilId)
 .in('estado', ['pagado_aprobado', 'pendiente_revision'])
 .maybeSingle(),
 ]);
 if (!cancelled && !jugador && inscripcion?.estado === 'pendiente_revision') {
 setInscripcionPendiente(true);
 }
 } catch {
 // swallow
 } finally {
 if (!cancelled) setCheckingInscripcion(false);
 }
 })();
 return () => { cancelled = true; };
 }, [tournament.id]);

 useEffect(() => {
 const loadCurrentUser = async () => {
 try {
 const { data } = await supabase.auth.getUser();
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
 if (!nextMatch?.id || nextMatch.estado !== 'esperando_validacion') {
 setProposalMustConfirmBy(null);
 return;
 }
 let cancelled = false;
 setLoadingProposal(true);
 (async () => {
 try {
 const { data } = await supabase
 .from('torneo_propuestas_partido')
 .select('debe_confirmar_por')
 .eq('partido_id', nextMatch.id)
 .maybeSingle();
 if (!cancelled) {
 setProposalMustConfirmBy(data?.debe_confirmar_por ?? null);
 }
 } catch {
 // swallow
 } finally {
 if (!cancelled) setLoadingProposal(false);
 }
 })();
 return () => { cancelled = true; };
 }, [nextMatch?.id, nextMatch?.estado]);

 // Independent check: find any match where the current user must confirm, regardless of nextMatch ordering.
 // This handles the case where nextMatch points to an earlier jornada (programado) but a later jornada
 // is already in esperando_validacion waiting for this user's confirmation.
 useEffect(() => {
 if (!currentUserId || !tournament?.id) return;
 let cancelled = false;
 (async () => {
 try {
 const { data: waitingRows } = await supabase
 .from('partidos')
 .select('id, jornada')
 .eq('torneo_id', tournament.id)
 .or(`jugador1_id.eq.${currentUserId},jugador2_id.eq.${currentUserId}`)
 .eq('estado', 'esperando_validacion')
 .order('jornada', { ascending: true })
 .limit(1);

 const waiting = Array.isArray(waitingRows) ? waitingRows[0] : null;
 if (!waiting || cancelled) { setPendingConfirmMatch(null); return; }

 const { data: proposal } = await supabase
 .from('torneo_propuestas_partido')
 .select('debe_confirmar_por')
 .eq('partido_id', waiting.id)
 .maybeSingle();

 if (!cancelled) {
 if (proposal?.debe_confirmar_por &&
 String(proposal.debe_confirmar_por).toLowerCase() === String(currentUserId).toLowerCase()) {
 setPendingConfirmMatch({ id: String(waiting.id), jornada: Number(waiting.jornada) });
 } else {
 setPendingConfirmMatch(null);
 }
 }
 } catch {
 // swallow
 }
 })();
 return () => { cancelled = true; };
 }, [currentUserId, tournament?.id, refreshKey]);

 useEffect(() => {
 const loadPanelData = async () => {
 setLoadingData(true);
 try {
 setAdminError(null);
 let resolvedScope: TournamentScope | null = null;
 const fallbackCategory = String(tournament.subtitle || 'General');

 const { data: configRow, error: configError } = await supabase
 .from('torneo_configuracion')
 .select('jugadores_por_grupo, sortear_grupos_en_sorteo, grupo_base, grupo_base_id, clasificados_por_grupo, crear_playoffs_eliminacion_directa')
 .eq('torneo_id', tournament.id)
 .maybeSingle();

 if (!configError && configRow) {
 setTournamentConfig({
 jugadores_por_grupo: Number(configRow.jugadores_por_grupo || 0),
 sortear_grupos_en_sorteo: Boolean(configRow.sortear_grupos_en_sorteo),
 grupo_base: configRow.grupo_base ? String(configRow.grupo_base) : null,
 grupo_base_id: configRow.grupo_base_id ? String(configRow.grupo_base_id) : null,
 clasificados_por_grupo: Number(configRow.clasificados_por_grupo || 0),
 crear_playoffs_eliminacion_directa: Boolean(configRow.crear_playoffs_eliminacion_directa),
 });
 } else {
 setTournamentConfig(null);
 }

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
 .select('categoria, grupo, estado')
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
 if (inscripcionScope.estado === 'pendiente_revision') {
 setInscripcionPendiente(true);
 }
 }
 }

 setUserScope(resolvedScope);

 let groupStatusQuery: any = supabase
 .from('torneo_estado')
 .select('categoria, grupo, estado, current_participantes, sorteo_realizado')
 .eq('torneo_id', tournament.id);

 const statusCategory = resolvedScope?.categoria || fallbackCategory;
 if (statusCategory) {
 groupStatusQuery = groupStatusQuery.eq('categoria', statusCategory);
 }

 const { data: groupStatusRows } = await groupStatusQuery.order('grupo', { ascending: true });
 setGroupStatuses(Array.isArray(groupStatusRows) ? (groupStatusRows as GroupStatusRow[]) : []);

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

 // La carga del próximo partido es manejada por el hook usePlayerTournamentStatus.
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

 // Check if bracket matches exist, and whether this user is in any of them
 const [{ count: bracketCount }, { count: userBracketCount }] = await Promise.all([
 supabase
 .from('partidos')
 .select('id', { count: 'exact', head: true })
 .eq('torneo_id', tournament.id)
 .eq('bracket_tipo', 'eliminacion_directa'),
 supabase
 .from('partidos')
 .select('id', { count: 'exact', head: true })
 .eq('torneo_id', tournament.id)
 .eq('bracket_tipo', 'eliminacion_directa')
 .or(`jugador1_id.eq.${currentUserId},jugador2_id.eq.${currentUserId}`),
 ]);
 setBracketMatchesExist((bracketCount ?? 0) > 0);
 setUserBracketMatchExists((userBracketCount ?? 0) > 0);

 // Fetch champion name from finalized final match
 const { data: finalMatch } = await supabase
 .from('partidos')
 .select('ganador_id')
 .eq('torneo_id', tournament.id)
 .eq('bracket_tipo', 'eliminacion_directa')
 .is('siguiente_partido_id', null)
 .eq('estado', 'finalizado')
 .maybeSingle();
 if (finalMatch?.ganador_id) {
 const { data: champProfile } = await supabase
 .from('perfiles')
 .select('nombre_completo')
 .eq('id', finalMatch.ganador_id)
 .maybeSingle();
 setTournamentChampion(champProfile?.nombre_completo ?? null);
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
 }, [currentUserId, tournament.id, tournament.subtitle, refreshKey]);

 const refreshPanel = () => setRefreshKey((value) => value + 1);

 const handleDrawGroupsAndFixture = async () => {
 if (!isAdmin) return;

 setAdminActionLoading('draw');
 setAdminError(null);
 setAdminMessage(null);

 try {
 const categoria = userScope?.categoria || tournament.subtitle || null;
 const grupoBase = tournamentConfig?.grupo_base || `TORNEO_${Number(tournament.id)}`;

 const { data, error } = await supabase.rpc('sortear_grupos_y_fixture_torneo', {
 p_torneo_id: Number(tournament.id),
 p_categoria: categoria,
 p_grupo_base: grupoBase,
 });

 if (error) throw error;

 const row = Array.isArray(data) ? data[0] : null;
 if (row) {
 setAdminMessage(
 `Sorteo realizado: ${Number(row.grupos_creados || 0)} grupo(s), ${Number(row.jugadores_sorteados || 0)} jugador(es), ${Number(row.partidos_creados || 0)} partido(s).`
 );
 } else {
 setAdminMessage('Sorteo realizado correctamente.');
 }

 refreshPanel();
 } catch (error: any) {
 setAdminError(error?.message || 'No se pudo sortear grupos y fixture.');
 } finally {
 setAdminActionLoading(null);
 }
 };

 const handleStartTournament = async () => {
 if (!isAdmin) return;

 setAdminActionLoading('start');
 setAdminError(null);
 setAdminMessage(null);

 try {
 const categoria = userScope?.categoria || tournament.subtitle || 'General';

 if (tournamentConfig?.sortear_grupos_en_sorteo) {
 const grupoBase = tournamentConfig?.grupo_base || `TORNEO_${Number(tournament.id)}`;
 const { data, error } = await supabase.rpc('iniciar_torneo_en_curso', {
 p_torneo_id: Number(tournament.id),
 p_categoria: categoria,
 p_grupo_base: grupoBase,
 });

 if (error) throw error;

 const row = Array.isArray(data) ? data[0] : null;
 const startedGroups = Number(row?.grupos_actualizados || 0);
 if (startedGroups > 0) {
 setAdminMessage(`Torneo iniciado en ${startedGroups} grupo(s).`);
 } else {
 setAdminMessage('El torneo ya estaba en curso o no habia grupos por iniciar.');
 }
 } else {
 const { data: statusRows, error: statusError } = await supabase
 .from('torneo_estado')
 .select('categoria, grupo, estado')
 .eq('torneo_id', Number(tournament.id))
 .eq('categoria', categoria)
 .eq('estado', 'LOCKED');

 if (statusError) throw statusError;

 const lockedGroups = Array.isArray(statusRows) ? statusRows : [];
 if (lockedGroups.length === 0) {
 throw new Error('No hay grupos en estado LOCKED para iniciar.');
 }

 const results = await Promise.all(
 lockedGroups.map((row: any) =>
 supabase.rpc('iniciar_torneo_manual', {
 p_torneo_id: Number(tournament.id),
 p_categoria: String(row.categoria),
 p_grupo: String(row.grupo),
 })
 )
 );

 const failed = results.find((result) => result.error);
 if (failed?.error) throw failed.error;

 setAdminMessage(`Torneo iniciado en ${lockedGroups.length} grupo(s).`);
 }

 refreshPanel();
 } catch (error: any) {
 setAdminError(error?.message || 'No se pudo iniciar el torneo.');
 } finally {
 setAdminActionLoading(null);
 }
 };

 const handleGeneratePlayoffs = async () => {
 if (!isAdmin) return;

 setAdminActionLoading('playoffs');
 setAdminError(null);
 setAdminMessage(null);

 try {
 const categoria = userScope?.categoria || tournament.subtitle || null;
 const grupoBase = tournamentConfig?.grupo_base || `TORNEO_${Number(tournament.id)}`;

 const { data, error } = await supabase.rpc('generar_playoffs_eliminacion_directa_torneo', {
 p_torneo_id: Number(tournament.id),
 p_categoria: categoria,
 p_grupo_base: grupoBase,
 });

 if (error) throw error;

 const row = Array.isArray(data) ? data[0] : null;
 if (row) {
 setAdminMessage(
 `Playoffs generado: ${Number(row.clasificados_totales || 0)} clasificado(s), ${Number(row.partidos_creados || 0)} cruce(s).`
 );
 } else {
 setAdminMessage('Playoffs generado correctamente.');
 }

 refreshPanel();
 } catch (error: any) {
 setAdminError(error?.message || 'No se pudo generar el playoff eliminatorio.');
 } finally {
 setAdminActionLoading(null);
 }
 };

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

 const rivalWaLink = useMemo(
   () => toWhatsAppLink(nextMatch?.rival_whatsapp),
   [nextMatch?.rival_whatsapp],
 );

 const nextMatchDateLabel = useMemo(() => {
 if (!nextMatch?.fecha_programada) return null;
 const date = new Date(nextMatch.fecha_programada);
 if (Number.isNaN(date.getTime())) return null;
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

 if (!checkingInscripcion && inscripcionPendiente && !isAdmin) {
 return (
 <div className="max-w-md mx-auto min-h-screen flex flex-col bg-background-light font-display">
 <header className="sticky top-0 z-50 bg-background-light/80 backdrop-blur-md px-4 py-4 flex items-center justify-between border-b border-gray-200 ">
 <button
 onClick={() => navigate(-1)}
 className="flex items-center text-[#111813] hover:bg-black/5 p-1 rounded-full transition-colors"
 >
 <span className="material-symbols-outlined text-2xl">arrow_back_ios</span>
 </button>
 <Logo variant="tournament" className="h-[120px] w-auto" />
 <div className="w-8"></div>
 </header>

 <main className="flex-1 p-4 flex items-center">
 <div className="w-full rounded-2xl bg-amber-50 border border-amber-200 p-6 text-center">
 <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 shadow-sm mb-3">
 <span className="material-symbols-outlined text-amber-500 text-4xl">schedule</span>
 </div>
 <h2 className="mt-2 text-xl font-bold text-amber-800">Pago en revisión</h2>
 <p className="mt-2 text-sm text-amber-700 font-medium leading-relaxed">
 Tu inscripción estará confirmada en cuanto validemos la transferencia.
 </p>
 <p className="mt-3 text-xs text-amber-600 font-semibold">
 Vas a poder acceder al panel del torneo una vez que tu pago sea aprobado.
 </p>
 </div>
 </main>
 </div>
 );
 }

 if (!isLoading && !isReady && !isAdmin) {
 return (
 <div className="max-w-md mx-auto min-h-screen flex flex-col bg-background-light font-display">
 <header className="sticky top-0 z-50 bg-background-light/80 backdrop-blur-md px-4 py-4 flex items-center justify-between border-b border-gray-200 ">
 <button
 onClick={() => navigate(-1)}
 className="flex items-center text-[#111813] hover:bg-black/5 p-1 rounded-full transition-colors"
 >
 <span className="material-symbols-outlined text-2xl">arrow_back_ios</span>
 </button>
 <Logo variant="tournament" className="h-[120px] w-auto" />
 <div className="w-8"></div>
 </header>

 <main className="flex-1 p-4 flex items-center">
 <div className="w-full rounded-2xl bg-amber-50 border border-amber-100 p-6 text-center">
 <h2 className="mt-3 text-xl font-bold text-amber-800 ">Torneo en preparación</h2>
 <p className="mt-2 text-sm text-amber-700 font-medium">
 Este torneo todavía no está listo para ver detalle deportivo. Volvé cuando la organización lo marque como activo.
 </p>
 </div>
 </main>
 </div>
 );
 }

 return (
 <div className="max-w-md mx-auto min-h-screen flex flex-col pb-24 bg-background-light transition-colors duration-300 font-display no-scrollbar overflow-y-auto">
 {/* Header */}
 <header className="sticky top-0 z-50 bg-background-light/80 backdrop-blur-md px-4 py-4 flex items-center justify-between border-b border-gray-200 ">
 <button
 onClick={() => navigate(-1)}
 className="flex items-center text-[#111813] hover:bg-black/5 p-1 rounded-full transition-colors"
 >
 <span className="material-symbols-outlined text-2xl">arrow_back_ios</span>
 </button>
 <Logo variant="tournament" className="h-[120px] w-auto" />
 <div className="w-8"></div>
 </header>

 <main className="flex-1 p-4 space-y-6">
 {/* Tournament Highlight Card */}
 <section className="">
 <div className="relative overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 ">
 <div
 className="w-full h-32 bg-cover bg-center"
 style={{ backgroundImage: `url("${tournament.image || '/images/tournament-default.jpg'}")` }}
 ></div>
 <div className="p-5">
 <div className="flex flex-col gap-1">
 <span className="text-primary text-xs font-bold uppercase tracking-widest">{tournamentPhaseLabel}</span>
 <h2 className="text-xl font-bold leading-tight text-[#111813] ">{tournament.title}</h2>
 <div className="flex items-center gap-2 mt-1">
 <span className="bg-primary/10 text-[#4a9c40] px-2 py-0.5 rounded text-xs font-semibold">{userScope?.categoria || tournament.subtitle || 'Categoría general'}</span>
 </div>
 </div>
 </div>
 </div>
 </section>

 {isAdmin && (
 <section className="space-y-3">
 <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
 <div className="flex items-center justify-between gap-3">
 <div>
 <p className="text-xs font-bold uppercase tracking-widest text-slate-500 ">Admin</p>
 <h3 className="text-base font-bold text-slate-900 ">Control de Sorteo</h3>
 </div>
 <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">Admin</span>
 </div>

 <div className="grid grid-cols-2 gap-3 text-xs text-slate-600 ">
 <div className="rounded-lg bg-white border border-slate-200 p-3">
 <p className="font-bold uppercase tracking-wide text-slate-500 ">Jugadores por grupo</p>
 <p className="mt-1 text-lg font-bold text-slate-900 ">{tournamentConfig?.jugadores_por_grupo || '-'}</p>
 </div>
 <div className="rounded-lg bg-white border border-slate-200 p-3">
 <p className="font-bold uppercase tracking-wide text-slate-500 ">Modo grupos</p>
 <p className="mt-1 text-sm font-bold text-slate-900 ">
 {tournamentConfig?.sortear_grupos_en_sorteo ? 'Diferido al sorteo' : 'Asignación inmediata'}
 </p>
 </div>
 <div className="rounded-lg bg-white border border-slate-200 p-3">
 <p className="font-bold uppercase tracking-wide text-slate-500 ">Clasifican por grupo</p>
 <p className="mt-1 text-lg font-bold text-slate-900 ">{tournamentConfig?.clasificados_por_grupo || '-'}</p>
 </div>
 <div className="rounded-lg bg-white border border-slate-200 p-3">
 <p className="font-bold uppercase tracking-wide text-slate-500 ">Etapa final</p>
 <p className="mt-1 text-sm font-bold text-slate-900 ">
 {tournamentConfig?.crear_playoffs_eliminacion_directa ? 'Eliminacion directa' : 'Sin playoffs'}
 </p>
 </div>
 <div className="rounded-lg bg-white border border-slate-200 p-3 col-span-2">
 <p className="font-bold uppercase tracking-wide text-slate-500 ">Grupo base visible</p>
 <p className="mt-1 text-sm font-bold text-slate-900 ">{tournamentConfig?.grupo_base || 'Sin definir'}</p>
 <p className="mt-1 text-[11px] text-slate-500 break-all">{tournamentConfig?.grupo_base_id || 'Sin grupo_base_id'}</p>
 </div>
 </div>

 {groupStatuses.length > 0 && (
 <div className="rounded-lg bg-white border border-slate-200 p-3">
 <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Grupos</p>
 <div className="space-y-2">
 {groupStatuses.map((row) => (
 <div key={`${row.categoria}-${row.grupo}`} className="flex items-center justify-between gap-3 text-sm">
 <div>
 <p className="font-semibold text-slate-900 ">{row.grupo}</p>
 <p className="text-xs text-slate-500 ">{row.current_participantes} jugadores</p>
 </div>
 <span className="text-xs font-bold uppercase tracking-wide text-slate-600 ">{normalizeStatus(row.estado)}</span>
 </div>
 ))}
 </div>
 </div>
 )}

 {adminMessage && <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-sm font-medium text-emerald-700 ">{adminMessage}</div>}
 {adminError && <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm font-medium text-red-700 ">{adminError}</div>}

 <div className="grid grid-cols-1 gap-3">
 <button
 onClick={handleDrawGroupsAndFixture}
 disabled={adminActionLoading !== null || !tournamentConfig?.sortear_grupos_en_sorteo}
 className="w-full rounded-lg bg-[#4a9c40] text-white font-bold py-3 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
 >
 {adminActionLoading === 'draw' ? 'Sorteando...' : 'Sortear Grupos y Fixture'}
 </button>
 <button
 onClick={handleGeneratePlayoffs}
 disabled={adminActionLoading !== null || !tournamentConfig?.crear_playoffs_eliminacion_directa}
 className="w-full rounded-lg bg-indigo-700 text-white font-bold py-3 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
 >
 {adminActionLoading === 'playoffs' ? 'Generando cruces...' : 'Generar Cruces Playoffs'}
 </button>
 <button
 onClick={handleStartTournament}
 disabled={adminActionLoading !== null || !groupStatuses.some((row) => normalizeStatus(row.estado) === 'LOCKED')}
 className="w-full rounded-lg bg-slate-900 text-white font-bold py-3 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
 >
 {adminActionLoading === 'start' ? 'Iniciando...' : 'Iniciar Torneo'}
 </button>
 </div>
 </div>
 </section>
 )}

 {/* Banner: usuario envió resultado, esperando confirmación del rival */}
 {isUserWaitingRivalConfirm && !loadingProposal && (
 <section className="space-y-4">
 <h3 className="text-lg font-bold tracking-tight px-1 text-[#111813] ">Resumen del Partido</h3>
 <div className="space-y-3">
 <div className="text-center bg-gradient-to-b from-amber-50 to-transparent p-6 rounded-2xl border border-amber-200 ">
 <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 shadow-sm mb-3">
 <span className="material-symbols-outlined text-amber-500 text-4xl">schedule</span>
 </div>
 <h2 className="font-bold text-2xl tracking-tight text-[#111813] uppercase">
 Resultado enviado
 </h2>
 <p className="text-amber-600 text-sm font-medium mt-1">
 Esperá que tu rival confirme el marcador
 </p>
 </div>
 <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 relative overflow-hidden">
 <div className="absolute top-0 right-0 p-3 opacity-10">
 <span className="material-symbols-outlined text-4xl">format_quote</span>
 </div>
 <h3 className="font-bold text-[#111813] tracking-tight uppercase mb-2 flex items-center gap-2 text-sm">
 <span className="material-symbols-outlined text-amber-500">info</span>
 Pendiente de confirmación
 </h3>
 <p className="text-amber-700 text-sm leading-relaxed">
 Cargaste el resultado del partido. Cuando tu rival lo confirme, el partido quedará cerrado.
 </p>
 </div>
 </div>
 </section>
 )}

 {/* Banner: rival envió resultado, usuario debe confirmarlo */}
 {isUserMustConfirm && !loadingProposal && (
 <section className="space-y-4">
 <h3 className="text-lg font-bold tracking-tight px-1 text-[#111813] ">Resumen del Partido</h3>
 <div className="space-y-3">
 <div className="text-center bg-gradient-to-b from-sky-50 to-transparent p-6 rounded-2xl border border-sky-200 ">
 <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-sky-100 shadow-sm mb-3 animate-pulse">
 <span className="material-symbols-outlined text-sky-500 text-4xl">pending_actions</span>
 </div>
 <h2 className="font-bold text-2xl tracking-tight text-[#111813] uppercase">
 Confirmá el resultado
 </h2>
 <p className="text-sky-600 text-sm font-medium mt-1">
 Tu rival cargó el marcador. Revisalo y confirmalo
 </p>
 </div>
 <div className="bg-sky-50 p-4 rounded-xl border border-sky-200 relative overflow-hidden">
 <div className="absolute top-0 right-0 p-3 opacity-10">
 <span className="material-symbols-outlined text-4xl">format_quote</span>
 </div>
 <h3 className="font-bold text-[#111813] tracking-tight uppercase mb-2 flex items-center gap-2 text-sm">
 <span className="material-symbols-outlined text-sky-500">info</span>
 Acción requerida
 </h3>
 <p className="text-sky-700 text-sm leading-relaxed">
 Tu rival ya ingresó el marcador. Entrá al partido, revisá el resultado y confirmalo o rechazalo.
 </p>
 </div>
 <button
 onClick={() => navigate('/match-result', { state: { tournament, partidoId: pendingConfirmMatch?.id, jornada: pendingConfirmMatch?.jornada, currentUserId } })}
 className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-sky-500 text-white font-bold text-sm shadow-md hover:bg-sky-600 active:scale-[0.98] transition-all"
 >
 <span className="material-symbols-outlined text-lg">check_circle</span>
 Ir a confirmar
 </button>
 </div>
 </section>
 )}

 {/* Quick Action Grid 2x2 */}
 <section className="grid grid-cols-2 gap-4">
 <button 
 onClick={() => navigate('/fixture', { state: { tournament } })}
 className="flex flex-col items-center justify-center gap-3 p-6 bg-white rounded-xl shadow-sm border border-gray-100 active:scale-95 transition-transform group"
 >
 <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-[#4a9c40] group-hover:bg-primary/20 transition-colors">
 <span className="material-symbols-outlined text-3xl">calendar_month</span>
 </div>
 <span className="text-sm font-semibold text-center text-[#111813] ">Fixture y Fechas</span>
 </button>
 
 <button 
 onClick={() => navigate('/standings', { state: { tournament } })}
 className="flex flex-col items-center justify-center gap-3 p-6 bg-white rounded-xl shadow-sm border border-gray-100 active:scale-95 transition-transform group"
 >
 <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-[#4a9c40] group-hover:bg-primary/20 transition-colors">
 <span className="material-symbols-outlined text-3xl">emoji_events</span>
 </div>
 <span className="text-sm font-semibold text-center text-[#111813] ">Tabla de Posiciones</span>
 </button>
 
 <button
 onClick={() => navigate('/match-result', { state: { tournament } })}
 className="flex flex-col items-center justify-center gap-3 p-6 bg-white rounded-xl shadow-sm border border-gray-100 active:scale-95 transition-transform group"
 >
 <div className="size-12 rounded-full flex items-center justify-center transition-colors shadow-md bg-[#4a9c40] text-white group-hover:bg-[#3d8b33]">
 <span className="material-symbols-outlined text-3xl">sports_tennis</span>
 </div>
 <span className="text-sm font-semibold text-center text-[#111813] ">Cargar Resultado</span>
 </button>
 
 <button 
 onClick={() => navigate('/rules')}
 className="flex flex-col items-center justify-center gap-3 p-6 bg-white rounded-xl shadow-sm border border-gray-100 active:scale-95 transition-transform group"
 >
 <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-[#4a9c40] group-hover:bg-primary/20 transition-colors">
 <span className="material-symbols-outlined text-3xl">info</span>
 </div>
 <span className="text-sm font-semibold text-center text-[#111813] ">Reglamento y FAQ</span>
 </button>
 </section>

 {loadingNextMatch ? (
 <section className="space-y-4">
 <div className="h-6 w-48 bg-gray-200 rounded animate-pulse"></div>
 <div className="h-28 bg-gray-100 rounded-xl animate-pulse"></div>
 </section>
 ) : (isEliminated || noPlayoffMatch || isCampeon || isFinalista || (isWaiting && !matchIsWaitingValidation)) ? (
 /* ── Resumen del torneo (eliminado / campeón / finalista / esperando ronda) ── */
 <section className="space-y-4">
 {/* Banner de campeón visible para todos excepto el propio campeón */}
 {!isCampeon && tournamentChampion && (
 <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
 <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
 <span className="material-symbols-outlined text-amber-500 text-2xl">emoji_events</span>
 </div>
 <div>
 <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 ">Campeón del Torneo</p>
 <p className="font-black text-sm text-amber-900 uppercase">{tournamentChampion}</p>
 </div>
 </div>
 )}
 {tournamentStats ? (
 <>
 <h3 className="text-lg font-bold tracking-tight px-1 text-[#111813] ">Resumen del Torneo</h3>
 <div className="space-y-3">
 {/* Hero */}
 <div className="text-center bg-gradient-to-b from-[#f0fdf4] to-transparent p-6 rounded-2xl border border-[#dbe6de] ">
 <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full shadow-sm mb-3 ${
 isCampeon ? 'bg-amber-100 ' : isFinalista ? 'bg-indigo-100 ' : isWaiting ? 'bg-blue-100 ' : 'bg-[#e8f6eb] '
 }`}>
 <span className={`material-symbols-outlined text-4xl ${
 isCampeon ? 'text-amber-500' : isFinalista ? 'text-indigo-500' : isWaiting ? 'text-blue-500' : 'text-[#61896b]'
 }`}>
 {isCampeon ? 'emoji_events' : isFinalista ? 'military_tech' : isWaiting ? 'hourglass_top' : 'sports_tennis'}
 </span>
 </div>
 <h2 className="font-bold text-2xl tracking-tight text-[#111813] uppercase">
 {isCampeon ? '¡Campeón!' : isFinalista ? '¡Finalista!' : isWaiting ? 'Avanzaste de ronda' : (tournamentStats.wins > tournamentStats.losses ? 'Gran Torneo' : 'Fin del Torneo')}
 </h2>
 <p className="text-[#61896b] text-sm font-medium mt-1">
 {isCampeon ? `¡Ganaste ${tournament.title}!` : isFinalista ? `Llegaste a la Final de ${tournament.title}` : isWaiting ? 'Esperá que se generen los próximos cruces' : 'No avanzaste a la siguiente ronda'}
 </p>
 </div>

 {/* Stats Cards */}
 <div className="bg-white p-4 rounded-xl shadow-sm border border-[#dbe6de] flex items-center justify-between">
 <div className="flex items-center gap-4">
 <div className="w-11 h-11 rounded-lg bg-[#e8f6eb] flex items-center justify-center text-[#61896b]">
 <span className="material-symbols-outlined">sports_tennis</span>
 </div>
 <div>
 <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Partidos</p>
 <p className="text-base font-bold text-[#111813] ">{tournamentStats.totalMatches} Jugados</p>
 </div>
 </div>
 </div>

 <div className="bg-white p-4 rounded-xl shadow-sm border border-[#dbe6de] flex items-center justify-between border-l-[5px] border-l-[#13ec49]">
 <div className="flex items-center gap-4">
 <div className="w-11 h-11 rounded-lg bg-[#e8f6eb] flex items-center justify-center text-[#61896b]">
 <span className="material-symbols-outlined">emoji_events</span>
 </div>
 <div>
 <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Victorias</p>
 <p className="text-base font-bold text-[#111813] ">{tournamentStats.wins} Victorias</p>
 </div>
 </div>
 <div className="bg-[#e8f6eb] text-[#61896b] px-3 py-1 rounded-full text-xs font-bold">
 {tournamentStats.winRate}% WR
 </div>
 </div>

 <div className="bg-white p-4 rounded-xl shadow-sm border border-[#dbe6de] flex items-center justify-between">
 <div className="flex items-center gap-4">
 <div className="w-11 h-11 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
 <span className="material-symbols-outlined">close</span>
 </div>
 <div>
 <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Derrotas</p>
 <p className="text-base font-bold text-[#111813] ">{tournamentStats.losses} Derrotas</p>
 </div>
 </div>
 </div>

 <div className="bg-white p-4 rounded-xl shadow-sm border border-[#dbe6de] flex flex-col gap-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-4">
 <div className="w-11 h-11 rounded-lg bg-[#e8f6eb] flex items-center justify-center text-[#61896b]">
 <span className="material-symbols-outlined">leaderboard</span>
 </div>
 <div>
 <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Sets</p>
 <p className="text-base font-bold text-[#111813] ">{tournamentStats.setsWon}/{tournamentStats.setsWon + tournamentStats.setsLost} Ganados</p>
 </div>
 </div>
 </div>
 <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
 <div
 className="bg-[#13ec49] h-full transition-all"
 style={{
 width: `${tournamentStats.setsWon + tournamentStats.setsLost > 0
 ? (tournamentStats.setsWon / (tournamentStats.setsWon + tournamentStats.setsLost)) * 100
 : 0}%`
 }}
 />
 </div>
 </div>

 {/* Info note */}
 <div className="bg-[#e8f6eb] p-4 rounded-xl border border-[#dbe6de] relative overflow-hidden">
 <div className="absolute top-0 right-0 p-3 opacity-10">
 <span className="material-symbols-outlined text-4xl">format_quote</span>
 </div>
 <h3 className="font-bold text-[#111813] tracking-tight uppercase mb-2 flex items-center gap-2 text-sm">
 <span className="material-symbols-outlined text-[#61896b]">info</span>
 {isCampeon ? 'Campeón del torneo' : isFinalista ? 'Finalista del torneo' : isWaiting ? 'Esperando siguiente ronda' : (tournamentStatus === 'FINALIZADO' ? 'Torneo finalizado' : 'Eliminado de la competencia')}
 </h3>
 <p className="text-[#61896b] text-sm leading-relaxed">
 {isCampeon
 ? 'Felicitaciones, ganaste el torneo. Podés ver el fixture completo en la pestaña Llaves.'
 : isFinalista
 ? 'Llegaste a la Final del torneo, una actuación increíble. Podés ver el fixture completo en la pestaña Llaves.'
 : isWaiting
 ? 'Ganaste tu última serie. Los próximos cruces se generarán próximamente.'
 : tournamentStatus === 'FINALIZADO'
 ? 'Quedaste eliminado de esta competencia. Podés seguir viendo el fixture y los resultados en la pestaña Llaves.'
 : 'No avanzaste a la siguiente ronda de esta competencia, pero podés seguir viendo los resultados del torneo y las llaves en la pestaña correspondiente.'}
 </p>
 </div>
 </div>
 </>
 ) : (
 <div className="bg-[#e8f6eb] p-5 rounded-xl border border-[#dbe6de] relative overflow-hidden">
 <div className="absolute top-0 right-0 p-3 opacity-10">
 <span className="material-symbols-outlined text-4xl">format_quote</span>
 </div>
 <h3 className="font-bold text-[#111813] tracking-tight uppercase mb-2 flex items-center gap-2 text-sm">
 <span className="material-symbols-outlined text-[#61896b]">info</span>
 {isCampeon ? 'Campeón del torneo' : isFinalista ? 'Finalista del torneo' : isWaiting ? 'Esperando siguiente ronda' : (tournamentStatus === 'FINALIZADO' ? 'Torneo finalizado' : 'Eliminado de la competencia')}
 </h3>
 <p className="text-[#61896b] text-sm leading-relaxed">
 {isCampeon
 ? 'Felicitaciones, ganaste el torneo.'
 : isFinalista
 ? 'Llegaste a la Final del torneo, una actuación increíble.'
 : isWaiting
 ? 'Ganaste tu última serie. Los próximos cruces se generarán próximamente.'
 : tournamentStatus === 'FINALIZADO'
 ? 'Quedaste eliminado de esta competencia. Podés seguir viendo los resultados en la pestaña Llaves.'
 : 'No avanzaste a la siguiente ronda de esta competencia, pero podés seguir viendo los resultados del torneo y las llaves en la pestaña correspondiente.'}
 </p>
 </div>
 )}
 </section>
 ) : (
 <>
 {/* Mi Próximo Partido */}
 <section className="space-y-4">
 <h3 className="text-lg font-bold tracking-tight px-1 text-[#111813] ">{isGroupStageOngoing ? 'Fase de Grupos' : (isUserWaitingRivalConfirm || isUserMustConfirm) ? 'Contacto del Rival' : 'Mi Próximo Partido'}</h3>

 {isGroupStageOngoing ? (
 <div className="bg-sky-50 p-6 rounded-2xl border border-sky-200 relative overflow-hidden">
 <div className="absolute top-0 right-0 p-3 opacity-10">
 <span className="material-symbols-outlined text-4xl">format_quote</span>
 </div>
 <div className="text-center mb-5">
 <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-sky-100 shadow-sm mb-3">
 <span className="material-symbols-outlined text-sky-500 text-4xl">hourglass_top</span>
 </div>
 <h2 className="font-bold text-2xl tracking-tight text-[#111813] uppercase">
 Fase de Grupos
 </h2>
 <p className="text-sky-600 text-sm font-medium mt-1">
 Terminaste tus partidos de fase de grupos
 </p>
 </div>
 <div className="border-t border-sky-200 pt-4">
 <h3 className="font-bold text-[#111813] tracking-tight uppercase mb-2 flex items-center gap-2 text-sm">
 <span className="material-symbols-outlined text-sky-500">info</span>
 Clasificación en curso
 </h3>
 <p className="text-sky-700 text-sm leading-relaxed mb-4">
 {playerStatus?.mensaje || 'La clasificación se definirá cuando se jueguen todos los partidos de la fase de grupos.'}
 </p>
 <button
 onClick={() => navigate('/standings', { state: { tournament } })}
 className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-sm font-bold rounded-xl transition-colors"
 >
 Ver la Tabla de Posiciones
 </button>
 </div>
 </div>) : (
 <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 relative overflow-hidden">
 <div className="absolute top-0 left-0 w-1.5 h-full bg-[#4a9c40]"></div>
 <div className="flex justify-between items-start mb-4">
 <div className="space-y-1">
 <p className="text-xs font-bold text-[#4a9c40] uppercase tracking-wider">
 {nextMatch ? (
 nextMatch.bracket_tipo === 'eliminacion_directa' && nextMatch.stage_name
 ? nextMatch.stage_name
 : nextMatch.bracket_tipo === 'eliminacion_directa' && nextMatch.ronda
 ? `Ronda ${nextMatch.ronda}`
 : `Fecha ${nextMatch.jornada}`
 ) : 'Sin partido'}
 </p>
 <h4 className="text-lg font-bold text-[#111813] ">{nextMatch ? `vs. ${nextMatch.rival_nombre}` : 'Rival por definir'}</h4>
 {nextMatchDateLabel && <p className="text-sm text-gray-500 font-medium">{nextMatchDateLabel}</p>}
 </div>
 <div className="size-12 rounded-full bg-emerald-100 text-emerald-700 shrink-0 border-2 border-white shadow-sm flex items-center justify-center text-sm font-bold uppercase">
 {String(nextMatch?.rival_nombre || 'Rival')
 .split(' ')
 .filter(Boolean)
 .slice(0, 2)
 .map((chunk) => chunk[0])
 .join('') || 'R'}
 </div>
 </div>
 <div className="flex flex-col gap-3">
 {nextMatch ? (
 <button
 onClick={() => {
 if (rivalWaLink) window.open(rivalWaLink, '_blank', 'noopener,noreferrer');
 }}
 disabled={!rivalWaLink}
 className={`flex items-center justify-center gap-2 w-full py-3 rounded-lg font-bold transition-all active:scale-[0.98] ${
 rivalWaLink
 ? 'bg-[#25D366] text-white shadow-md hover:bg-[#20bd5a]'
 : 'bg-gray-200 text-gray-500 cursor-not-allowed'
 }`}
 >
 <svg className="size-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
 <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"></path>
 </svg>
 {rivalWaLink ? 'WhatsApp del Rival' : 'Rival sin WhatsApp'}
 </button>
 ) : null}
 </div>
 </div>
 )}
 </section>

 {/* Status Footer */}
 <section className="mt-8 text-center px-4">
 <p className="text-xs text-gray-500 font-bold uppercase tracking-wide">
 {groupPosition && groupSize > 0
 ? `Estás en la posición #${groupPosition} de ${groupSize} en tu grupo`
 : 'Posición de grupo disponible cuando haya tabla cargada'}
 </p>
 <div className="w-full h-1.5 bg-gray-200 rounded-full mt-3 overflow-hidden">
 <div
 className="bg-[#4a9c40] h-full rounded-full shadow-[0_0_8px_rgba(74,156,64,0.4)]"
 style={{ width: `${groupProgressWidth}%` }}
 ></div>
 </div>
 </section>
 </>
 )}
 </main>
 </div>
 );
};

export default TournamentPanel;