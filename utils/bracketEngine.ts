import { supabase } from '../services/supabaseClient';
import type { Database } from '../types/database.types';

// ============================================================
// TYPES AND INTERFACES
// ============================================================

export interface BracketPlayer {
  id: string;
  name: string;
  seed?: number; // Ranking position for bye allocation
  stats?: {
    puntos: number;
    partidos_jugados: number;
    sets_ganados: number;
  };
}

export interface BracketMatch {
  id: string;
  ronda: number;
  posicion_bracket: number;
  jugador1_id: string | null;
  jugador2_id: string | null;
  siguiente_partido_id: string | null;
  bracket_tipo: 'eliminacion_directa' | 'consuelo';
  torneo_id: number;
  categoria: string;
  grupo?: string;
  estado: 'programado' | 'en_curso' | 'finalizado' | 'esperando_validacion';
  resultado?: string;
  ganador_id?: string | null;
  fecha_programada?: Date;
  is_bye?: boolean; // True if player advances automatically
}

export interface BracketRound {
  ronda: number;
  nombre: string; // 'Octavos', 'Cuartos', 'Semifinal', 'Final'
  partidos: BracketMatch[];
}

export interface BracketTournament {
  torneo_id: number;
  categoria: string;
  grupo?: string;
  bracket_tipo: 'eliminacion_directa' | 'consuelo';
  jugadores: BracketPlayer[];
  rondas: BracketRound[];
  total_rondas: number;
  puestos_calificados: number;
  byes_asignados: number;
}

// ============================================================
// CORE BRACKET ENGINE
// ============================================================

export class BracketEngine {
  
  /**
   * Generate complete elimination bracket with automatic bye handling
   */
  static async generateBracket(
    torneo_id: number,
    categoria: string,
    jugadores: BracketPlayer[],
    puestosCalificados: number = 16,
    grupo?: string,
    bracketTipo: 'eliminacion_directa' | 'consuelo' = 'eliminacion_directa'
  ): Promise<BracketTournament> {
    
    // Validate inputs
    if (puestosCalificados < 2 || !this.isPowerOfTwo(puestosCalificados)) {
      throw new Error('puestosCalificados debe ser una potencia de 2 (2, 4, 8, 16, 32, 64)');
    }
    
    if (jugadores.length === 0) {
      throw new Error('Debe haber al menos un jugador');
    }
    
    if (jugadores.length > puestosCalificados) {
      throw new Error(`No puede haber más de ${puestosCalificados} jugadores`);
    }
    
    // Calculate bracket structure
    const totalRondas = Math.log2(puestosCalificados);
    const byesNecesarios = puestosCalificados - jugadores.length;
    
    // Sort players by seed/ranking for bye allocation
    const jugadoresOrdenados = this.sortPlayersByRanking(jugadores);
    
    // Assign byes to top-ranked players
    const jugadoresConByes = this.assignByes(jugadoresOrdenados, byesNecesarios);
    
    // Generate bracket rounds
    const rondas = this.generateRounds(jugadoresConByes, totalRondas, bracketTipo);
    
    const tournament: BracketTournament = {
      torneo_id,
      categoria,
      grupo,
      bracket_tipo: bracketTipo,
      jugadores: jugadoresOrdenados,
      rondas,
      total_rondas: totalRondas,
      puestos_calificados: puestosCalificados,
      byes_asignados: byesNecesarios
    };
    
    return tournament;
  }
  
  /**
   * Save bracket to Supabase with upsert logic
   */
  static async saveBracketToDatabase(tournament: BracketTournament): Promise<void> {
    const partidosToUpsert: Database['public']['Tables']['partidos']['Insert'][] = [];
    
    // Flatten all matches from all rounds
    tournament.rondas.forEach(ronda => {
      ronda.partidos.forEach(partido => {
        partidosToUpsert.push({
          id: partido.id,
          torneo_id: tournament.torneo_id,
          categoria: tournament.categoria,
          grupo: tournament.grupo || null,
          ronda: partido.ronda,
          posicion_bracket: partido.posicion_bracket,
          jugador1_id: partido.jugador1_id,
          jugador2_id: partido.jugador2_id,
          siguiente_partido_id: partido.siguiente_partido_id,
          bracket_tipo: tournament.bracket_tipo,
          estado: partido.estado,
          resultado: partido.resultado || 'PENDIENTE',
          ganador_id: partido.ganador_id || null,
          jornada: partido.ronda, // Use ronda as jornada for elimination brackets
        });
      });
    });
    
    // Perform upsert operation
    const { error } = await supabase
      .from('partidos')
      .upsert(partidosToUpsert, {
        onConflict: 'id',
        ignoreDuplicates: false
      });
      
    if (error) {
      throw new Error(`Error guardando bracket en base de datos: ${error.message}`);
    }
  }
  
  /**
   * Promote winner to next round automatically
   */
  static async promoteWinner(
    partidoId: string,
    ganadorId: string,
    resultado: string
  ): Promise<void> {
    // Get current match
    const { data: partido, error: partidoError } = await supabase
      .from('partidos')
      .select('*')
      .eq('id', partidoId)
      .single();
      
    if (partidoError || !partido) {
      throw new Error('Partido no encontrado');
    }
    
    // Update current match with winner and result
    const { error: updateError } = await supabase
      .from('partidos')
      .update({
        ganador_id: ganadorId,
        resultado: resultado,
        estado: 'finalizado',
        updated_at: new Date().toISOString()
      })
      .eq('id', partidoId);
      
    if (updateError) {
      throw new Error(`Error actualizando partido: ${updateError.message}`);
    }
    
    // If there's a next match, promote winner
    if (partido.siguiente_partido_id) {
      await this.promotePlayerToNextMatch(partido.siguiente_partido_id, ganadorId, partido);
    }
  }
  
  /**
   * Get complete bracket from database
   */
  static async getBracketFromDatabase(
    torneo_id: number,
    categoria: string,
    grupo?: string,
    bracketTipo: 'eliminacion_directa' | 'consuelo' = 'eliminacion_directa'
  ): Promise<BracketTournament | null> {
    
    let query = supabase
      .from('partidos')
      .select('*')
      .eq('torneo_id', torneo_id)
      .eq('categoria', categoria)
      .eq('bracket_tipo', bracketTipo);
      
    if (grupo) {
      query = query.eq('grupo', grupo);
    } else {
      query = query.is('grupo', null);
    }
    
    const { data: partidos, error } = await query.order('ronda').order('posicion_bracket');
    
    if (error) throw error;
    if (!partidos || partidos.length === 0) return null;
    
    // Organize matches into rounds
    const rondasMap = new Map<number, BracketMatch[]>();
    
    partidos.forEach(partido => {
      const match: BracketMatch = {
        id: partido.id,
        ronda: partido.ronda,
        posicion_bracket: partido.posicion_bracket,
        jugador1_id: partido.jugador1_id,
        jugador2_id: partido.jugador2_id,
        siguiente_partido_id: partido.siguiente_partido_id,
        bracket_tipo: partido.bracket_tipo,
        torneo_id: partido.torneo_id,
        categoria: partido.categoria,
        grupo: partido.grupo || undefined,
        estado: partido.estado,
        resultado: partido.resultado,
        ganador_id: partido.ganador_id,
        fecha_programada: partido.fecha_programada ? new Date(partido.fecha_programada) : undefined,
        is_bye: !partido.jugador1_id || !partido.jugador2_id
      };
      
      if (!rondasMap.has(partido.ronda)) {
        rondasMap.set(partido.ronda, []);
      }
      rondasMap.get(partido.ronda)!.push(match);
    });
    
    // Convert to rounds array with names
    const rondas: BracketRound[] = [];
    const totalRondas = Math.max(...rondasMap.keys());
    
    for (let ronda = 1; ronda <= totalRondas; ronda++) {
      const partidosRonda = rondasMap.get(ronda) || [];
      rondas.push({
        ronda,
        nombre: this.getRoundName(ronda, totalRondas),
        partidos: partidosRonda
      });
    }
    
    // Get unique players from matches
    const playerIds = new Set<string>();
    partidos.forEach(partido => {
      if (partido.jugador1_id) playerIds.add(partido.jugador1_id);
      if (partido.jugador2_id) playerIds.add(partido.jugador2_id);
    });
    
    const jugadores: BracketPlayer[] = [];
    if (playerIds.size > 0) {
      const { data: perfiles } = await supabase
        .from('perfiles')
        .select('id, nombre_completo')
        .in('id', Array.from(playerIds));
        
      if (perfiles) {
        jugadores.push(...perfiles.map(perfil => ({
          id: perfil.id,
          name: perfil.nombre_completo || 'Jugador'
        })));
      }
    }
    
    return {
      torneo_id,
      categoria,
      grupo,
      bracket_tipo: bracketTipo,
      jugadores,
      rondas,
      total_rondas: totalRondas,
      puestos_calificados: Math.pow(2, totalRondas),
      byes_asignados: 0 // Would need to calculate from original data
    };
  }
  
  // ============================================================
  // PRIVATE HELPER METHODS
  // ============================================================
  
  private static isPowerOfTwo(n: number): boolean {
    return n > 0 && (n & (n - 1)) === 0;
  }
  
  private static sortPlayersByRanking(jugadores: BracketPlayer[]): BracketPlayer[] {
    return [...jugadores].sort((a, b) => {
      // Sort by seed first, then by stats if available
      if (a.seed !== undefined && b.seed !== undefined) {
        return a.seed - b.seed;
      }
      if (a.stats && b.stats) {
        // Sort by points, then sets, then matches played
        if (b.stats.puntos !== a.stats.puntos) {
          return b.stats.puntos - a.stats.puntos;
        }
        if (b.stats.sets_ganados !== a.stats.sets_ganados) {
          return b.stats.sets_ganados - a.stats.sets_ganados;
        }
        return b.stats.partidos_jugados - a.stats.partidos_jugados;
      }
      return 0;
    });
  }
  
  private static assignByes(jugadores: BracketPlayer[], byesCount: number): (BracketPlayer | null)[] {
    if (byesCount === 0) return jugadores;
    
    const result: (BracketPlayer | null)[] = [...jugadores];
    
    // Insert null placeholders for byes at the beginning (top seeds)
    for (let i = 0; i < byesCount; i++) {
      result.splice(i * 2 + 1, 0, null);
    }
    
    return result;
  }
  
  private static generateRounds(
    jugadores: (BracketPlayer | null)[],
    totalRondas: number,
    bracketTipo: 'eliminacion_directa' | 'consuelo'
  ): BracketRound[] {
    
    const rondas: BracketRound[] = [];
    const partidosPorRonda = Math.pow(2, totalRondas - 1); // First round has half the slots
    
    // Generate first round with actual players
    const firstRoundMatches: BracketMatch[] = [];
    for (let i = 0; i < jugadores.length; i += 2) {
      const jugador1 = jugadores[i];
      const jugador2 = jugadores[i + 1];
      
      const isBye = !jugador1 || !jugador2;
      const matchId = this.generateMatchId(1, Math.floor(i / 2) + 1);
      
      firstRoundMatches.push({
        id: matchId,
        ronda: 1,
        posicion_bracket: Math.floor(i / 2) + 1,
        jugador1_id: jugador1?.id || null,
        jugador2_id: jugador2?.id || null,
        siguiente_partido_id: this.generateMatchId(2, Math.floor(i / 4) + 1),
        bracket_tipo: bracketTipo,
        torneo_id: 0, // Will be set by caller
        categoria: '', // Will be set by caller
        estado: isBye ? 'finalizado' : 'programado',
        ganador_id: isBye ? (jugador1?.id || jugador2?.id || null) : null,
        is_bye: isBye
      });
    }
    
    rondas.push({
      ronda: 1,
      nombre: this.getRoundName(1, totalRondas),
      partidos: firstRoundMatches
    });
    
    // Generate subsequent rounds
    for (let ronda = 2; ronda <= totalRondas; ronda++) {
      const partidosEnRonda = Math.pow(2, totalRondas - ronda);
      const matches: BracketMatch[] = [];
      
      for (let i = 0; i < partidosEnRonda; i++) {
        const matchId = this.generateMatchId(ronda, i + 1);
        const siguientePartidoId = ronda < totalRondas 
          ? this.generateMatchId(ronda + 1, Math.floor(i / 2) + 1)
          : null;
          
        matches.push({
          id: matchId,
          ronda,
          posicion_bracket: i + 1,
          jugador1_id: null, // Will be filled when previous round completes
          jugador2_id: null, // Will be filled when previous round completes
          siguiente_partido_id: siguientePartidoId,
          bracket_tipo: bracketTipo,
          torneo_id: 0, // Will be set by caller
          categoria: '', // Will be set by caller
          estado: 'programado',
          is_bye: false
        });
      }
      
      rondas.push({
        ronda,
        nombre: this.getRoundName(ronda, totalRondas),
        partidos: matches
      });
    }
    
    return rondas;
  }
  
  private static generateMatchId(ronda: number, posicion: number): string {
    return `bracket-r${ronda}-p${posicion}-${Date.now()}`;
  }
  
  private static getRoundName(ronda: number, totalRondas: number): string {
    const names = ['Final', 'Semifinal', 'Cuartos', 'Octavos', 'Ronda de 16', 'Ronda de 32', 'Ronda de 64'];
    const index = totalRondas - ronda;
    return names[index] || `Ronda ${ronda}`;
  }
  
  private static async promotePlayerToNextMatch(
    siguientePartidoId: string,
    ganadorId: string,
    partidoActual: Database['public']['Tables']['partidos']['Row']
  ): Promise<void> {
    // Get next match
    const { data: siguientePartido, error: siguienteError } = await supabase
      .from('partidos')
      .select('*')
      .eq('id', siguientePartidoId)
      .single();
      
    if (siguienteError || !siguientePartido) {
      throw new Error('Partido siguiente no encontrado');
    }
    
    // Determine which position to fill (player1 or player2)
    const posicionActual = partidoActual.posicion_bracket ?? 0;
    const esPosicionImpar = posicionActual % 2 === 1;
    
    const updateData: Database['public']['Tables']['partidos']['Update'] = {
      updated_at: new Date().toISOString()
    };
    
    if (esPosicionImpar) {
      updateData.jugador1_id = ganadorId;
    } else {
      updateData.jugador2_id = ganadorId;
    }
    
    // Check if both players are now assigned, then mark as ready
    if (updateData.jugador1_id && siguientePartido.jugador2_id) {
      updateData.estado = 'programado';
    } else if (updateData.jugador2_id && siguientePartido.jugador1_id) {
      updateData.estado = 'programado';
    }
    
    const { error: updateError } = await supabase
      .from('partidos')
      .update(updateData)
      .eq('id', siguientePartidoId);
      
    if (updateError) {
      throw new Error(`Error promoviendo ganador: ${updateError.message}`);
    }
  }
}

// ============================================================
// CONVENIENCE FUNCTIONS
// ============================================================

export async function createEliminationBracket(
  torneo_id: number,
  categoria: string,
  jugadores: BracketPlayer[],
  puestosCalificados: number = 16,
  grupo?: string
): Promise<BracketTournament> {
  
  const tournament = await BracketEngine.generateBracket(
    torneo_id,
    categoria,
    jugadores,
    puestosCalificados,
    grupo,
    'eliminacion_directa'
  );
  
  await BracketEngine.saveBracketToDatabase(tournament);
  return tournament;
}

export async function createConsolationBracket(
  torneo_id: number,
  categoria: string,
  jugadores: BracketPlayer[],
  puestosCalificados: number = 8,
  grupo?: string
): Promise<BracketTournament> {
  
  const tournament = await BracketEngine.generateBracket(
    torneo_id,
    categoria,
    jugadores,
    puestosCalificados,
    grupo,
    'consuelo'
  );
  
  await BracketEngine.saveBracketToDatabase(tournament);
  return tournament;
}

export async function reportBracketMatchResult(
  partidoId: string,
  ganadorId: string,
  resultado: string
): Promise<void> {
  await BracketEngine.promoteWinner(partidoId, ganadorId, resultado);
}
