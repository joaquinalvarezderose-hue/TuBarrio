
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
