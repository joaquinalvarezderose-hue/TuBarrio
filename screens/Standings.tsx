
import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PlayerStats } from '../utils/tournamentLogic';
import { supabase } from '../services/supabaseClient';
import BracketTab from '../components/BracketTab';

type TournamentScope = {
  categoria: string;
  grupo: string;
};

type TournamentPlayerRow = {
  perfil_id: string;
  puntos: number | null;
  partidos_jugados: number | null;
  sets_ganados: number | null;
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
  puntos_jugador1: number | null;
  puntos_jugador2: number | null;
  sets_jugador1: number | null;
  sets_jugador2: number | null;
};

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
  const [dbRows, setDbRows] = useState<any[] | null>(null);
  const [scope, setScope] = useState<TournamentScope | null>(null);
  const [availableGroups, setAvailableGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string>('');

  const savedTournament = localStorage.getItem('active_tournament');
  const tournament = location.state?.tournament || (savedTournament ? JSON.parse(savedTournament) : {
    id: 1,
    title: 'Abierto de Tenis TuBarrio',
    subtitle: 'Singles Caballeros',
  });

  const initialPlayers: PlayerStats[] = [];

  const loadDbStandings = useCallback(async () => {
    try {
      const parsedTournamentId = Number(tournament.id);
      if (!Number.isFinite(parsedTournamentId)) {
        setDbRows([]);
        return;
      }

      let currentUserId = '';
      try {
        const { data } = await (supabase as any).auth.getUser();
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

      let resolvedScope: TournamentScope | null = null;
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
          new Set(
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
        .select('perfil_id, puntos, partidos_jugados, sets_ganados')
        .eq('torneo_id', parsedTournamentId);

      if (resolvedScope?.categoria) standingsQuery = standingsQuery.eq('categoria', resolvedScope.categoria);
      if (selectedGroup) {
        standingsQuery = standingsQuery.eq('grupo', selectedGroup);
      } else if (resolvedScope?.grupo) {
        standingsQuery = standingsQuery.eq('grupo', resolvedScope.grupo);
      }

      const { data, error } = await standingsQuery;

      if (error || !data) {
        setDbRows([]);
        return;
      }

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
          });
        }
      };

      mergeRows((data || []) as TournamentPlayerRow[]);

      let uniqueRows = Array.from(rowsByProfile.values());

      if (participantIds.length > 0 && uniqueRows.length < participantIds.length) {
        const { data: participantRows, error: participantRowsError } = await supabase
          .from('torneo_jugadores')
          .select('perfil_id, puntos, partidos_jugados, sets_ganados')
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
            .select('perfil_id, puntos, partidos_jugados, sets_ganados')
            .eq('torneo_id', parsedTournamentId)
            .in('perfil_id', participantIds);

          if (participantRowsError) throw participantRowsError;
          mergeRows((participantRows || []) as TournamentPlayerRow[]);
          uniqueRows = participantIds.map((perfilId) => rowsByProfile.get(perfilId) || {
            perfil_id: perfilId,
            puntos: 0,
            partidos_jugados: 0,
            sets_ganados: 0,
          }).filter(Boolean) as TournamentPlayerRow[];
        }
      }

      let historyQuery: any = supabase
        .from('torneo_partidos_historial')
        .select('categoria, grupo, jugador1_perfil_id, jugador2_perfil_id, puntos_jugador1, puntos_jugador2, sets_jugador1, sets_jugador2')
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
        const addHistory = (perfilIdRaw: string | null, puntosRaw: number | null, setsRaw: number | null) => {
          const perfilId = String(perfilIdRaw || '');
          if (!perfilId) return;
          const prev = historyAggByProfile.get(perfilId) || {
            perfil_id: perfilId,
            puntos: 0,
            partidos_jugados: 0,
            sets_ganados: 0,
          };

          historyAggByProfile.set(perfilId, {
            perfil_id: perfilId,
            puntos: Number(prev.puntos || 0) + Number(puntosRaw || 0),
            partidos_jugados: Number(prev.partidos_jugados || 0) + 1,
            sets_ganados: Number(prev.sets_ganados || 0) + Number(setsRaw || 0),
          });
        };

        for (const row of scopedHistoryRows) {
          addHistory(row.jugador1_perfil_id, row.puntos_jugador1, row.sets_jugador1);
          addHistory(row.jugador2_perfil_id, row.puntos_jugador2, row.sets_jugador2);
        }

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
        setsLost: 0,
        gamesWon: 0,
        gamesLost: 0,
        matches: [],
      }));
      mapped.sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        return b.setsWon - a.setsWon;
      });

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
    } catch (err) {
      console.error('No se pudo cargar la tabla desde Supabase', err);
      setDbRows([]);
    }
  }, [selectedGroup, tournament.id, tournament.subtitle]);

  useEffect(() => {
    loadDbStandings();

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
        { event: '*', schema: 'public', table: 'partidos', filter: `torneo_id=eq.${tournament.id}` },
        () => {
          loadDbStandings();
        }
      )
      .subscribe();

    // Fallback defensivo por si Realtime no está habilitado en Supabase.
    const intervalId = window.setInterval(() => {
      loadDbStandings();
    }, 45000);

    return () => {
      window.clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [loadDbStandings, tournament.id]);

  const calculatedStandings = useMemo(() => {
    if (dbRows && dbRows.length > 0) {
      return dbRows.map((p: any) => ({
        ...p,
        average: p.pj > 0 ? (p.pts / p.pj).toFixed(2) : '0.00',
      }));
    }
    return initialPlayers;
  }, [dbRows]);

  return (
    <div className="relative flex h-full min-h-full w-full flex-col bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 max-w-4xl mx-auto pb-24 md:pb-12 no-scrollbar overflow-y-auto">
      <div className="sticky top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center p-4 pb-2 justify-between">
          <button onClick={() => navigate(-1)} className="text-slate-900 dark:text-white flex size-10 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"><span className="material-symbols-outlined">arrow_back_ios_new</span></button>
          <h2 className="text-lg font-bold flex-1 text-center">Tabla de Posiciones</h2>
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
                className="rounded-lg border border-slate-200 bg-white px-3 py-1 pr-8 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 appearance-none bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iOCIgdmlld0JveD0iMCAwIDEyIDgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMUw2IDZMMTEgMSIgc3Ryb2tlPSIjNjQ3NDhiIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==')] bg-no-repeat bg-right-center"
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

      {/* Tabs */}
      <div className="px-4 pb-2">
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('tabla')}
            className={`flex-1 py-2 px-4 text-xs font-bold rounded-md transition-all ${
              activeTab === 'tabla'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
            }`}
          >
            Tabla
          </button>
          <button
            onClick={() => setActiveTab('llaves')}
            className={`flex-1 py-2 px-4 text-xs font-bold rounded-md transition-all ${
              activeTab === 'llaves'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
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
              onMatchClick={(match) => {
                const isFinal = match.estado === 'finalizado';
                navigate(isFinal ? '/result-detail' : '/match-result', {
                  state: { tournament, partidoId: match.id, currentUserId },
                });
              }}
            />
          </div>
        ) : (
          <div>
          <div className="overflow-x-auto no-scrollbar relative">
          <table className="w-full border-collapse min-w-[500px]">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                <th className="px-4 py-3 sticky left-0 z-20 bg-slate-50 dark:bg-slate-800 w-12 text-center">Pos</th>
                <th className="px-4 py-3 sticky left-12 z-20 bg-slate-50 dark:bg-slate-800 min-w-[160px] shadow-[8px_0_10px_-10px_rgba(0,0,0,0.35)]">Jugador</th>
                <th className="px-3 py-3 text-center">PJ</th>
                <th className="px-3 py-3 text-center">Pts</th>
                <th className="px-3 py-3 text-center">S. Dif</th>
                <th className="px-3 py-3 text-center">Prom</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {calculatedStandings.map((p, idx) => (
                <tr key={p.id} className={idx < 2 ? 'bg-primary/10 dark:bg-primary/5' : 'bg-white dark:bg-slate-900'}>
                  <td className={`px-4 py-4 text-center font-bold sticky left-0 z-10 ${idx < 2 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700' : 'bg-white dark:bg-slate-900'}`}>{idx + 1}</td>
                  <td className={`px-4 py-4 sticky left-12 z-10 shadow-[8px_0_10px_-10px_rgba(0,0,0,0.35)] ${idx < 2 ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-white dark:bg-slate-900'}`}>
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full border-2 border-white shadow-sm bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold uppercase">
                        {String(p.name || 'Jugador')
                          .split(' ')
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((chunk: string) => chunk[0])
                          .join('') || 'J'}
                      </div>
                      <span className="text-sm font-semibold">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-4 text-center text-sm">{p.pj}</td>
                  <td className="px-3 py-4 text-center text-sm font-bold">{p.pts}</td>
                  <td className="px-3 py-4 text-center text-sm">{p.setsWon - p.setsLost}</td>
                  <td className="px-3 py-4 text-center text-sm font-bold text-primary">{p.average}</td>
                </tr>
              ))}
              {calculatedStandings.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                    Todavia no hay jugadores inscriptos o no se pudo leer la tabla del torneo en Supabase.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 mx-4 my-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Resumen de Clasificación Segunda</h4>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">Se calcula el <strong>Promedio (Pts/PJ)</strong> para determinar el ranking de "Mejores Segundos" entre todos los grupos de la categoría.</p>
        </div>
        </div>
        )}
      </main>
    </div>
  );
};

export default Standings;
