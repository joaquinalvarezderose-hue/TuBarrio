/**
 * Ejemplo completo de implementación del motor de brackets
 * Este archivo demuestra el flujo completo desde fase de grupos hasta playoffs
 */

import { 
  BracketEngine, 
  createEliminationBracket, 
  createConsolationBracket,
  reportBracketMatchResult,
  BracketPlayer 
} from '../utils/bracketEngine';
import { supabase } from '../services/supabaseClient';

// ============================================================
// EJEMPLO 1: FLUJO COMPLETO DE GRUPOS A PLAYOFFS
// ============================================================

async function ejemploFlujoCompleto() {
  console.log('🏆 Iniciando flujo completo de torneo...');
  
  try {
    // 1. Simular datos de fase de grupos
    const jugadoresGrupo1 = await getJugadoresGrupo(3, 'Singles Caballeros', 'TORNEO_3_G1');
    const jugadoresGrupo2 = await getJugadoresGrupo(3, 'Singles Caballeros', 'TORNEO_3_G2');
    
    console.log(`📊 Grupo 1: ${jugadoresGrupo1.length} jugadores`);
    console.log(`📊 Grupo 2: ${jugadoresGrupo2.length} jugadores`);
    
    // 2. Obtener clasificados (top 2 de cada grupo)
    const clasificadosG1 = jugadoresGrupo1.slice(0, 2);
    const clasificadosG2 = jugadoresGrupo2.slice(0, 2);
    
    // 3. Preparar jugadores para playoffs con seeds basados en posición
    const jugadoresPlayoffs: BracketPlayer[] = [
      { ...clasificadosG1[0], seed: 1 }, // Mejor del Grupo 1
      { ...clasificadosG2[0], seed: 2 }, // Mejor del Grupo 2
      { ...clasificadosG1[1], seed: 3 }, // Segundo del Grupo 1
      { ...clasificadosG2[1], seed: 4 }, // Segundo del Grupo 2
    ];
    
    console.log('🎯 Jugadores clasificados para playoffs:');
    jugadoresPlayoffs.forEach((j, i) => {
      console.log(`  ${i + 1}. ${j.name} (Seed: ${j.seed})`);
    });
    
    // 4. Crear bracket principal
    console.log('\n🏗️ Creando bracket principal...');
    const bracketPrincipal = await createEliminationBracket(
      3, // torneo_id
      'Singles Caballeros',
      jugadoresPlayoffs,
      4, // 4 jugadores = Semifinales + Final
      'Playoffs'
    );
    
    console.log(`✅ Bracket creado con ${bracketPrincipal.rondas.length} rondas`);
    console.log(`   Byes asignados: ${bracketPrincipal.byes_asignados}`);
    
    // 5. Simular resultados
    console.log('\n🎾 Simulando resultados...');
    await simularResultados(bracketPrincipal);
    
    // 6. Crear bracket de consuelo para perdedores
    const perdedores = await getPerdedoresPrimeraRonda(3, 'Singles Caballeros', 'Playoffs');
    if (perdedores.length >= 2) {
      console.log('\n🏟️ Creando bracket de consuelo...');
      const bracketConsuelo = await createConsolationBracket(
        3,
        'Singles Caballeros',
        perdedores,
        2, // Final directa
        'Consuelo'
      );
      console.log('✅ Bracket de consuelo creado');
    }
    
    console.log('\n🎉 Torneo completado exitosamente!');
    
  } catch (error) {
    console.error('❌ Error en flujo completo:', error);
  }
}

// ============================================================
// EJEMPLO 2: TORNEO GRANDE CON BYES
// ============================================================

async function ejemploTorneoGrande() {
  console.log('\n🏆 Ejemplo: Torneo grande con byes...');
  
  try {
    // Simular 13 jugadores para un bracket de 16
    const jugadores: BracketPlayer[] = [
      { id: 'p1', name: 'Carlos Rodríguez', seed: 1 },
      { id: 'p2', name: 'María González', seed: 2 },
      { id: 'p3', name: 'Juan Pérez', seed: 3 },
      { id: 'p4', name: 'Ana Martínez', seed: 4 },
      { id: 'p5', name: 'Luis Sánchez', seed: 5 },
      { id: 'p6', name: 'Laura López', seed: 6 },
      { id: 'p7', name: 'Diego Fernández', seed: 7 },
      { id: 'p8', name: 'Sofía Díaz', seed: 8 },
      { id: 'p9', name: 'Roberto García', seed: 9 },
      { id: 'p10', name: 'Carmen Jiménez', seed: 10 },
      { id: 'p11', name: 'Miguel Álvarez', seed: 11 },
      { id: 'p12', name: 'Elena Moreno', seed: 12 },
      { id: 'p13', name: 'Antonio Ruiz', seed: 13 },
    ];
    
    console.log(`📊 ${jugadores.length} jugadores para bracket de 16`);
    
    const tournament = await createEliminationBracket(
      4,
      'Singles Damas',
      jugadores,
      16, // 16 puestos
      'Grupo A'
    );
    
    console.log(`✅ Bracket creado:`);
    console.log(`   - Rondas: ${tournament.total_rondas}`);
    console.log(`   - Byes: ${tournament.byes_asignados}`);
    console.log(`   - Partidos por ronda:`);
    
    tournament.rondas.forEach(ronda => {
      console.log(`     ${ronda.nombre}: ${ronda.partidos.length} partidos`);
    });
    
    // Mostrar quién obtuvo los byes
    const partidosPrimeraRonda = tournament.rondas[0].partidos;
    const partidosConBye = partidosPrimeraRonda.filter(p => p.is_bye);
    
    if (partidosConBye.length > 0) {
      console.log('\n🎯 Jugadores con bye (avanzan directamente):');
      partidosConBye.forEach(partido => {
        const jugadorId = partido.jugador1_id || partido.jugador2_id;
        const jugador = jugadores.find(j => j.id === jugadorId);
        console.log(`   - ${jugador?.name} (Seed: ${jugador?.seed})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error en torneo grande:', error);
  }
}

// ============================================================
// EJEMPLO 3: GESTIÓN DE RESULTADOS EN TIEMPO REAL
// ============================================================

async function ejemploGestionResultados() {
  console.log('\n🏆 Ejemplo: Gestión de resultados en tiempo real...');
  
  try {
    // Cargar bracket existente
    const bracket = await BracketEngine.getBracketFromDatabase(
      3,
      'Singles Caballeros',
      'Playoffs',
      'eliminacion_directa'
    );
    
    if (!bracket) {
      console.log('❌ No hay bracket encontrado');
      return;
    }
    
    console.log(`📋 Bracket cargado con ${bracket.rondas.length} rondas`);
    
    // Obtener partidos programados
    const partidosProgramados = bracket.rondas
      .flatMap(r => r.partidos)
      .filter(p => p.estado === 'programado' && !p.is_bye);
    
    console.log(`🎾 ${partidosProgramados.length} partidos programados`);
    
    // Simular reporte de resultados
    for (const partido of partidosProgramados.slice(0, 2)) { // Solo primeros 2
      if (partido.jugador1_id && partido.jugador2_id) {
        // Simular resultado aleatorio
        const ganadorId = Math.random() > 0.5 ? partido.jugador1_id : partido.jugador2_id;
        const resultado = Math.random() > 0.5 ? '6-4, 6-3' : '6-2, 6-4';
        
        console.log(`\n🏅 Reportando resultado:`);
        console.log(`   Partido: ${partido.id}`);
        console.log(`   Ganador: ${ganadorId}`);
        console.log(`   Resultado: ${resultado}`);
        
        await reportBracketMatchResult(partido.id, ganadorId, resultado);
        
        console.log('✅ Resultado reportado y ganador promovido');
        
        // Pequeña pausa para simular tiempo real
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Verificar estado actualizado
    const bracketActualizado = await BracketEngine.getBracketFromDatabase(
      3,
      'Singles Caballeros',
      'Playoffs',
      'eliminacion_directa'
    );
    
    if (bracketActualizado) {
      const partidosFinalizados = bracketActualizado.rondas
        .flatMap(r => r.partidos)
        .filter(p => p.estado === 'finalizado');
      
      console.log(`\n📊 Estado actualizado:`);
      console.log(`   Partidos finalizados: ${partidosFinalizados.length}`);
      console.log(`   Próxima ronda con jugadores asignados: ${
        bracketActualizado.rondas
          .slice(1)
          .filter(r => r.partidos.some(p => p.jugador1_id && p.jugador2_id))
          .length
      }`);
    }
    
  } catch (error) {
    console.error('❌ Error en gestión de resultados:', error);
  }
}

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

async function getJugadoresGrupo(
  torneoId: number, 
  categoria: string, 
  grupo: string
): Promise<BracketPlayer[]> {
  try {
    const { data, error } = await supabase
      .from('torneo_jugadores')
      .select(`
        perfil_id,
        puntos,
        partidos_jugados,
        sets_ganados,
        perfiles!inner(
          nombre_completo
        )
      `)
      .eq('torneo_id', torneoId)
      .eq('categoria', categoria)
      .eq('grupo', grupo)
      .order('puntos', { ascending: false })
      .order('sets_ganados', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map(row => ({
      id: row.perfil_id,
      name: (row.perfiles as any).nombre_completo || 'Jugador',
      stats: {
        puntos: row.puntos,
        partidos_jugados: row.partidos_jugados,
        sets_ganados: row.sets_ganados
      }
    }));
  } catch (error) {
    console.error('Error obteniendo jugadores del grupo:', error);
    return [];
  }
}

async function getPerdedoresPrimeraRonda(
  torneoId: number,
  categoria: string,
  grupo: string
): Promise<BracketPlayer[]> {
  try {
    const { data, error } = await supabase
      .from('partidos')
      .select(`
        jugador1_id,
        jugador2_id,
        ganador_id,
        perfiles_jugador1!inner(
          nombre_completo
        ),
        perfiles_jugador2!inner(
          nombre_completo
        )
      `)
      .eq('torneo_id', torneoId)
      .eq('categoria', categoria)
      .eq('grupo', grupo)
      .eq('ronda', 1)
      .eq('estado', 'finalizado');
    
    if (error) throw error;
    
    const perdedores: BracketPlayer[] = [];
    
    (data || []).forEach(partido => {
      if (partido.ganador_id === partido.jugador1_id && partido.jugador2_id) {
        perdedores.push({
          id: partido.jugador2_id,
          name: (partido.perfiles_jugador2 as any).nombre_completo || 'Jugador'
        });
      } else if (partido.ganador_id === partido.jugador2_id && partido.jugador1_id) {
        perdedores.push({
          id: partido.jugador1_id,
          name: (partido.perfiles_jugador1 as any).nombre_completo || 'Jugador'
        });
      }
    });
    
    return perdedores;
  } catch (error) {
    console.error('Error obteniendo perdedores:', error);
    return [];
  }
}

async function simularResultados(tournament: any) {
  console.log('🎾 Simulando resultados del torneo...');
  
  for (let rondaIndex = 0; rondaIndex < tournament.rondas.length; rondaIndex++) {
    const ronda = tournament.rondas[rondaIndex];
    console.log(`\n📅 ${ronda.nombre}:`);
    
    for (const partido of ronda.partidos) {
      if (partido.is_bye) {
        const jugadorId = partido.jugador1_id || partido.jugador2_id;
        const jugador = tournament.jugadores.find((j: BracketPlayer) => j.id === jugadorId);
        console.log(`   ✅ ${jugador?.name} avanza por bye`);
        continue;
      }
      
      if (partido.jugador1_id && partido.jugador2_id) {
        // Simular resultado
        const ganadorId = Math.random() > 0.5 ? partido.jugador1_id : partido.jugador2_id;
        const sets = Math.random() > 0.5 ? 2 : 3;
        const resultado = sets === 2 ? '6-4, 6-3' : '6-4, 3-6, 6-2';
        
        console.log(`   🏅 ${partido.jugador1_id} vs ${partido.jugador2_id}`);
        console.log(`      Ganador: ${ganadorId} (${resultado})`);
        
        try {
          await reportBracketMatchResult(partido.id, ganadorId, resultado);
        } catch (error) {
          console.log(`      ⚠️ Error: ${error.message}`);
        }
      }
    }
    
    // Pequeña pausa entre rondas
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// ============================================================
// EJECUCIÓN DE EJEMPLOS
// ============================================================

export async function runBracketExamples() {
  console.log('🚀 Iniciando ejemplos del motor de brackets...\n');
  
  // Ejecutar ejemplos en secuencia
  await ejemploFlujoCompleto();
  await ejemploTorneoGrande();
  await ejemploGestionResultados();
  
  console.log('\n✅ Todos los ejemplos completados');
}

// Si se ejecuta directamente
if (require.main === module) {
  runBracketExamples().catch(console.error);
}
