
import { supabase } from '../services/supabaseClient';

export interface MatchScore {
  player1Id: string;
  player2Id: string;
  sets: { p1: number; p2: number }[];
  isWO?: boolean;
  absentPlayerId?: string;
}

export interface PlayerStats {
  id: string;
  name: string;
  img: string;
  pj: number;
  pts: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  matches: MatchScore[];
}

export const calculateStandings = (players: PlayerStats[], results: MatchScore[]) => {
  // Inicializar estadísticas
  const standings = players.map(p => ({
    ...p,
    pj: 0,
    pts: 0,
    setsWon: 0,
    setsLost: 0,
    gamesWon: 0,
    gamesLost: 0,
  }));

  results.forEach(match => {
    const p1 = standings.find(s => s.id === match.player1Id);
    const p2 = standings.find(s => s.id === match.player2Id);

    if (!p1 || !p2) return;

    if (match.isWO) {
      p1.pj += 1;
      p2.pj += 1;
      if (match.absentPlayerId === match.player1Id) {
        p1.pts -= 1;
        p2.pts += 3;
      } else {
        p2.pts -= 1;
        p1.pts += 3;
      }
      return;
    }

    p1.pj += 1;
    p2.pj += 1;

    let s1 = 0;
    let s2 = 0;
    match.sets.forEach(set => {
      p1.gamesWon += set.p1;
      p1.gamesLost += set.p2;
      p2.gamesWon += set.p2;
      p2.gamesLost += set.p1;

      if (set.p1 > set.p2) s1++;
      else s2++;
    });

    p1.setsWon += s1;
    p1.setsLost += s2;
    p2.setsWon += s2;
    p2.setsLost += s1;

    // Regla de Puntos
    if (s1 > s2) {
      if (s2 === 0) p1.pts += 3; // 2-0
      else p1.pts += 2; // 2-1
      if (s2 === 1) p2.pts += 1; // El perdedor suma 1 si hizo un set (2-1)
    } else {
      if (s1 === 0) p2.pts += 3; // 0-2
      else p2.pts += 2; // 1-2
      if (s1 === 1) p1.pts += 1;
    }
  });

  // Ordenamiento estricto
  return standings.sort((a, b) => {
    // 1° Puntos
    if (b.pts !== a.pts) return b.pts - a.pts;
    
    // 2° Diferencia de Sets
    const diffSetsA = a.setsWon - a.setsLost;
    const diffSetsB = b.setsWon - b.setsLost;
    if (diffSetsB !== diffSetsA) return diffSetsB - diffSetsA;

    // 3° Diferencia de Games
    const diffGamesA = a.gamesWon - a.gamesLost;
    const diffGamesB = b.gamesWon - b.gamesLost;
    if (diffGamesB !== diffGamesA) return diffGamesB - diffGamesA;

    // 4° H2H (Simplificado: el que tenga ID menor por ahora, 
    // en una app real buscaríamos el match específico entre ellos)
    return 0;
  });
};

export const getBestSecondsAverage = (standings: any[]) => {
  return standings.map(player => ({
    ...player,
    average: player.pj > 0 ? (player.pts / player.pj).toFixed(2) : "0.00"
  }));
};

export type TournamentStatus = 'RECRUITING' | 'LOCKED' | 'IN_PROGRESS';

export type RegisterParticipantResult = {
  tournamentId: number;
  userId: string;
  alreadyRegistered: boolean;
  statusBefore: TournamentStatus;
  statusAfter: TournamentStatus;
  currentParticipants: number;
  maxParticipants: number;
  drawTriggered: boolean;
  createdMatches: number;
  byes: string[];
};

type RegisterParticipantRpcRow = {
  torneo_id: number;
  perfil_id: string;
  ya_inscripto: boolean;
  estado_antes: TournamentStatus;
  estado_despues: TournamentStatus;
  participantes_actuales: number;
  max_participantes: number;
  sorteo_disparado: boolean;
  partidos_creados: number;
  byes: string[] | null;
};
export const registerParticipant = async (params: {
  tournamentId: number;
  userId: string;
  categoria: string;
  grupo: string;
  maxParticipants: number;
}): Promise<RegisterParticipantResult> => {
  const { tournamentId, userId, categoria, grupo, maxParticipants } = params;

  if (!tournamentId || !userId || !categoria || !grupo) {
    throw new Error('registerParticipant requiere tournamentId, userId, categoria y grupo');
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('registrar_participante_y_sortear_si_lleno', {
    p_torneo_id: tournamentId,
    p_perfil_id: userId,
    p_categoria: categoria,
    p_grupo: grupo,
    p_max_participantes: Math.max(2, Number(maxParticipants || 8)),
  });

  if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
    const row = rpcData[0] as RegisterParticipantRpcRow;
    return {
      tournamentId: Number(row.torneo_id),
      userId: String(row.perfil_id),
      alreadyRegistered: Boolean(row.ya_inscripto),
      statusBefore: row.estado_antes,
      statusAfter: row.estado_despues,
      currentParticipants: Number(row.participantes_actuales || 0),
      maxParticipants: Number(row.max_participantes || 0),
      drawTriggered: Boolean(row.sorteo_disparado),
      createdMatches: Number(row.partidos_creados || 0),
      byes: row.byes || [],
    };
  }

  if (rpcError) {
    console.warn('RPC registrar_participante_y_sortear_si_lleno no disponible. Se usa fallback cliente.', rpcError.message);
  }

  const existing = await supabase
    .from('torneo_jugadores')
    .select('id')
    .eq('perfil_id', userId)
    .eq('categoria', categoria)
    .eq('grupo', grupo)
    .maybeSingle();

  if (existing.error) throw new Error(existing.error.message);

  let alreadyRegistered = Boolean(existing.data);
  if (!alreadyRegistered) {
    const insert = await supabase
      .from('torneo_jugadores')
      .insert([{ perfil_id: userId, categoria, grupo, puntos: 0, partidos_jugados: 0, sets_ganados: 0 }]);

    if (insert.error) {
      const duplicateError = (insert.error as any).code === '23505';
      if (!duplicateError) throw new Error(insert.error.message);
      alreadyRegistered = true;
    }
  }

  const countRes = await supabase
    .from('torneo_jugadores')
    .select('perfil_id', { count: 'exact', head: true })
    .eq('categoria', categoria)
    .eq('grupo', grupo);

  if (countRes.error) throw new Error(countRes.error.message);

  const current = Number(countRes.count || 0);
  const max = Math.max(2, Number(maxParticipants || 8));

  return {
    tournamentId,
    userId,
    alreadyRegistered,
    statusBefore: 'RECRUITING',
    statusAfter: current >= max ? 'LOCKED' : 'RECRUITING',
    currentParticipants: current,
    maxParticipants: max,
    drawTriggered: false,
    createdMatches: 0,
    byes: [],
  };
};
