
import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PlayerStats } from '../utils/tournamentLogic';
import { supabase } from '../services/supabaseClient';

const Standings: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [dbRows, setDbRows] = useState<any[] | null>(null);
  const [scope, setScope] = useState<TournamentScope | null>(null);

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

      let standingsQuery: any = supabase
        .from('torneo_jugadores')
        .select('perfil_id, puntos, partidos_jugados, sets_ganados')
        .eq('torneo_id', parsedTournamentId);

      if (resolvedScope?.categoria) standingsQuery = standingsQuery.eq('categoria', resolvedScope.categoria);
      if (resolvedScope?.grupo) standingsQuery = standingsQuery.eq('grupo', resolvedScope.grupo);

      const { data, error } = await standingsQuery;

      if (error || !data) {
        setDbRows([]);
        return;
      }

      const rowsByProfile = new Map<string, any>();
      for (const row of data) {
        const perfilId = String(row?.perfil_id || '');
        if (!perfilId) continue;
        const prev = rowsByProfile.get(perfilId);
        if (!prev) {
          rowsByProfile.set(perfilId, row);
          continue;
        }

        // Defensive merge in case duplicated rows exist in torneo_jugadores.
        rowsByProfile.set(perfilId, {
          ...prev,
          puntos: Math.max(Number(prev.puntos || 0), Number(row.puntos || 0)),
          partidos_jugados: Math.max(Number(prev.partidos_jugados || 0), Number(row.partidos_jugados || 0)),
          sets_ganados: Math.max(Number(prev.sets_ganados || 0), Number(row.sets_ganados || 0)),
        });
      }

      const uniqueRows = Array.from(rowsByProfile.values());
      const profileIds = uniqueRows.map((row: any) => row.perfil_id).filter(Boolean);
      const { data: perfiles } = await supabase
        .from('perfiles')
        .select('id, nombre_completo')
        .in('id', profileIds);

      const nameById = Object.fromEntries((perfiles || []).map((p: any) => [p.id, p.nombre_completo || 'Jugador']));

      const mapped = uniqueRows.map((row: any, idx: number) => ({
        id: row.perfil_id || `db-player-${idx}`,
        name: nameById[row.perfil_id] || 'Jugador',
        img: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=120&h=120&fit=crop',
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
  }, [tournament.id, tournament.subtitle]);

  useEffect(() => {
    loadDbStandings();

    const channel = supabase
      .channel(`standings-live-${tournament.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'torneo_jugadores' },
        () => {
          loadDbStandings();
        }
      )
      .subscribe();

    // Fallback defensivo por si Realtime no está habilitado en Supabase.
    const intervalId = window.setInterval(() => {
      loadDbStandings();
    }, 15000);

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
            <span className="text-slate-500 font-medium text-lg">{scope?.categoria || tournament.subtitle || 'General'}</span>
          </div>
          <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mt-1">{tournament.title || 'Torneo TuBarrio'}</p>
        </div>
      </div>

      <main className="w-full flex-1">
        <div className="overflow-x-auto no-scrollbar relative">
          <table className="w-full border-collapse min-w-[500px]">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                <th className="px-4 py-3 sticky left-0 z-20 bg-slate-50 dark:bg-slate-800 w-12 text-center">Pos</th>
                <th className="px-4 py-3 sticky left-12 z-20 bg-slate-50 dark:bg-slate-800 min-w-[160px]">Jugador</th>
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
                  <td className={`px-4 py-4 sticky left-12 z-10 ${idx < 2 ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-white dark:bg-slate-900'}`}>
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full bg-cover bg-center border-2 border-white shadow-sm" style={{ backgroundImage: `url("${p.img}")` }}></div>
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
          <div className="absolute top-0 left-[212px] bottom-0 w-4 bg-gradient-to-r from-black/5 to-transparent pointer-events-none z-30"></div>
        </div>

        <div className="p-4 mx-4 my-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Resumen de Clasificación Segunda</h4>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">Se calcula el <strong>Promedio (Pts/PJ)</strong> para determinar el ranking de "Mejores Segundos" entre todos los grupos de la categoría.</p>
        </div>
      </main>
    </div>
  );
};

export default Standings;
