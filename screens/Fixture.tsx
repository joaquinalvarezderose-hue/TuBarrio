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
  id: string;
  jornada: number;
  estado: string;
  resultado: string | null;
  proposalState: string | null;
  p1: FixturePlayer;
  p2: FixturePlayer;
  finalScore: {
    sets_jugador1: number;
    sets_jugador2: number;
    ganador_perfil_id: string | null;
  } | null;
};

const Fixture: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeFecha, setActiveFecha] = useState(1);
  const [playersStats, setPlayersStats] = useState<FixturePlayer[]>([]);
  const [matches, setMatches] = useState<FixtureMatch[]>([]);
  const [torneoFinalizado, setTorneoFinalizado] = useState(false);

  const savedTournament = localStorage.getItem('active_tournament');
  const tournament = location.state?.tournament || (savedTournament ? JSON.parse(savedTournament) : {
    id: 1,
    title: 'Abierto de Tenis TuBarrio',
    subtitle: 'Singles Caballeros',
  });
  const appUser = localStorage.getItem('app_user') ? JSON.parse(localStorage.getItem('app_user') as string) : null;
  const appUser = localStorage.getItem('app_user') ? JSON.parse(localStorage.getItem('app_user') as string) : null;

  const loadFixtureData = useCallback(async () => {
    try {
      const grupo = `TORNEO_${tournament.id}`;
      const categoria = tournament.subtitle || 'General';

        // Resolver siempre desde Supabase Auth como fuente principal
        let currentUserId = String(appUser?.id || '');
        try {
          const { data: authData } = await (supabase as any).auth.getUser();
          if (authData?.user?.id) currentUserId = String(authData.user.id);
        } catch { /* sin sesión activa, usar localStorage */ }


      const [estadoResp, jugadoresResp, partidosResp, historialResp, propuestasResp] = await Promise.all([
        supabase
          .from('torneo_estado')
          .select('estado')
          .eq('torneo_id', tournament.id)
          .maybeSingle(),
        supabase
          .from('torneo_jugadores')
          .select('perfil_id, puntos, partidos_jugados, sets_ganados')
          .eq('torneo_id', tournament.id)
          .eq('categoria', categoria)
          .eq('grupo', grupo),
        supabase
          .from('partidos')
          .select('id, jornada, estado, resultado, jugador1_id, jugador2_id')
          .eq('torneo_id', tournament.id)
          .eq('categoria', categoria)
          .eq('grupo', grupo)
          .order('jornada', { ascending: true })
          .order('fecha_programada', { ascending: true, nullsFirst: false }),
        supabase
          .from('torneo_partidos_historial')
          .select('partido_id, sets_jugador1, sets_jugador2, ganador_perfil_id')
          .eq('torneo_id', tournament.id)
          .eq('categoria', categoria)
          .eq('grupo', grupo),
        supabase
          .from('torneo_propuestas_partido')
          .select('partido_id, estado')
          .eq('torneo_id', tournament.id)
          .eq('categoria', categoria)
          .eq('grupo', grupo),
      ]);

      if (jugadoresResp.error) throw jugadoresResp.error;
      if (partidosResp.error) throw partidosResp.error;
      if (historialResp.error) throw historialResp.error;
      if (propuestasResp.error) throw propuestasResp.error;

      const estadoNormalizado = String(estadoResp.data?.estado || '').trim().toUpperCase();
      setTorneoFinalizado(estadoNormalizado === 'FINALIZADO');

      const jugadores = jugadoresResp.data || [];
      const partidos = partidosResp.data || [];
      const historial = historialResp.data || [];
      const propuestas = propuestasResp.data || [];

      const profileIds = Array.from(new Set([
        ...jugadores.map((row: any) => row.perfil_id),
        ...partidos.flatMap((row: any) => [row.jugador1_id, row.jugador2_id]),
      ].filter(Boolean)));

      const { data: perfiles, error: perfilesError } = await supabase
        .from('perfiles')
        .select('id, nombre_completo')
        .in('id', profileIds);

      if (perfilesError) throw perfilesError;

      const nameById = Object.fromEntries((perfiles || []).map((row: any) => [row.id, row.nombre_completo || 'Jugador']));
      const jugadorById = Object.fromEntries((jugadores || []).map((row: any) => [row.perfil_id, row]));
      const historialByMatch = Object.fromEntries((historial || []).map((row: any) => [row.partido_id, row]));
      const proposalByMatch = Object.fromEntries((propuestas || []).map((row: any) => [row.partido_id, row.estado]));

      const stats: FixturePlayer[] = jugadores.map((row: any) => ({
        perfil_id: row.perfil_id,
        nombre: nameById[row.perfil_id] || 'Jugador',
        puntos: Number(row.puntos || 0),
        partidos_jugados: Number(row.partidos_jugados || 0),
        sets_ganados: Number(row.sets_ganados || 0),
      }));

      stats.sort((a, b) => {
        if (b.puntos !== a.puntos) return b.puntos - a.puntos;
        return b.sets_ganados - a.sets_ganados;
      });
      setPlayersStats(stats);

      const mappedMatches: FixtureMatch[] = partidos.map((row: any) => ({
        id: String(row.id),
        jornada: Number(row.jornada || 1),
        estado: String(row.estado || 'programado'),
        resultado: row.resultado || null,
        proposalState: proposalByMatch[row.id] || null,
        p1: {
          perfil_id: String(row.jugador1_id),
          nombre: nameById[row.jugador1_id] || 'Jugador 1',
          puntos: Number(jugadorById[row.jugador1_id]?.puntos || 0),
          partidos_jugados: Number(jugadorById[row.jugador1_id]?.partidos_jugados || 0),
          sets_ganados: Number(jugadorById[row.jugador1_id]?.sets_ganados || 0),
        },
        p2: {
          perfil_id: String(row.jugador2_id),
          nombre: nameById[row.jugador2_id] || 'Jugador 2',
          puntos: Number(jugadorById[row.jugador2_id]?.puntos || 0),
          partidos_jugados: Number(jugadorById[row.jugador2_id]?.partidos_jugados || 0),
          sets_ganados: Number(jugadorById[row.jugador2_id]?.sets_ganados || 0),
        },
        finalScore: historialByMatch[row.id]
          ? {
              sets_jugador1: Number(historialByMatch[row.id].sets_jugador1 || 0),
              sets_jugador2: Number(historialByMatch[row.id].sets_jugador2 || 0),
              ganador_perfil_id: historialByMatch[row.id].ganador_perfil_id || null,
            }
          : null,
      }));

      setMatches(mappedMatches);
    } catch (err) {
      console.error('No se pudo cargar el estado del fixture', err);
    }
  }, [tournament.id, tournament.subtitle]);

  const fechas = useMemo(() => {
    const unique = Array.from(new Set(matches.map((match) => match.jornada))).sort((a, b) => a - b);
    return unique.length > 0 ? unique : [1];
  }, [matches]);

  const fixtureMatches = useMemo(() => matches.filter((match) => match.jornada === activeFecha), [matches, activeFecha]);

  useEffect(() => {
    if (!fechas.includes(activeFecha)) {
      setActiveFecha(fechas[0] || 1);
    }
  }, [activeFecha, fechas]);

  useEffect(() => {
    loadFixtureData();

    const channel = supabase
      .channel(`fixture-live-${tournament.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'torneo_jugadores' }, loadFixtureData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partidos' }, loadFixtureData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'torneo_partidos_historial' }, loadFixtureData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'torneo_propuestas_partido' }, loadFixtureData)
      .subscribe();

    const intervalId = window.setInterval(loadFixtureData, 15000);

    return () => {
      window.clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [loadFixtureData, tournament.id]);

  const getStatusLabel = (match: FixtureMatch) => {
    if (match.estado === 'finalizado' || match.finalScore) return 'FINAL';
    if (match.proposalState === 'discrepancia') return 'EN DISPUTA';
    if (match.proposalState === 'pendiente' || match.estado === 'en_curso') return 'PENDIENTE RIVAL';
    return 'PROGRAMADO';
  };

  const canReportMatch = (match: FixtureMatch) => {
    if (torneoFinalizado) return false;
    return currentUserId !== '' && [match.p1.perfil_id, match.p2.perfil_id].includes(currentUserId) && match.estado !== 'finalizado';
  };

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto bg-white dark:bg-background-dark font-display text-[#111813] dark:text-white transition-colors duration-200 pb-24">
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

        <div className="px-4 pb-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#61896b] font-bold">{tournament.title}</p>
          <p className="text-sm text-[#111813] dark:text-white font-semibold">{tournament.subtitle || 'General'}</p>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <div className="flex px-4 gap-6 min-w-max">
            {fechas.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFecha(f)}
                className={`flex flex-col items-center justify-center border-b-[3px] pb-3 pt-4 transition-all ${
                  activeFecha === f ? 'border-primary text-[#111813] dark:text-white' : 'border-transparent text-[#61896b]'
                }`}
              >
                <p className={`text-sm tracking-wide ${activeFecha === f ? 'font-bold' : 'font-semibold'}`}>JORNADA {f}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark pb-8 no-scrollbar">
        <div className="px-4 py-4">
          <div className="rounded-xl bg-white dark:bg-[#1a2e1f] p-4 shadow-sm border border-[#dbe6de] dark:border-[#2a3c2e] mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#111813] dark:text-white">Estado en vivo</h3>
              <span className="text-[10px] text-[#61896b] font-bold">Supabase</span>
            </div>
            {playersStats.length === 0 ? (
              <p className="text-sm text-[#61896b]">Todavia no hay estadisticas cargadas para este torneo.</p>
            ) : (
              <div className="space-y-2">
                {playersStats.slice(0, 4).map((p, idx) => (
                  <div key={`${p.perfil_id}-${idx}`} className="grid grid-cols-[22px_1fr_42px_42px_42px] items-center gap-2 text-sm">
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
                <p className="text-sm text-[#61896b]">Todavia no hay partidos cargados para esta jornada.</p>
              </div>
            ) : (
              fixtureMatches.map((match) => {
                const isFinal = Boolean(match.finalScore) || match.estado === 'finalizado';
                const p1Sets = match.finalScore?.sets_jugador1 ?? 0;
                const p2Sets = match.finalScore?.sets_jugador2 ?? 0;
                const p1Won = match.finalScore?.ganador_perfil_id === match.p1.perfil_id;
                const p2Won = match.finalScore?.ganador_perfil_id === match.p2.perfil_id;

                return (
                  <div key={match.id} className="flex flex-col gap-4 rounded-xl bg-white dark:bg-[#1a2e1f] p-4 shadow-sm border border-[#dbe6de] dark:border-[#2a3c2e] hover:shadow-md transition-shadow">
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
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="bg-primary/10 text-[#4a9c40] text-[10px] font-bold px-2 py-0.5 rounded-full">{getStatusLabel(match)}</span>
                        <div className="flex items-center gap-1 text-[#61896b] text-sm font-medium">
                          <span className="material-symbols-outlined text-sm">event</span>
                          <span>Jornada {match.jornada}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[#61896b] text-xs">
                          <span className="material-symbols-outlined text-sm">handshake</span>
                          <span>Dia y horario a coordinar</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate('/match-result', { state: { tournament, partidoId: match.id } })}
                        className="flex-1 h-10 rounded-lg bg-background-light dark:bg-[#2e4a35] text-[#111813] dark:text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                      >
                        <span className="material-symbols-outlined text-lg">sports_tennis</span>
                        {isFinal ? 'Ver Resultado' : canReportMatch(match) ? 'Cargar Resultado' : torneoFinalizado ? 'Solo historial' : 'Ver Detalle'}
                      </button>
                      <button className="w-12 h-10 rounded-lg bg-[#4a9c40] text-white flex items-center justify-center active:scale-95 transition-transform shadow-sm">
                        <span className="material-symbols-outlined font-bold">location_on</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="p-8 mt-4 flex flex-col items-center text-center">
          <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center text-[#4a9c40] mb-4">
            <span className="material-symbols-outlined text-4xl">event_available</span>
          </div>
          <h4 className="text-[#111813] dark:text-white font-bold mb-1">Calendario oficial</h4>
          <p className="text-[#61896b] text-sm max-w-[240px]">Las jornadas se leen desde la tabla de partidos del torneo, por eso ahora cada cruce corresponde al fixture real.</p>
        </div>
      </main>

      <div className="fixed bottom-6 right-6 z-30">
        <button className="size-14 rounded-full bg-[#4a9c40] text-white shadow-lg flex items-center justify-center active:scale-90 transition-transform">
          <span className="material-symbols-outlined text-3xl font-bold">map</span>
        </button>
      </div>
    </div>
  );
};

export default Fixture;
