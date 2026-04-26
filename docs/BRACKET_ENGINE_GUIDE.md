# Motor de Torneos de Eliminación Directa - Guía de Uso

## Overview

El motor de brackets de TuBarrio es un sistema completo para generar y gestionar torneos de eliminación directa con soporte automático de byes, promoción de ganadores y persistencia en Supabase.

## Características Principales

- ✅ **Generación automática de brackets** para 2, 4, 8, 16, 32, 64 jugadores
- ✅ **Manejo inteligente de byes** para números no potencias de 2
- ✅ **Promoción automática** de ganadores a la siguiente ronda
- ✅ **Soporte para brackets de consuelo** (perdedores)
- ✅ **Integración completa** con Supabase
- ✅ **TypeScript fully-typed**
- ✅ **Validaciones robustas** y manejo de errores

## Instalación y Configuración

### 1. Ejecutar la migración de base de datos

```sql
-- Ejecutar en Supabase SQL Editor
-- Archivo: supabase/migrations/20260422_add_bracket_support.sql
```

### 2. Importar el motor

```typescript
import { 
  BracketEngine, 
  createEliminationBracket, 
  createConsolationBracket,
  reportBracketMatchResult,
  BracketPlayer 
} from '../utils/bracketEngine';
```

## Uso Básico

### Crear un Bracket de Eliminación Directa

```typescript
// 1. Preparar jugadores
const jugadores: BracketPlayer[] = [
  { id: 'player-1', name: 'Juan Pérez', seed: 1 },
  { id: 'player-2', name: 'María García', seed: 2 },
  { id: 'player-3', name: 'Carlos López', seed: 3 },
  { id: 'player-4', name: 'Ana Martínez', seed: 4 },
  // ... más jugadores
];

// 2. Crear el bracket
try {
  const tournament = await createEliminationBracket(
    3, // torneo_id
    'Singles Caballeros', // categoría
    jugadores,
    16, // puestos_calificados (potencia de 2)
    'Grupo A' // grupo (opcional)
  );
  
  console.log('Bracket creado:', tournament);
} catch (error) {
  console.error('Error creando bracket:', error.message);
}
```

### Manejo Automático de Byes

```typescript
// Si tienes 13 jugadores para un bracket de 16:
const jugadores = [
  { id: 'p1', name: 'Jugador 1', seed: 1 },
  { id: 'p2', name: 'Jugador 2', seed: 2 },
  // ... 11 jugadores más (total 13)
];

const tournament = await createEliminationBracket(3, 'Singles', jugadores, 16);

// Resultado:
// - 3 byes asignados a los seeds 1, 2, 3
// - 10 jugadores restantes juegan primera ronda
// - Los 3 jugadores con bye avanzan directamente a segunda ronda
```

### Reportar Resultados y Promoción Automática

```typescript
// Cuando un partido termina:
try {
  await reportBracketMatchResult(
    'bracket-r1-p1-1234567890', // partido_id
    'player-1', // ganador_id
    '6-4, 6-2' // resultado en formato string
  );
  
  // El ganador se promueve automáticamente a la siguiente ronda
  console.log('Resultado reportado y ganador promovido');
} catch (error) {
  console.error('Error reportando resultado:', error.message);
}
```

## Uso Avanzado

### Crear Bracket de Consuelo

```typescript
// Para los perdedores de la primera ronda
const perdedores: BracketPlayer[] = [
  { id: 'p5', name: 'Jugador 5' },
  { id: 'p6', name: 'Jugador 6' },
  { id: 'p7', name: 'Jugador 7' },
  { id: 'p8', name: 'Jugador 8' }
];

const consolationBracket = await createConsolationBracket(
  3,
  'Singles Caballeros',
  perdedores,
  8, // bracket más pequeño para consuelo
  'Grupo A'
);
```

### Obtener Bracket Existente

```typescript
// Cargar un bracket ya existente de la base de datos
const existingBracket = await BracketEngine.getBracketFromDatabase(
  3, // torneo_id
  'Singles Caballeros', // categoría
  'Grupo A', // grupo (opcional)
  'eliminacion_directa' // tipo de bracket
);

if (existingBracket) {
  console.log('Rondas:', existingBracket.rondas);
  console.log('Total rondas:', existingBracket.total_rondas);
}
```

### Generación Personalizada

```typescript
// Para control total sobre la generación
const tournament = await BracketEngine.generateBracket(
  3, // torneo_id
  'Singles Damas', // categoría
  jugadores,
  32, // puestos_calificados
  'Grupo B', // grupo
  'eliminacion_directa' // bracket_tipo
);

// Modificar algo antes de guardar
// tournament.rondas[0].partidos[0].fecha_programada = new Date();

// Guardar manualmente
await BracketEngine.saveBracketToDatabase(tournament);
```

## Estructura de Datos

### BracketPlayer

```typescript
interface BracketPlayer {
  id: string;           // UUID del perfil
  name: string;         // Nombre completo
  seed?: number;        // Ranking para bye allocation (1 = mejor)
  stats?: {             // Estadísticas del grupo previo
    puntos: number;
    partidos_jugados: number;
    sets_ganados: number;
  };
}
```

### BracketMatch

```typescript
interface BracketMatch {
  id: string;                    // UUID único
  ronda: number;                 // 1=Octavos, 2=Cuartos, 3=Semifinal, 4=Final
  posicion_bracket: number;      // Posición en la ronda (1-indexed)
  jugador1_id: string | null;    // Jugador 1
  jugador2_id: string | null;    // Jugador 2
  siguiente_partido_id: string | null; // Siguiente partido
  bracket_tipo: 'eliminacion_directa' | 'consuelo';
  torneo_id: number;
  categoria: string;
  grupo?: string;
  estado: 'programado' | 'en_curso' | 'finalizado' | 'esperando_validacion';
  resultado?: string;
  ganador_id?: string | null;
  fecha_programada?: Date;
  is_bye?: boolean;              // True si es un bye automático
}
```

### BracketTournament

```typescript
interface BracketTournament {
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
```

## Flujo de Trabajo Completo

### 1. Fase de Grupos → Playoffs

```typescript
// 1. Obtener jugadores clasificados de la fase de grupos
const grupo1Ganadores = await getClasificadosGrupo(3, 'Singles', 'Grupo 1', 2);
const grupo2Ganadores = await getClasificadosGrupo(3, 'Singles', 'Grupo 2', 2);

// 2. Combinar y ordenar para playoffs
const jugadoresPlayoffs = [
  ...grupo1Ganadores.map(p => ({ ...p, seed: 1 })),
  ...grupo2Ganadores.map(p => ({ ...p, seed: 2 }))
];

// 3. Crear bracket principal
const bracketPrincipal = await createEliminationBracket(
  3,
  'Singles Caballeros',
  jugadoresPlayoffs,
  8, // Cuartos → Semifinal → Final
  'Playoffs'
);

// 4. Crear bracket de consuelo (opcional)
const jugadoresConsuelo = await getPerdedoresPrimeraRonda(3, 'Singles', 'Playoffs');
if (jugadoresConsuelo.length >= 2) {
  const bracketConsuelo = await createConsolationBracket(
    3,
    'Singles Caballeros',
    jugadoresConsuelo,
    4, // Semifinal → Final
    'Consuelo'
  );
}
```

### 2. Gestión de Resultados

```typescript
// Función para manejar resultados de forma robusta
async function handleMatchResult(
  partidoId: string, 
  ganadorId: string, 
  resultado: string
) {
  try {
    await reportBracketMatchResult(partidoId, ganadorId, resultado);
    
    // Opcional: Actualizar estadísticas
    await actualizarEstadisticasJugador(ganadorId, 'victoria');
    await actualizarEstadisticasJugador(perdedorId, 'derrota');
    
    // Opcional: Notificar a jugadores
    await notificarResultado(partidoId, resultado);
    
    return { success: true, message: 'Resultado registrado correctamente' };
  } catch (error) {
    console.error('Error en handleMatchResult:', error);
    return { success: false, message: error.message };
  }
}
```

## Manejo de Errores

### Errores Comunes y Soluciones

```typescript
// 1. Validación de puestos calificados
try {
  await createEliminationBracket(3, 'Singles', jugadores, 15); // Error: no es potencia de 2
} catch (error) {
  if (error.message.includes('potencia de 2')) {
    console.log('Usa 16 en lugar de 15');
  }
}

// 2. Demasiados jugadores
try {
  await createEliminationBracket(3, 'Singles', jugadores, 8); // Error: más de 8 jugadores
} catch (error) {
  if (error.message.includes('más de')) {
    console.log('Reduce jugadores o aumenta puestos calificados');
  }
}

// 3. Partido no encontrado
try {
  await reportBracketMatchResult('invalid-id', 'player-1', '6-0');
} catch (error) {
  if (error.message.includes('no encontrado')) {
    console.log('Verifica el ID del partido');
  }
}
```

## Buenas Prácticas

### 1. Seeds y Ranking

```typescript
// Asignar seeds basados en posición en tabla de grupos
const jugadoresConSeeds = jugadoresGrupo.map((jugador, index) => ({
  ...jugador,
  seed: index + 1 // 1 = mejor clasificado
}));
```

### 2. Validación Previa

```typescript
// Validar antes de crear bracket
function validarBracketInput(jugadores: BracketPlayer[], puestosCalificados: number) {
  if (jugadores.length === 0) {
    throw new Error('No hay jugadores');
  }
  
  if (jugadores.length > puestosCalificados) {
    throw new Error(`Demasiados jugadores: ${jugadores.length} > ${puestosCalificados}`);
  }
  
  const ids = jugadores.map(j => j.id);
  const idsUnicos = new Set(ids);
  if (ids.length !== idsUnicos.size) {
    throw new Error('Hay IDs duplicados');
  }
}
```

### 3. Manejo de Estados

```typescript
// Verificar estado del torneo antes de crear bracket
const estadoTorneo = await getTorneoEstado(3);
if (estadoTorneo !== 'ACTIVO') {
  throw new Error('El torneo debe estar ACTIVO para crear playoffs');
}
```

## Integración con UI

### React Hook para Bracket

```typescript
import { useState, useEffect } from 'react';
import { BracketEngine, BracketTournament } from '../utils/bracketEngine';

export function useBracket(torneoId: number, categoria: string, grupo?: string) {
  const [bracket, setBracket] = useState<BracketTournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBracket();
  }, [torneoId, categoria, grupo]);

  const loadBracket = async () => {
    try {
      setLoading(true);
      const data = await BracketEngine.getBracketFromDatabase(
        torneoId, 
        categoria, 
        grupo,
        'eliminacion_directa'
      );
      setBracket(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const reportResult = async (partidoId: string, ganadorId: string, resultado: string) => {
    try {
      await BracketEngine.promoteWinner(partidoId, ganadorId, resultado);
      await loadBracket(); // Refresh data
    } catch (err) {
      setError(err.message);
    }
  };

  return { bracket, loading, error, reportResult, refresh: loadBracket };
}
```

## Performance y Optimización

### 1. Batch Operations

```typescript
// Para múltiples resultados, usar transacciones
async function reportarMultiplesResultados(resultados: Array<{
  partidoId: string;
  ganadorId: string;
  resultado: string;
}>) {
  // Implementar con RPC de Supabase para transacciones
  const { error } = await supabase.rpc('reportar_batch_resultados', {
    resultados: resultados
  });
  
  if (error) throw error;
}
```

### 2. Caching

```typescript
// Cache simple para brackets
const bracketCache = new Map<string, BracketTournament>();

async function getCachedBracket(torneoId: number, categoria: string) {
  const key = `${torneoId}-${categoria}`;
  
  if (bracketCache.has(key)) {
    return bracketCache.get(key)!;
  }
  
  const bracket = await BracketEngine.getBracketFromDatabase(torneoId, categoria);
  bracketCache.set(key, bracket);
  return bracket;
}
```

## Testing

### Unit Tests

```typescript
import { BracketEngine } from '../utils/bracketEngine';

describe('BracketEngine', () => {
  test('debe generar bracket con 4 jugadores', async () => {
    const jugadores = [
      { id: 'p1', name: 'Player 1', seed: 1 },
      { id: 'p2', name: 'Player 2', seed: 2 },
      { id: 'p3', name: 'Player 3', seed: 3 },
      { id: 'p4', name: 'Player 4', seed: 4 }
    ];

    const tournament = await BracketEngine.generateBracket(
      1, 'Test', jugadores, 4
    );

    expect(tournament.rondas).toHaveLength(2); // Semifinal + Final
    expect(tournament.byes_asignados).toBe(0);
  });

  test('debe manejar byes correctamente', async () => {
    const jugadores = [
      { id: 'p1', name: 'Player 1', seed: 1 },
      { id: 'p2', name: 'Player 2', seed: 2 },
      { id: 'p3', name: 'Player 3', seed: 3 }
    ];

    const tournament = await BracketEngine.generateBracket(
      1, 'Test', jugadores, 4
    );

    expect(tournament.byes_asignados).toBe(1);
  });
});
```

## Conclusión

El motor de brackets de TuBarrio proporciona una solución completa y robusta para torneos de eliminación directa, con manejo automático de casos complejos como byes y promoción de ganadores. Está diseñado para ser extensible, mantenible y fácil de integrar con el resto de la aplicación.
