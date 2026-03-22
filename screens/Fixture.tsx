
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

type FixturePlayer = {
  perfil_id: string;
  nombre: string;
  puntos: number;
  partidos_jugados: number;
  sets_ganados: number;
};

type FixtureMatch = {
  p1: FixturePlayer;
  p2: FixturePlayer;
};

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createSeededRandom = (seed: number) => {
  let t = seed || 1;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const drawPlayersOrder = (players: FixturePlayer[], seedBase: string) => {
  const ids = players.map((p) => p.perfil_id).filter(Boolean).sort();
  const playerById = Object.fromEntries(players.map((p) => [p.perfil_id, p]));
  const shuffled = [...ids];
  const random = createSeededRandom(hashString(seedBase));

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.map((id) => playerById[id]).filter(Boolean);
};

const buildPairKey = (p1Id: string, p2Id: string) => [p1Id || '', p2Id || ''].sort().join('|');

const buildRoundRobin = (players: FixturePlayer[]): FixtureMatch[][] => {
  if (players.length < 2) return [];

  const working: Array<FixturePlayer | null> = [...players];
  if (working.length % 2 === 1) working.push(null);

  const rounds: FixtureMatch[][] = [];
  const totalRounds = working.length - 1;

  for (let round = 0; round < totalRounds; round += 1) {
    const matches: FixtureMatch[] = [];
    const half = working.length / 2;

    for (let i = 0; i < half; i += 1) {
      const left = working[i];
      const right = working[working.length - 1 - i];
      if (left && right) {
        matches.push({ p1: left, p2: right });
      }
    }

    rounds.push(matches);

    const fixed = working[0];
    const rest = working.slice(1);
    const last = rest.pop();
    if (last !== undefined) {
      rest.unshift(last);
    }
    working.splice(0, working.length, fixed, ...rest);
  }

  return rounds;
};

const Fixture: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [category, setCategory] = useState<'Segunda' | 'Intermedia'>('Segunda');
  const [activeFecha, setActiveFecha] = useState(1);
  const [playersStats, setPlayersStats] = useState<any[]>([]);
  const [playersByTournament, setPlayersByTournament] = useState<FixturePlayer[]>([]);
  const [resultByPair, setResultByPair] = useState<Record<string, { sets_jugador1: number; sets_jugador2: number; ganador_perfil_id: string | null }>>({});

  const savedTournament = localStorage.getItem('active_tournament');
  const tournament = location.state?.tournament || (savedTournament ? JSON.parse(savedTournament) : {
    id: 1,
    title: 'Abierto de Tenis TuBarrio',
    subtitle: 'Singles Caballeros',
  });

  const loadFixtureStats = useCallback(async () => {
    try {
      const grupo = `TORNEO_${tournament.id}`;
      const categoria = tournament.subtitle || 'General';

      const [jugadoresResp, historialResp] = await Promise.all([
        supabase
          .from('torneo_jugadores')
          .select('perfil_id, puntos, partidos_jugados, sets_ganados')
          .eq('categoria', categoria)
          .eq('grupo', grupo),
        supabase
          .from('torneo_partidos_historial')
          .select('jugador1_perfil_id, jugador2_perfil_id, sets_jugador1, sets_jugador2, ganador_perfil_id, cargado_en')
          .eq('torneo_id', tournament.id)
          .eq('categoria', categoria)
          .eq('grupo', grupo)
          .order('cargado_en', { ascending: false }),
      ]);

      const { data, error } = jugadoresResp;

      if (error || !data) return;

      const profileIds = data.map((row: any) => row.perfil_id).filter(Boolean);
      const { data: perfiles } = await supabase
        .from('perfiles')
        .select('id, nombre_completo')
        .in('id', profileIds);

      const nameById = Object.fromEntries((perfiles || []).map((p: any) => [p.id, p.nombre_completo || 'Jugador']));

      const mapped: FixturePlayer[] = data.map((row: any) => ({
        perfil_id: row.perfil_id,
        nombre: nameById[row.perfil_id] || 'Jugador',
        puntos: Number(row.puntos || 0),
        partidos_jugados: Number(row.partidos_jugados || 0),
        sets_ganados: Number(row.sets_ganados || 0),
      }));

      const statsSorted = [...mapped].sort((a, b) => {
        if (b.puntos !== a.puntos) return b.puntos - a.puntos;
        return b.sets_ganados - a.sets_ganados;
      });

      const seedBase = `${tournament.id}|${categoria}|${mapped.map((p) => p.perfil_id).sort().join('|')}`;
      const drawnOrder = drawPlayersOrder(mapped, seedBase);

      setPlayersStats(statsSorted);
      setPlayersByTournament(drawnOrder);

      const historyRows = historialResp.data || [];
      const byPair: Record<string, { sets_jugador1: number; sets_jugador2: number; ganador_perfil_id: string | null }> = {};
      historyRows.forEach((row: any) => {
        const key = buildPairKey(row.jugador1_perfil_id, row.jugador2_perfil_id);
        if (!byPair[key]) {
          byPair[key] = {
            sets_jugador1: Number(row.sets_jugador1 || 0),
            sets_jugador2: Number(row.sets_jugador2 || 0),
            ganador_perfil_id: row.ganador_perfil_id || null,
          };
        }
      });
      setResultByPair(byPair);
    } catch (err) {
      console.error('No se pudo cargar el estado del fixture', err);
    }
  }, [tournament.id, tournament.subtitle]);

  const roundRobinFechas = useMemo(() => {
    return buildRoundRobin(playersByTournament);
  }, [playersByTournament]);

  const fechas = useMemo(() => roundRobinFechas.map((_, idx) => idx + 1), [roundRobinFechas]);

  const fixtureMatches = useMemo(() => {
    if (fechas.length === 0) return [];
    return roundRobinFechas[activeFecha - 1] || [];
  }, [activeFecha, fechas.length, roundRobinFechas]);

  useEffect(() => {
    if (fechas.length === 0) {
      setActiveFecha(1);
      return;
    }
    if (activeFecha > fechas.length) {
      setActiveFecha(1);
    }
  }, [activeFecha, fechas.length]);

  useEffect(() => {
    loadFixtureStats();

    const channel = supabase
      .channel(`fixture-live-${tournament.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'torneo_jugadores' },
        () => {
          loadFixtureStats();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'torneo_partidos_historial' },
        () => {
          loadFixtureStats();
        }
      )
      .subscribe();

    // Fallback defensivo por si Realtime no está habilitado en Supabase.
    const intervalId = window.setInterval(() => {
      loadFixtureStats();
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [loadFixtureStats, tournament.id]);

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto bg-white dark:bg-background-dark font-display text-[#111813] dark:text-white transition-colors duration-200 pb-24">
      {/* Header Section */}
      <div className="sticky top-0 z-20 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-[#dbe6de] dark:border-[#2a3c2e]">
        <div className="flex items-center p-4 pb-2 justify-between">
          <button 
            onClick={() => navigate(-1)}
            className="text-[#111813] dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-background-light dark:hover:bg-white/10 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back_ios_new</span>
          </button>
          <h1 className="text-[#111813] dark:text-white text-xl font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-10">Fixture por Jornadas</h1>
        </div>

        {/* Category Selector */}
        <div className="flex px-4 py-3">
          <div className="flex h-11 flex-1 items-center justify-center rounded-xl bg-background-light dark:bg-[#1a2e1f] p-1.5 shadow-inner">
            {(['Segunda', 'Intermedia'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-semibold transition-all ${
                  category === cat 
                    ? 'bg-white dark:bg-[#2e4a35] shadow-sm text-[#111813] dark:text-primary' 
                    : 'text-[#61896b]'
                }`}
              >
                <span className="truncate">{cat}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Date/Round Horizontal Scroll */}
        <div className="overflow-x-auto no-scrollbar">
          <div className="flex px-4 gap-6 min-w-max">
            {(fechas.length === 0 ? [1] : fechas).map((f) => (
              <button
                key={f}
                onClick={() => setActiveFecha(f)}
                className={`flex flex-col items-center justify-center border-b-[3px] pb-3 pt-4 transition-all ${
                  activeFecha === f 
                    ? 'border-primary text-[#111813] dark:text-white' 
                    : 'border-transparent text-[#61896b]'
                }`}
              >
                <p className={`text-sm tracking-wide ${activeFecha === f ? 'font-bold' : 'font-semibold'}`}>JORNADA {f}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark pb-8 no-scrollbar">
        <div className="px-4 py-4">
          <div className="rounded-xl bg-white dark:bg-[#1a2e1f] p-4 shadow-sm border border-[#dbe6de] dark:border-[#2a3c2e] mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#111813] dark:text-white">Estado en vivo</h3>
              <span className="text-[10px] text-[#61896b] font-bold">Supabase</span>
            </div>
            {playersStats.length === 0 ? (
              <p className="text-sm text-[#61896b]">Todavía no hay estadísticas cargadas para este torneo.</p>
            ) : (
              <div className="space-y-2">
                {playersStats.slice(0, 4).map((p, idx) => (
                  <div key={`${p.nombre}-${idx}`} className="grid grid-cols-[22px_1fr_42px_42px_42px] items-center gap-2 text-sm">
                    <span className="font-bold text-[#4a9c40]">{idx + 1}</span>
                    <span className="font-semibold truncate text-[#111813] dark:text-white">{p.nombre}</span>
                    <span className="text-center font-bold">{p.puntos}</span>
                    <span className="text-center">{p.partidos_jugados}</span>
                    <span className="text-center">{p.sets_ganados}</span>
                  </div>
                ))}
                <div className="grid grid-cols-[22px_1fr_42px_42px_42px] items-center gap-2 text-[10px] uppercase tracking-wider text-[#61896b] pt-1 border-t border-[#dbe6de] dark:border-[#2a3c2e]">
                  <span></span>
                  <span>Jugador</span>
                  <span className="text-center">Pts</span>
                  <span className="text-center">PJ</span>
                  <span className="text-center">Sets</span>
                </div>
              </div>
            )}
          </div>

          <h3 className="text-[#111813] dark:text-white text-base font-bold uppercase tracking-wider mb-3">Partidos del torneo</h3>
          <div className="flex flex-col gap-4">
            {fixtureMatches.length === 0 ? (
              <div className="rounded-xl bg-white dark:bg-[#1a2e1f] p-4 shadow-sm border border-[#dbe6de] dark:border-[#2a3c2e]">
                <p className="text-sm text-[#61896b]">Aun no hay suficientes jugadores inscriptos para armar cruces (minimo 2).</p>
              </div>
            ) : (
              fixtureMatches.map((match, idx) => (
                <div key={`${match.p1.perfil_id}-${match.p2.perfil_id}-${idx}`} className="flex flex-col gap-4 rounded-xl bg-white dark:bg-[#1a2e1f] p-4 shadow-sm border border-[#dbe6de] dark:border-[#2a3c2e] hover:shadow-md transition-shadow">
                  {(() => {
                    const result = resultByPair[buildPairKey(match.p1.perfil_id, match.p2.perfil_id)];
                    const isFinal = Boolean(result);
                    const p1Sets = result?.sets_jugador1 ?? 0;
                    const p2Sets = result?.sets_jugador2 ?? 0;
                    const p1Won = result?.ganador_perfil_id === match.p1.perfil_id;
                    const p2Won = result?.ganador_perfil_id === match.p2.perfil_id;

                    return (
                      <>
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-3 flex-1">
                      <div className="flex items-center justify-between pr-4">
                        <span className={`${p1Won ? 'text-[#111813] dark:text-white font-bold' : 'text-[#111813] dark:text-white font-medium'} text-lg`}>{match.p1.nombre}</span>
                        {isFinal && <span className={`text-lg ${p1Won ? 'font-black text-[#4a9c40]' : 'font-bold text-[#61896b]'}`}>{p1Sets}</span>}
                      </div>
                      <div className="flex items-center justify-between pr-4">
                        <span className={`${p2Won ? 'text-[#111813] dark:text-white font-bold' : 'text-[#111813] dark:text-white font-medium'} text-lg`}>{match.p2.nombre}</span>
                        {isFinal && <span className={`text-lg ${p2Won ? 'font-black text-[#4a9c40]' : 'font-bold text-[#61896b]'}`}>{p2Sets}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[#4a9c40]" title="Provee las pelotas">
                          <span className="text-[10px] font-black italic">P</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="bg-primary/10 text-[#4a9c40] text-[10px] font-bold px-2 py-0.5 rounded-full">{isFinal ? 'FINAL' : activeFecha === 1 ? 'PROGRAMADO' : 'PRÓXIMO'}</span>
                      <div className="flex items-center gap-1 text-[#61896b] text-sm font-medium">
                        <span className="material-symbols-outlined text-sm">event</span>
                        <span>Jornada {activeFecha}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[#61896b] text-xs">
                        <span className="material-symbols-outlined text-sm">handshake</span>
                        <span>Dia y horario a coordinar</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="flex-1 h-10 rounded-lg bg-background-light dark:bg-[#2e4a35] text-[#111813] dark:text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform">
                      <span className="material-symbols-outlined text-lg">info</span>
                      {isFinal ? 'Ver Resultado' : 'Ver Detalle'}
                    </button>
                    <button className="w-12 h-10 rounded-lg bg-[#4a9c40] text-white flex items-center justify-center active:scale-95 transition-transform shadow-sm">
                      <span className="material-symbols-outlined font-bold">location_on</span>
                    </button>
                  </div>
                      </>
                    );
                  })()}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Empty/Upcoming State Section */}
        <div className="p-8 mt-4 flex flex-col items-center text-center">
          <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center text-[#4a9c40] mb-4">
            <span className="material-symbols-outlined text-4xl">event_available</span>
          </div>
          <h4 className="text-[#111813] dark:text-white font-bold mb-1">Más partidos pronto</h4>
          <p className="text-[#61896b] text-sm max-w-[240px]">El calendario para las siguientes fechas será publicado al finalizar la actual.</p>
        </div>
      </main>

      {/* Floating Action Button for Location (Quick Map) */}
      <div className="fixed bottom-6 right-6 z-30">
        <button className="size-14 rounded-full bg-[#4a9c40] text-white shadow-lg flex items-center justify-center active:scale-90 transition-transform">
          <span className="material-symbols-outlined text-3xl font-bold">map</span>
        </button>
      </div>
    </div>
  );
};

export default Fixture;