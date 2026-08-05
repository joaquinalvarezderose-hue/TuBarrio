
import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Logo from '../components/Logo';
import { PlayerStats, TIEBREAKER_CRITERIA } from '../utils/tournamentLogic';
import { supabase } from '../services/supabaseClient';
import { fixtureCache } from '../services/fixtureCache';
import BracketTab from '../components/BracketTab';
import { TournamentPreviewScope } from '../types/tournamentPreview';

type TournamentScope = {
 categoria: string;
 grupo: string;
};

type TournamentPlayerRow = {
 perfil_id: string;
 puntos: number | null;
 partidos_jugados: number | null;
 sets_ganados: number | null;
 sets_perdidos: number | null;
 games_ganados: number | null;
 games_perdidos: number | null;
};

type TournamentMatchRow = {
 jugador1_id: string | null;
 jugador2_id: string | null;
 categoria: string | null;
 grupo: string | null;
 jornada: number | null;
};

type TournamentHistoryRow = {
 categoria: string | null;
 grupo: string | null;
 jugador1_perfil_id: string | null;
 jugador2_perfil_id: string | null;
 ganador_perfil_id: string | null;
 puntos_jugador1: number | null;
 puntos_jugador2: number | null;
 sets_jugador1: number | null;
 sets_jugador2: number | null;
 sets_json?: { p1: number; p2: number }[] | null;
};

type StandingsRowProps = {
 p: any;
 idx: number;
 clasificadosPorGrupo: number;
 incluirMejoresTerceros: boolean;
};

const StandingsRow = React.memo<StandingsRowProps>(({ p, idx, clasificadosPorGrupo, incluirMejoresTerceros }) => {
 const isClassified = idx < clasificadosPorGrupo;
 const isThirdPlace = incluirMejoresTerceros && idx === clasificadosPorGrupo;
 const setDiff = p.setsWon - p.setsLost;
 const setDiffLabel = setDiff > 0 ? `+${setDiff}` : String(setDiff);
 const gamesDiff = p.gamesDiff ?? ((p.gamesWon || 0) - (p.gamesLost || 0));
 const gamesDiffLabel = gamesDiff > 0 ? `+${gamesDiff}` : String(gamesDiff);
 return (
 <tr className={isClassified ? 'bg-primary/10 ' : isThirdPlace ? 'bg-amber-50 ' : 'bg-white '}>
  <td className={`px-4 py-4 text-center font-bold sticky left-0 z-10 ${isClassified ? 'bg-emerald-50 text-emerald-700' : isThirdPlace ? 'bg-amber-50 text-amber-700' : 'bg-white '}`}>
   <div className="flex flex-col items-center gap-0.5">
    <span>{idx + 1}</span>
    {p.tiebreakerReason && (
     <span className="text-[9px] font-bold px-1 py-px rounded bg-amber-100 text-amber-700 leading-none whitespace-nowrap">
      {p.tiebreakerReason}
     </span>
    )}
   </div>
  </td>
  <td className={`px-4 py-4 sticky left-12 z-10 shadow-[8px_0_10px_-10px_rgba(0,0,0,0.35)] ${isClassified ? 'bg-emerald-50 ' : isThirdPlace ? 'bg-amber-50 ' : 'bg-white '}`}>
   <span className="text-sm font-semibold">{p.name}</span>
  </td>
  <td className="px-3 py-4 text-center text-sm">{p.pj}</td>
  <td className="px-3 py-4 text-center text-sm font-bold">{p.pts}</td>
  <td className={`px-3 py-4 text-center text-sm font-semibold ${setDiff > 0 ? 'text-emerald-600 ' : setDiff < 0 ? 'text-red-500 ' : 'text-slate-400'}`}>
   {setDiffLabel}
  </td>
  <td className="px-3 py-4 text-center text-sm">{p.setsWon}</td>
  <td className={`px-3 py-4 text-center text-sm font-bold ${gamesDiff > 0 ? 'text-emerald-600 ' : gamesDiff < 0 ? 'text-red-500 ' : 'text-slate-400'}`}>
   {gamesDiffLabel}
  </td>
 </tr>
 );
});

const getGroupOrder = (groupCode: string): number => {
 const value = String(groupCode || '').trim();
 if (!value) return Number.MAX_SAFE_INTEGER;
 const suffixMatch = value.match(/_G(\d+)$/i);
 if (!suffixMatch) return 1;
 const parsed = Number(suffixMatch[1]);
 return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.MAX_SAFE_INTEGER;
};

const getGroupLabel = (groupCode: string): string => `Grupo ${getGroupOrder(groupCode)}`;

const Standings: React.FC = () => {
 const navigate = useNavigate();
 const [activeTab, setActiveTab] = useState<'tabla' | 'llaves'>('tabla');
 const location = useLocation();
 const previewScope = location.state?.previewScope as TournamentPreviewScope | undefined;
 const previewMode = Boolean(previewScope?.previewMode);

 const [dbRows, setDbRows] = useState<any[] | null>(null);
 const [dbLoadError, setDbLoadError] = useState<string | null>(null);
 const [rawHistorial, setRawHistorial] = useState<TournamentHistoryRow[]>([]);
 const [isLoading, setIsLoading] = useState(true);
 const [scope, setScope] = useState<TournamentScope | null>(null);
 const [availableGroups, setAvailableGroups] = useState<string[]>([]);
 const [selectedGroup, setSelectedGroup] = useState<string>(previewScope?.grupo || '');
 const [currentUserId, setCurrentUserId] = useState<string>('');
 const [clasificadosPorGrupo, setClasificadosPorGrupo] = useState<number>(2);
 const [incluirMejoresTerceros, setIncluirMejoresTerceros] = useState<boolean>(false);
 const [cantidadMejoresTerceros, setCantidadMejoresTerceros] = useState<number>(0);
 const [modalidad, setModalidad] = useState<'singles' | 'dobles'>('singles');

 const savedTournament = localStorage.getItem('active_tournament');
 const tournament = location.state?.tournament || (savedTournament ? JSON.parse(savedTournament) : null);

 useEffect(() => {
 if (!tournament) {
 navigate('/tournaments', { replace: true });
 }
 }, [tournament, navigate]);

 const initialPlayers: PlayerStats[] = [];

 // Version dobles de la carga de tabla: espejo de loadDbStandings pero
 // rankeando torneo_equipos en vez de torneo_jugadores (parejas en vez de jugadores).
 const loadDbStandingsDobles = async (parsedTournamentId: number) => {
 let currentUserIdLocal = '';
 let resolvedScope: TournamentScope | null = null;

 if (previewMode) {
 resolvedScope = { categoria: previewScope!.categoria, grupo: previewScope!.grupo };
 } else {
 try {
 const { data } = await supabase.auth.getUser();
 currentUserIdLocal = String(data?.user?.id || '');
 } catch {
 // ignore
 }
 if (!currentUserIdLocal) {
 try {
 const appUserRaw = localStorage.getItem('app_user');
 const appUser = appUserRaw ? JSON.parse(appUserRaw) : null;
 currentUserIdLocal = String(appUser?.id || '');
 } catch {
 // ignore
 }
 }
 if (currentUserIdLocal) setCurrentUserId(currentUserIdLocal);

 if (currentUserIdLocal) {
 const { data: equipoScopeRows } = await supabase
 .from('torneo_equipos')
 .select('id, categoria, grupo')
 .eq('torneo_id', parsedTournamentId)
 .or(`jugador1_id.eq.${currentUserIdLocal},jugador2_id.eq.${currentUserIdLocal}`)
 .limit(1);

 const es = Array.isArray(equipoScopeRows) ? equipoScopeRows[0] : null;
 if (es?.categoria && es?.grupo) {
 resolvedScope = { categoria: String(es.categoria), grupo: String(es.grupo) };
 }
 }
 }

 setScope(resolvedScope);
 const targetCategory = String(resolvedScope?.categoria || tournament.subtitle || '').trim();

 let groupsQuery: any = supabase
 .from('torneo_estado')
 .select('grupo, categoria')
 .eq('torneo_id', parsedTournamentId);
 if (targetCategory) groupsQuery = groupsQuery.eq('categoria', targetCategory);
 const { data: groupsRows, error: groupsError } = await groupsQuery;
 if (!groupsError) {
 const groups = Array.from(
 new Set<string>((groupsRows || []).map((row: any) => String(row?.grupo || '').trim()).filter(Boolean))
 ).sort((a, b) => getGroupOrder(a) - getGroupOrder(b));
 setAvailableGroups(groups);
 if (!selectedGroup && resolvedScope?.grupo && groups.includes(String(resolvedScope.grupo))) {
 setSelectedGroup(String(resolvedScope.grupo));
 }
 }

 const effectiveGroup = selectedGroup || resolvedScope?.grupo || '';

 let equiposQuery: any = supabase
 .from('torneo_equipos')
 .select('id, jugador1_id, jugador2_id, puntos, partidos_jugados, sets_ganados, sets_perdidos, games_ganados, games_perdidos')
 .eq('torneo_id', parsedTournamentId);
 if (resolvedScope?.categoria) equiposQuery = equiposQuery.eq('categoria', resolvedScope.categoria);
 if (effectiveGroup) equiposQuery = equiposQuery.eq('grupo', effectiveGroup);

 const [{ data: equiposData, error: equiposError }, configResp] = await Promise.all([
 equiposQuery,
 supabase
 .from('torneo_configuracion')
 .select('clasificados_por_grupo, incluir_mejores_terceros, cantidad_mejores_terceros')
 .eq('torneo_id', parsedTournamentId)
 .limit(1),
 ]);

 if (equiposError) throw equiposError;

 const configRows = configResp.data as any[] | null;
 if (configRows?.[0]?.clasificados_por_grupo) {
 setClasificadosPorGrupo(Number(configRows[0].clasificados_por_grupo));
 }
 setIncluirMejoresTerceros(Boolean(configRows?.[0]?.incluir_mejores_terceros));
 setCantidadMejoresTerceros(Number(configRows?.[0]?.cantidad_mejores_terceros ?? 0));

 const equipos = Array.isArray(equiposData) ? equiposData : [];

 if (equipos.length === 0) {
 setDbRows([]);
 return;
 }

 const allJugadorIds = Array.from(new Set(
 equipos.flatMap((r: any) => [r.jugador1_id, r.jugador2_id]).filter(Boolean)
 ));
 let perfiles: any[] = [];
 if (allJugadorIds.length > 0) {
 const { data: perfilesData, error: perfilesError } = await supabase
 .from('perfiles')
 .select('id, nombre_completo')
 .in('id', allJugadorIds);
 if (perfilesError) throw perfilesError;
 perfiles = perfilesData || [];
 }
 const nombreByJugadorId = Object.fromEntries(perfiles.map((p: any) => [p.id, p.nombre_completo || 'Jugador']));

 const mapped = equipos.map((row: any, idx: number) => ({
 id: row.id || `equipo-${idx}`,
 name: `${nombreByJugadorId[row.jugador1_id] || 'Jugador'} / ${nombreByJugadorId[row.jugador2_id] || 'Jugador'}`,
 pj: Number(row.partidos_jugados || 0),
 pts: Number(row.puntos || 0),
 setsWon: Number(row.sets_ganados || 0),
 setsLost: Number(row.sets_perdidos || 0),
 gamesWon: Number(row.games_ganados || 0),
 gamesLost: Number(row.games_perdidos || 0),
 matches: [],
 }));

 setDbRows(mapped);
 setDbLoadError(null);

 let historyQuery: any = supabase
 .from('torneo_partidos_historial')
 .select('categoria, grupo, equipo1_id, equipo2_id, equipo_ganador_id')
 .eq('torneo_id', parsedTournamentId);
 if (resolvedScope?.categoria) historyQuery = historyQuery.eq('categoria', resolvedScope.categoria);
 if (effectiveGroup) historyQuery = historyQuery.eq('grupo', effectiveGroup);
 const { data: historyRows, error: historyError } = await historyQuery;
 if (historyError) throw historyError;

 const reshapedHistory: TournamentHistoryRow[] = ((historyRows || []) as any[]).map((row) => ({
 categoria: row.categoria,
 grupo: row.grupo,
 jugador1_perfil_id: row.equipo1_id,
 jugador2_perfil_id: row.equipo2_id,
 ganador_perfil_id: row.equipo_ganador_id,
 puntos_jugador1: null,
 puntos_jugador2: null,
 sets_jugador1: null,
 sets_jugador2: null,
 }));
 setRawHistorial(reshapedHistory);

 fixtureCache.set(`standings-${parsedTournamentId}-${selectedGroup}`, {
 rows: mapped,
 historial: reshapedHistory,
 });
 };

 const loadDbStandings = useCallback(async () => {
 try {
 if (!tournament) {
 setDbRows([]);
 return;
 }
 const parsedTournamentId = Number(tournament.id);
 if (!Number.isFinite(parsedTournamentId)) {
 setDbRows([]);
 return;
 }

 // Mostrar datos del caché de inmediato si existen
 const standingsCacheKey = `standings-${parsedTournamentId}-${selectedGroup}`;
 const cachedStandings = fixtureCache.get<{ rows: any[]; historial: TournamentHistoryRow[] }>(standingsCacheKey);
 if (cachedStandings) {
 setDbRows(cachedStandings.rows);
 setRawHistorial(cachedStandings.historial);
 setIsLoading(false);
 }

 let isDobles = false;
 try {
 const { data: configRow } = await supabase
 .from('torneo_configuracion')
 .select('modalidad')
 .eq('torneo_id', parsedTournamentId)
 .maybeSingle();
 isDobles = configRow?.modalidad === 'dobles';
 } catch {
 isDobles = false;
 }
 setModalidad(isDobles ? 'dobles' : 'singles');

 if (isDobles) {
 await loadDbStandingsDobles(parsedTournamentId);
 return;
 }

 let currentUserId = '';
 let resolvedScope: TournamentScope | null = null;

 if (previewMode) {
 resolvedScope = {
 categoria: previewScope.categoria,
 grupo: previewScope.grupo,
 };
 } else {
 try {
 const { data } = await supabase.auth.getUser();
 currentUserId = String(data?.user?.id || '');
 } catch {
 // ignore
 }

 if (!currentUserId) {
 try {
 const appUserRaw = localStorage.getItem('app_user');
 const appUser = appUserRaw ? JSON.parse(appUserRaw) : null;
 currentUserId = String(appUser?.id || '');
 } catch {
 // ignore
 }
 }

 if (currentUserId) setCurrentUserId(currentUserId);

 if (currentUserId) {
 const { data: playerScopeRows } = await supabase
 .from('torneo_jugadores')
 .select('categoria, grupo')
 .eq('torneo_id', parsedTournamentId)
 .eq('perfil_id', currentUserId)
 .limit(1);

 const playerScope = Array.isArray(playerScopeRows) ? playerScopeRows[0] : null;
 if (playerScope?.categoria && playerScope?.grupo) {
 resolvedScope = {
 categoria: String(playerScope.categoria),
 grupo: String(playerScope.grupo),
 };
 }
 }

 if (!resolvedScope && currentUserId) {
 const { data: inscriptionScopeRows } = await supabase
 .from('inscripciones_torneo')
 .select('categoria, grupo')
 .eq('torneo_id', parsedTournamentId)
 .eq('perfil_id', currentUserId)
 .in('estado', ['pagado_aprobado', 'pendiente_revision'])
 .limit(1);

 const inscriptionScope = Array.isArray(inscriptionScopeRows) ? inscriptionScopeRows[0] : null;
 if (inscriptionScope?.categoria && inscriptionScope?.grupo) {
 resolvedScope = {
 categoria: String(inscriptionScope.categoria),
 grupo: String(inscriptionScope.grupo),
 };
 }
 }
 }

 setScope(resolvedScope);
 const targetCategory = String(resolvedScope?.categoria || tournament.subtitle || '').trim();

 let groupsQuery: any = supabase
 .from('torneo_estado')
 .select('grupo, categoria')
 .eq('torneo_id', parsedTournamentId);
 if (targetCategory) groupsQuery = groupsQuery.eq('categoria', targetCategory);
 const { data: groupsRows, error: groupsError } = await groupsQuery;
 if (!groupsError) {
 const groups = Array.from(
 new Set<string>(
 (groupsRows || [])
 .map((row: any) => String(row?.grupo || '').trim())
 .filter(Boolean)
 )
 ).sort((a, b) => getGroupOrder(a) - getGroupOrder(b));
 setAvailableGroups(groups);
 if (!selectedGroup && resolvedScope?.grupo && groups.includes(String(resolvedScope.grupo))) {
 setSelectedGroup(String(resolvedScope.grupo));
 }
 }

 let participantIds: string[] = [];
 let partidosRows: TournamentMatchRow[] = [];

 // Cargar todos los partidos del grupo seleccionado, no solo los del usuario
 let partidosQuery: any = supabase
 .from('partidos')
 .select('jugador1_id, jugador2_id, categoria, grupo, jornada')
 .eq('torneo_id', parsedTournamentId)
 .is('bracket_tipo', null)
 .order('jornada', { ascending: true });

 if (resolvedScope?.categoria) partidosQuery = partidosQuery.eq('categoria', resolvedScope.categoria);
 if (selectedGroup) {
 partidosQuery = partidosQuery.eq('grupo', selectedGroup);
 } else if (resolvedScope?.grupo) {
 partidosQuery = partidosQuery.eq('grupo', resolvedScope.grupo);
 }

 const { data: allMatchRows, error: allMatchError } = await partidosQuery;
 if (allMatchError) throw allMatchError;
 partidosRows = Array.isArray(allMatchRows) ? allMatchRows : [];

 if (!resolvedScope && partidosRows[0]?.categoria && partidosRows[0]?.grupo) {
 resolvedScope = {
 categoria: String(partidosRows[0].categoria),
 grupo: String(partidosRows[0].grupo),
 };
 setScope(resolvedScope);
 }

 participantIds = Array.from(new Set(
 partidosRows.flatMap((row) => [row.jugador1_id, row.jugador2_id]).filter(Boolean).map((id) => String(id))
 ));

 let standingsQuery: any = supabase
 .from('torneo_jugadores')
 .select('perfil_id, puntos, partidos_jugados, sets_ganados, sets_perdidos, games_ganados, games_perdidos')
 .eq('torneo_id', parsedTournamentId);

 if (resolvedScope?.categoria) standingsQuery = standingsQuery.eq('categoria', resolvedScope.categoria);
 if (selectedGroup) {
 standingsQuery = standingsQuery.eq('grupo', selectedGroup);
 } else if (resolvedScope?.grupo) {
 standingsQuery = standingsQuery.eq('grupo', resolvedScope.grupo);
 }

 const [{ data, error }, configResp] = await Promise.all([
 standingsQuery,
 supabase
 .from('torneo_configuracion')
 .select('clasificados_por_grupo, incluir_mejores_terceros, cantidad_mejores_terceros')
 .eq('torneo_id', parsedTournamentId)
 .limit(1),
 ]);

 if (error || !data) {
 setDbRows([]);
 return;
 }

 const configRows = configResp.data as any[] | null;
 if (configRows?.[0]?.clasificados_por_grupo) {
 setClasificadosPorGrupo(Number(configRows[0].clasificados_por_grupo));
 }
 setIncluirMejoresTerceros(Boolean(configRows?.[0]?.incluir_mejores_terceros));
 setCantidadMejoresTerceros(Number(configRows?.[0]?.cantidad_mejores_terceros ?? 0));

 const rowsByProfile = new Map<string, TournamentPlayerRow>();
 const mergeRows = (rows: TournamentPlayerRow[]) => {
 for (const row of rows) {
 const perfilId = String(row?.perfil_id || '');
 if (!perfilId) continue;
 const prev = rowsByProfile.get(perfilId);
 if (!prev) {
 rowsByProfile.set(perfilId, row);
 continue;
 }

 rowsByProfile.set(perfilId, {
 ...prev,
 puntos: Math.max(Number(prev.puntos || 0), Number(row.puntos || 0)),
 partidos_jugados: Math.max(Number(prev.partidos_jugados || 0), Number(row.partidos_jugados || 0)),
 sets_ganados: Math.max(Number(prev.sets_ganados || 0), Number(row.sets_ganados || 0)),
 sets_perdidos: Math.max(Number(prev.sets_perdidos || 0), Number(row.sets_perdidos || 0)),
 games_ganados: Math.max(Number(prev.games_ganados || 0), Number(row.games_ganados || 0)),
 games_perdidos: Math.max(Number(prev.games_perdidos || 0), Number(row.games_perdidos || 0)),
 });
 }
 };

 mergeRows((data || []) as TournamentPlayerRow[]);

 let uniqueRows = Array.from(rowsByProfile.values());

 if (participantIds.length > 0 && uniqueRows.length < participantIds.length) {
 const { data: participantRows, error: participantRowsError } = await supabase
 .from('torneo_jugadores')
 .select('perfil_id, puntos, partidos_jugados, sets_ganados, sets_perdidos, games_ganados, games_perdidos')
 .eq('torneo_id', parsedTournamentId)
 .in('perfil_id', participantIds);

 if (participantRowsError) throw participantRowsError;
 mergeRows((participantRows || []) as TournamentPlayerRow[]);
 uniqueRows = participantIds.map((perfilId) => rowsByProfile.get(perfilId)).filter(Boolean) as TournamentPlayerRow[];
 }

 const effectiveGroup = selectedGroup || resolvedScope?.grupo || '';

 if (uniqueRows.length === 0 && resolvedScope && effectiveGroup) {
 const { data: approvedPlayers, error: approvedPlayersError } = await supabase
 .from('inscripciones_torneo')
 .select('perfil_id')
 .eq('torneo_id', parsedTournamentId)
 .eq('categoria', resolvedScope.categoria)
 .eq('grupo', effectiveGroup)
 .in('estado', ['pagado_aprobado', 'pendiente_revision']);

 if (approvedPlayersError) throw approvedPlayersError;

 participantIds = Array.from(new Set(
 (approvedPlayers || []).map((row: any) => String(row?.perfil_id || '')).filter(Boolean)
 ));

 if (participantIds.length > 0) {
 const seededRows = participantIds.map((perfilId) => ({
 perfil_id: perfilId,
 puntos: 0,
 partidos_jugados: 0,
 sets_ganados: 0,
 sets_perdidos: 0,
 games_ganados: 0,
 games_perdidos: 0,
 }));
 mergeRows(seededRows);
 uniqueRows = participantIds.map((perfilId) => rowsByProfile.get(perfilId)).filter(Boolean) as TournamentPlayerRow[];
 }
 }

 if (uniqueRows.length < 2 && participantIds.length === 0 && currentUserId) {
 const { data: fallbackMatches, error: fallbackMatchesError } = await supabase
 .from('partidos')
 .select('jugador1_id, jugador2_id, categoria, grupo, jornada')
 .eq('torneo_id', parsedTournamentId)
 .or(`jugador1_id.eq.${currentUserId},jugador2_id.eq.${currentUserId}`)
 .order('jornada', { ascending: true });

 if (fallbackMatchesError) throw fallbackMatchesError;

 const firstMatch = Array.isArray(fallbackMatches) ? fallbackMatches[0] : null;
 if (firstMatch?.categoria && firstMatch?.grupo) {
 resolvedScope = {
 categoria: String(firstMatch.categoria),
 grupo: String(firstMatch.grupo),
 };
 setScope(resolvedScope);
 }

 participantIds = Array.from(new Set(
 (fallbackMatches || []).flatMap((row: any) => [row.jugador1_id, row.jugador2_id]).filter(Boolean).map((id: any) => String(id))
 ));

 if (participantIds.length > 0) {
 const { data: participantRows, error: participantRowsError } = await supabase
 .from('torneo_jugadores')
 .select('perfil_id, puntos, partidos_jugados, sets_ganados, sets_perdidos, games_ganados, games_perdidos')
 .eq('torneo_id', parsedTournamentId)
 .in('perfil_id', participantIds);

 if (participantRowsError) throw participantRowsError;
 mergeRows((participantRows || []) as TournamentPlayerRow[]);
 uniqueRows = participantIds.map((perfilId) => rowsByProfile.get(perfilId) || {
 perfil_id: perfilId,
 puntos: 0,
 partidos_jugados: 0,
 sets_ganados: 0,
 sets_perdidos: 0,
 games_ganados: 0,
 games_perdidos: 0,
 }).filter(Boolean) as TournamentPlayerRow[];
 }
 }

 let historyQuery: any = supabase
 .from('torneo_partidos_historial')
 .select('categoria, grupo, jugador1_perfil_id, jugador2_perfil_id, ganador_perfil_id, puntos_jugador1, puntos_jugador2, sets_jugador1, sets_jugador2, sets_json')
 .eq('torneo_id', parsedTournamentId);
 if (resolvedScope?.categoria) historyQuery = historyQuery.eq('categoria', resolvedScope.categoria);
 if (effectiveGroup) historyQuery = historyQuery.eq('grupo', effectiveGroup);
 const { data: historyRows, error: historyError } = await historyQuery;

 if (historyError) throw historyError;

 if (Array.isArray(historyRows) && historyRows.length > 0) {
 const scopedHistoryRows = (historyRows as TournamentHistoryRow[]).filter((row) => {
 const matchesScope = Boolean(
 resolvedScope?.categoria &&
 effectiveGroup &&
 row.categoria === resolvedScope.categoria &&
 row.grupo === effectiveGroup
 );

 if (matchesScope) return true;

 if (participantIds.length > 0) {
 return participantIds.includes(String(row.jugador1_perfil_id || '')) || participantIds.includes(String(row.jugador2_perfil_id || ''));
 }

 return !resolvedScope;
 });

 const historyAggByProfile = new Map<string, TournamentPlayerRow>();
 const addHistory = (
 perfilIdRaw: string | null,
 puntosRaw: number | null,
 setsGanadosRaw: number | null,
 setsPerdidosRaw: number | null,
 gamesGanadosRaw: number,
 gamesPerdidosRaw: number,
 ) => {
 const perfilId = String(perfilIdRaw || '');
 if (!perfilId) return;
 const prev = historyAggByProfile.get(perfilId) || {
 perfil_id: perfilId,
 puntos: 0,
 partidos_jugados: 0,
 sets_ganados: 0,
 sets_perdidos: 0,
 games_ganados: 0,
 games_perdidos: 0,
 };

 historyAggByProfile.set(perfilId, {
 perfil_id: perfilId,
 puntos: Number(prev.puntos || 0) + Number(puntosRaw || 0),
 partidos_jugados: Number(prev.partidos_jugados || 0) + 1,
 sets_ganados: Number(prev.sets_ganados || 0) + Number(setsGanadosRaw || 0),
 sets_perdidos: Number(prev.sets_perdidos || 0) + Number(setsPerdidosRaw || 0),
 games_ganados: Number(prev.games_ganados || 0) + gamesGanadosRaw,
 games_perdidos: Number(prev.games_perdidos || 0) + gamesPerdidosRaw,
 });
 };

 for (const row of scopedHistoryRows) {
 const sets = Array.isArray(row.sets_json) ? row.sets_json : [];
 const gamesJ1 = sets.reduce((sum, s) => sum + Number(s?.p1 || 0), 0);
 const gamesJ2 = sets.reduce((sum, s) => sum + Number(s?.p2 || 0), 0);
 addHistory(row.jugador1_perfil_id, row.puntos_jugador1, row.sets_jugador1, row.sets_jugador2, gamesJ1, gamesJ2);
 addHistory(row.jugador2_perfil_id, row.puntos_jugador2, row.sets_jugador2, row.sets_jugador1, gamesJ2, gamesJ1);
 }

 // Guardar historial crudo para H2H en el sort
 setRawHistorial(scopedHistoryRows as TournamentHistoryRow[]);

 if (historyAggByProfile.size > 0) {
 mergeRows(Array.from(historyAggByProfile.values()));

 if (participantIds.length === 0) {
 participantIds = Array.from(historyAggByProfile.keys());
 } else {
 participantIds = Array.from(new Set([...participantIds, ...historyAggByProfile.keys()]));
 }

 uniqueRows = participantIds.length > 0
 ? participantIds.map((perfilId) => rowsByProfile.get(perfilId) || historyAggByProfile.get(perfilId)).filter(Boolean) as TournamentPlayerRow[]
 : Array.from(rowsByProfile.values());
 }
 }

 if (uniqueRows.length === 0) {
 setDbRows([]);
 return;
 }

 const profileIds = uniqueRows.map((row: TournamentPlayerRow) => row.perfil_id).filter(Boolean);
 const { data: perfiles, error: perfilesError } = await supabase
 .from('perfiles')
 .select('id, nombre_completo')
 .in('id', profileIds);

 if (perfilesError) throw perfilesError;

 const nameById = Object.fromEntries((perfiles || []).map((p: any) => [p.id, p.nombre_completo || 'Jugador']));

 const orderedRows = participantIds.length > 0
 ? participantIds.map((perfilId) => rowsByProfile.get(perfilId)).filter(Boolean) as TournamentPlayerRow[]
 : uniqueRows;

 const mapped = orderedRows.map((row: TournamentPlayerRow, idx: number) => ({
 id: row.perfil_id || `db-player-${idx}`,
 name: nameById[row.perfil_id] || 'Jugador',
 pj: Number(row.partidos_jugados || 0),
 pts: Number(row.puntos || 0),
 setsWon: Number(row.sets_ganados || 0),
 setsLost: Number(row.sets_perdidos || 0),
 gamesWon: Number(row.games_ganados || 0),
 gamesLost: Number(row.games_perdidos || 0),
 matches: [],
 }));

 const nameCounts = mapped.reduce((acc: Record<string, number>, row: any) => {
 const key = String(row.name || 'Jugador');
 acc[key] = (acc[key] || 0) + 1;
 return acc;
 }, {});

 const withUniqueLabels = mapped.map((row: any) => {
 const duplicatedName = (nameCounts[String(row.name || 'Jugador')] || 0) > 1;
 if (!duplicatedName) return row;
 const shortId = String(row.id || '').slice(-4);
 return {
 ...row,
 name: `${row.name} #${shortId}`,
 };
 });

 setDbRows(withUniqueLabels);
 setDbLoadError(null);
 // Guardar en caché para navegación instantánea al volver
 fixtureCache.set(`standings-${parsedTournamentId}-${selectedGroup}`, {
 rows: withUniqueLabels,
 historial: (historyRows as TournamentHistoryRow[] | null) || [],
 });
 } catch (err) {
 console.error('No se pudo cargar la tabla desde Supabase', err);
 setDbRows([]);
 setDbLoadError('No se pudo cargar la tabla de posiciones. Intenta recargar la página.');
 } finally {
 setIsLoading(false);
 }
 }, [selectedGroup, tournament?.id, tournament?.subtitle]);

 // channelStatusRef trackea el estado real del canal: mientras esta confirmado
 // SUBSCRIBED, el polling de abajo se salta (evita el doble fetch evento+poll).
 const channelStatusRef = useRef<string>('CLOSED');

 useEffect(() => {
 if (!tournament) return;
 loadDbStandings();

 channelStatusRef.current = 'CLOSED';
 const channel = supabase
 .channel(`standings-live-${tournament.id}`)
 .on(
 'postgres_changes',
 { event: '*', schema: 'public', table: 'torneo_jugadores', filter: `torneo_id=eq.${tournament.id}` },
 () => {
 loadDbStandings();
 }
 )
 .on(
 'postgres_changes',
 { event: '*', schema: 'public', table: 'torneo_equipos', filter: `torneo_id=eq.${tournament.id}` },
 () => {
 loadDbStandings();
 }
 )
 .on(
 'postgres_changes',
 { event: '*', schema: 'public', table: 'partidos', filter: `torneo_id=eq.${tournament.id}` },
 () => {
 loadDbStandings();
 }
 )
 .subscribe((status) => {
 channelStatusRef.current = status;
 });

 // Polling ensures standings stay fresh even if the Supabase Realtime subscription
 // above is disabled or drops (e.g. project on free tier with Realtime off). Skipped
 // while the channel is confirmed SUBSCRIBED to avoid redundant double-fetching.
 const intervalId = window.setInterval(() => {
 if (channelStatusRef.current !== 'SUBSCRIBED') loadDbStandings();
 }, 45000);

 return () => {
 window.clearInterval(intervalId);
 supabase.removeChannel(channel);
 };
 }, [loadDbStandings, tournament?.id]);

 const calculatedStandings = useMemo(() => {
 const source = dbRows && dbRows.length > 0 ? dbRows : (initialPlayers as any[]);
 if (source.length === 0) return [];

 // Construir mapa de resultados directos desde el historial
 // h2hWins[winnerId] = Set de losers
 const h2hWins = new Map<string, Set<string>>();
 for (const row of rawHistorial) {
 const winner = row.ganador_perfil_id;
 const j1 = row.jugador1_perfil_id;
 const j2 = row.jugador2_perfil_id;
 if (!winner || !j1 || !j2) continue;
 const loser = winner === j1 ? j2 : j1;
 if (!h2hWins.has(winner)) h2hWins.set(winner, new Set());
 h2hWins.get(winner)!.add(loser);
 }

 const getH2H = (idA: string, idB: string): 'A' | 'B' | null => {
 if (h2hWins.get(idA)?.has(idB)) return 'A';
 if (h2hWins.get(idB)?.has(idA)) return 'B';
 return null;
 };

 // Orden de desempate: pts → dif.sets → sets ganados → H2H → dif. games
 const sorted = [...source].sort((a: any, b: any) => {
 if (b.pts !== a.pts) return b.pts - a.pts;
 const diffA = a.setsWon - a.setsLost;
 const diffB = b.setsWon - b.setsLost;
 if (diffB !== diffA) return diffB - diffA;
 if (b.setsWon !== a.setsWon) return b.setsWon - a.setsWon;
 const h2h = getH2H(a.id, b.id);
 if (h2h === 'A') return -1;
 if (h2h === 'B') return 1;
 const gamesDiffA = (a.gamesWon || 0) - (a.gamesLost || 0);
 const gamesDiffB = (b.gamesWon || 0) - (b.gamesLost || 0);
 return gamesDiffB - gamesDiffA;
 });

 // Anotar el criterio de desempate aplicado entre cada jugador y el anterior con igual pts
 return sorted.map((p: any, idx: number) => {
 const gamesDiff = (p.gamesWon || 0) - (p.gamesLost || 0);
 if (idx === 0) return { ...p, gamesDiff, tiebreakerReason: null as string | null };
 const prev = sorted[idx - 1];
 if (prev.pts !== p.pts) return { ...p, gamesDiff, tiebreakerReason: null as string | null };
 // Mismo pts — identificar qué criterio los separó
 const diffP = prev.setsWon - prev.setsLost;
 const diffC = p.setsWon - p.setsLost;
 let reason: string | null = null;
 if (diffP !== diffC) {
 reason = 'Dif. Sets';
 } else if (prev.setsWon !== p.setsWon) {
 reason = 'Sets Gan.';
 } else {
 const h2h = getH2H(prev.id, p.id);
 reason = h2h ? 'H2H' : 'Dif. Games';
 }
 return { ...p, gamesDiff, tiebreakerReason: reason };
 });
 }, [dbRows, rawHistorial]);

 const tableScrollRef = useRef<HTMLDivElement>(null);
 const [canScrollRight, setCanScrollRight] = useState(false);

 const updateScrollHint = useCallback(() => {
 const el = tableScrollRef.current;
 if (!el) return;
 setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
 }, []);

 useEffect(() => {
 updateScrollHint();
 window.addEventListener('resize', updateScrollHint);
 return () => window.removeEventListener('resize', updateScrollHint);
 }, [updateScrollHint, calculatedStandings.length]);

 if (!tournament) return null;

 return (
 <div className="relative flex h-full min-h-full w-full flex-col bg-background-light font-display text-slate-900 max-w-4xl mx-auto pb-24 md:pb-12 no-scrollbar overflow-y-auto">
 <div className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
 <div className="flex items-center p-4 pb-2 justify-between">
 <button onClick={() => navigate(-1)} className="text-slate-900 flex size-10 items-center justify-center rounded-full hover:bg-slate-100 "><span className="material-symbols-outlined">arrow_back_ios_new</span></button>
 <div className="flex-1 flex justify-center">
 <Logo variant="tournament" className="h-[120px] w-auto" />
 </div>
 <div className="size-10 flex items-center justify-center"><span className="material-symbols-outlined text-slate-600">info</span></div>
 </div>
 <div className="px-4 pb-4 pt-2">
 <div className="flex items-baseline gap-2">
 <h3 className="text-2xl font-bold">Tabla General</h3>
 </div>
 <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mt-1">{tournament.title || 'Torneo TuBarrio'}</p>
 {availableGroups.length > 0 && (
 <div className="mt-3 flex items-center gap-2">
 <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Grupo</label>
 <select
 value={selectedGroup || scope?.grupo || ''}
 onChange={(e) => setSelectedGroup(e.target.value)}
 className="rounded-lg border border-slate-200 bg-white px-3 py-1 pr-8 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 appearance-none bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iOCIgdmlld0JveD0iMCAwIDEyIDgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMUw2IDZMMTEgMSIgc3Ryb2tlPSIjNjQ3NDhiIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==')] bg-no-repeat bg-[right_0.75rem_center]"
 >
 {(() => {
 const baseGroups = selectedGroup
 ? availableGroups
 : (scope?.grupo ? [scope.grupo, ...availableGroups.filter((g) => g !== scope.grupo)] : availableGroups);
 const seen = new Set<string>();
 const dedup: string[] = [];
 for (const g of baseGroups) {
 const label = getGroupLabel(g);
 if (seen.has(label)) continue;
 seen.add(label);
 dedup.push(g);
 }
 return dedup.map((group) => (
 <option key={group} value={group}>{getGroupLabel(group)}</option>
 ));
 })()}
 </select>
 </div>
 )}
 </div>
 </div>

 {previewMode && (
 <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center justify-between gap-3">
 <div className="flex items-center gap-2 text-sm">
 <span className="material-symbols-outlined text-amber-600 text-xl">preview</span>
 <span className="font-semibold text-amber-900">Vista previa • {previewScope?.grupo || 'Grupo'}</span>
 </div>
 <button
 onClick={() => navigate(previewScope?.adminReturnTo || '/admin')}
 className="text-xs font-bold text-amber-700 hover:text-amber-900 px-3 py-1 rounded bg-amber-100 hover:bg-amber-200 transition-colors"
 >
 Volver
 </button>
 </div>
 )}

 {/* Tabs */}
 <div className="px-4 pb-2">
 <div className="flex bg-slate-100 rounded-lg p-1">
 <button
 onClick={() => setActiveTab('tabla')}
 className={`flex-1 py-2 px-4 text-xs font-bold rounded-md transition-all ${
 activeTab === 'tabla'
 ? 'bg-white text-slate-900 shadow-sm'
 : 'text-slate-500 hover:text-slate-700'
 }`}
 >
 Tabla
 </button>
 <button
 onClick={() => setActiveTab('llaves')}
 className={`flex-1 py-2 px-4 text-xs font-bold rounded-md transition-all ${
 activeTab === 'llaves'
 ? 'bg-white text-slate-900 shadow-sm'
 : 'text-slate-500 hover:text-slate-700'
 }`}
 >
 Llaves
 </button>
 </div>
 </div>

 <main className="w-full flex-1">
 {activeTab === 'llaves' ? (
 <div className="px-4">
 <BracketTab
 torneo_id={Number(tournament.id)}
 categoria={scope?.categoria || tournament.subtitle || 'General'}
 grupo={scope?.grupo}
 selectedGroup={selectedGroup || undefined}
 currentUserId={previewMode ? undefined : (currentUserId || undefined)}
 onMatchClick={(match) => {
 const isFinal = match.estado === 'finalizado';
 if (previewMode && !isFinal) return; // No navegar en preview para partidos no finalizados
 navigate(isFinal ? '/result-detail' : '/match-result', {
 state: { tournament, partidoId: match.id, currentUserId, previewScope },
 });
 }}
 />
 </div>
 ) : (
 <div>
 {dbLoadError && (
 <div className="mx-4 mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
 {dbLoadError}
 </div>
 )}
 <div
 ref={tableScrollRef}
 onScroll={updateScrollHint}
 className="overflow-x-auto no-scrollbar relative flex"
 >
 <table className="w-full border-collapse min-w-[500px] shrink-0">
 <thead className="bg-slate-50 ">
 <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
 <th className="px-4 py-3 sticky left-0 z-20 bg-slate-50 w-12 text-center">Pos</th>
 <th className="px-4 py-3 sticky left-12 z-20 bg-slate-50 min-w-[220px] shadow-[8px_0_10px_-10px_rgba(0,0,0,0.35)]">Jugador</th>
 <th className="px-3 py-3 text-center">PJ</th>
 <th className="px-3 py-3 text-center">Pts</th>
 <th className="px-3 py-3 text-center" title="Sets ganados − sets perdidos">Dif.S</th>
 <th className="px-3 py-3 text-center" title="Sets ganados">S.G</th>
 <th className="px-3 py-3 text-center" title="Diferencia de games (ganados − perdidos)">Dif.G</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100 ">
 {isLoading ? (
 Array.from({ length: 5 }).map((_, i) => (
 <tr key={i}>
 <td className="px-4 py-4 sticky left-0 bg-white"><div className="h-4 w-6 bg-slate-200 rounded animate-pulse mx-auto" /></td>
 <td className="px-4 py-4 sticky left-12 bg-white shadow-[8px_0_10px_-10px_rgba(0,0,0,0.35)]"><div className="h-4 bg-slate-200 rounded animate-pulse w-32" /></td>
 <td className="px-3 py-4"><div className="h-4 w-6 bg-slate-200 rounded animate-pulse mx-auto" /></td>
 <td className="px-3 py-4"><div className="h-4 w-6 bg-slate-200 rounded animate-pulse mx-auto" /></td>
 <td className="px-3 py-4"><div className="h-4 w-6 bg-slate-200 rounded animate-pulse mx-auto" /></td>
 <td className="px-3 py-4"><div className="h-4 w-6 bg-slate-200 rounded animate-pulse mx-auto" /></td>
 <td className="px-3 py-4"><div className="h-4 w-8 bg-slate-200 rounded animate-pulse mx-auto" /></td>
 </tr>
 ))
 ) : (
 <>
 {calculatedStandings.map((p: any, idx: number) => (
 <StandingsRow
 key={p.id}
 p={p}
 idx={idx}
 clasificadosPorGrupo={clasificadosPorGrupo}
 incluirMejoresTerceros={incluirMejoresTerceros}
 />
 ))}
 {calculatedStandings.length === 0 && (
 <tr>
 <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
 Todavia no hay jugadores inscriptos o no se pudo leer la tabla del torneo en Supabase.
 </td>
 </tr>
 )}
 </>
 )}
 </tbody>
 </table>
 {/* Hint de scroll horizontal: sticky (no absolute) para que se mantenga pegado
 al borde derecho del viewport mientras se scrollea, y solo se despegue al
 llegar al final real de la tabla (contenedor flex para que herede la altura) */}
 <div
 aria-hidden="true"
 className={`sticky right-0 shrink-0 pointer-events-none w-10 flex items-center justify-end bg-gradient-to-l from-white via-white/80 to-transparent transition-opacity duration-300 ${
 canScrollRight ? 'opacity-100' : 'opacity-0'
 }`}
 >
 <span className="material-symbols-outlined text-lg text-slate-400 animate-bounce-x">chevron_right</span>
 </div>
 </div>

 <div className="flex items-center gap-2 px-4 pt-3 pb-1">
 <div className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-300 flex-shrink-0" />
 <span className="text-xs text-slate-500 ">
 Clasifica a los playoffs (Top {clasificadosPorGrupo} por grupo)
 </span>
 </div>
 {incluirMejoresTerceros && cantidadMejoresTerceros > 0 && (
 <div className="flex items-center gap-2 px-4 pb-1">
 <div className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 flex-shrink-0" />
 <span className="text-xs text-slate-500">
 Los {cantidadMejoresTerceros} mejores terceros de todos los grupos también clasifican
 </span>
 </div>
 )}

 <div className="mx-4 my-4 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
 <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
 <span className="material-symbols-outlined text-slate-400 text-[18px]">balance</span>
 <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Criterios de desempate</h4>
 </div>
 <div className="divide-y divide-slate-50 ">
 {TIEBREAKER_CRITERIA.map((criterion, i) => (
 <div key={i} className="flex items-center gap-3 px-4 py-2.5">
 <span className="text-[10px] font-bold text-slate-400 w-4 shrink-0">{i + 1}</span>
 <span className="text-xs text-slate-600 ">{criterion.replace(/^\d+°\s/, '')}</span>
 </div>
 ))}
 </div>
 <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100 ">
 <p className="text-[10px] text-amber-700 leading-relaxed">
 La insignia junto a la posicion indica el criterio que desempato a dos jugadores con iguales puntos.
 </p>
 </div>
 </div>

 {incluirMejoresTerceros && cantidadMejoresTerceros > 0 && (
 <div className="mx-4 mb-4 bg-white rounded-xl border border-amber-100 shadow-sm overflow-hidden">
 <div className="px-4 py-3 border-b border-amber-100 flex items-center gap-2">
 <span className="material-symbols-outlined text-amber-400 text-[18px]">emoji_events</span>
 <h4 className="text-xs font-bold text-amber-600 uppercase tracking-widest">Ranking de mejores terceros</h4>
 </div>
 <div className="px-4 py-2.5 text-[11px] text-slate-600 leading-relaxed">
 Los {cantidadMejoresTerceros} mejores terceros se determinan comparando a todos los jugadores ubicados 3° en su grupo, usando este orden de prioridad:
 </div>
 <div className="divide-y divide-slate-50">
 {['Puntos acumulados', 'Sets ganados (total)', 'Menos partidos jugados'].map((c, i) => (
 <div key={i} className="flex items-center gap-3 px-4 py-2.5">
 <span className="text-[10px] font-bold text-slate-400 w-4 shrink-0">{i + 1}</span>
 <span className="text-xs text-slate-600">{c}</span>
 </div>
 ))}
 </div>
 <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100">
 <p className="text-[10px] text-amber-700 leading-relaxed">
 Este criterio es entre grupos — el H2H y diferencia de sets no aplican en comparaciones cruzadas.
 </p>
 </div>
 </div>
 )}
 </div>
 )}
 </main>
 </div>
 );
};

export default Standings;
