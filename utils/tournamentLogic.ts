
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

// Criterios de desempate en orden de prioridad (fase de grupos)
export const TIEBREAKER_CRITERIA = [
  '1° Puntos acumulados',
  '2° Diferencia de sets (ganados − perdidos)',
  '3° Sets ganados (total)',
  '4° Resultado directo (H2H)',
  '5° Diferencia de games (ganados − perdidos)',
] as const;

export const calculateStandings = (players: PlayerStats[], results: MatchScore[]) => {
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

    if (s1 > s2) {
      p1.pts += s2 === 0 ? 3 : 2;
      if (s2 === 1) p2.pts += 1;
    } else {
      p2.pts += s1 === 0 ? 3 : 2;
      if (s1 === 1) p1.pts += 1;
    }
  });

  // Construir mapa de resultados directos (H2H)
  // h2hWinner[idA][idB] = idA si A le ganó a B
  const h2hWinner: Record<string, Record<string, string>> = {};
  results.forEach(match => {
    if (match.isWO) return;
    let s1 = 0, s2 = 0;
    match.sets.forEach(set => {
      if (set.p1 > set.p2) s1++;
      else if (set.p2 > set.p1) s2++;
    });
    if (s1 === s2) return;
    const winner = s1 > s2 ? match.player1Id : match.player2Id;
    const loser  = s1 > s2 ? match.player2Id : match.player1Id;
    if (!h2hWinner[winner]) h2hWinner[winner] = {};
    h2hWinner[winner][loser] = winner;
  });

  const getH2HWinner = (idA: string, idB: string): string | null =>
    h2hWinner[idA]?.[idB] ? idA : h2hWinner[idB]?.[idA] ? idB : null;

  return standings.sort((a, b) => {
    // 1° Puntos
    if (b.pts !== a.pts) return b.pts - a.pts;

    // 2° Diferencia de sets
    const diffSetsA = a.setsWon - a.setsLost;
    const diffSetsB = b.setsWon - b.setsLost;
    if (diffSetsB !== diffSetsA) return diffSetsB - diffSetsA;

    // 3° Sets ganados
    if (b.setsWon !== a.setsWon) return b.setsWon - a.setsWon;

    // 4° Resultado directo (H2H)
    const h2h = getH2HWinner(a.id, b.id);
    if (h2h === a.id) return -1;
    if (h2h === b.id) return 1;

    // 5° Diferencia de games (ganados − perdidos)
    const gamesDiffA = a.gamesWon - a.gamesLost;
    const gamesDiffB = b.gamesWon - b.gamesLost;
    return gamesDiffB - gamesDiffA;
  });
};

export const getBestSecondsAverage = (standings: PlayerStats[]) => {
  return standings.map(player => ({
    ...player,
    average: player.pj > 0 ? (player.pts / player.pj).toFixed(2) : "0.00"
  }));
};

export type TournamentStatus =
  | 'RECRUITING'
  | 'LOCKED'
  | 'INSCRIPCION_ABIERTA'
  | 'INSCRIPCION_CERRADA'
  | 'ARMADO_FIXTURE'
  | 'ACTIVO'
  | 'EN_CURSO'
  | 'PLAYOFFS'
  | 'FINALIZADO';

export type RegisterParticipantResult = {
  tournamentId: number;
  userId: string;
  alreadyRegistered: boolean;
  statusBefore: TournamentStatus;
  statusAfter: TournamentStatus;
  currentParticipants: number;
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
    .eq('torneo_id', tournamentId)
    .eq('perfil_id', userId)
    .eq('categoria', categoria)
    .eq('grupo', grupo)
    .maybeSingle();

  if (existing.error) throw new Error(existing.error.message);

  let alreadyRegistered = Boolean(existing.data);
  if (!alreadyRegistered) {
    const insert = await supabase
      .from('torneo_jugadores')
      .insert([{ torneo_id: tournamentId, perfil_id: userId, categoria, grupo, puntos: 0, partidos_jugados: 0, sets_ganados: 0 }]);

    if (insert.error) {
      const duplicateError = insert.error.code === '23505';
      if (!duplicateError) throw new Error(insert.error.message);
      alreadyRegistered = true;
    }
  }

  const countRes = await supabase
    .from('torneo_jugadores')
    .select('perfil_id', { count: 'exact', head: true })
    .eq('torneo_id', tournamentId)
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
    drawTriggered: false,
    createdMatches: 0,
    byes: [],
  };
};
