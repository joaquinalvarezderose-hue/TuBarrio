# Instrucciones: Agregar pruebatorneo22 y pruebatorneo23 al Torneo 19 (GRUPO 1)

## Resumen

Se han creado scripts SQL y una función RPC para agregar dos usuarios de prueba (`pruebatorneo22` y `pruebatorneo23`) al torneo 19 en el GRUPO 1, y generar automáticamente los partidos de round robin para ese grupo.

## Archivos creados

1. **supabase/sql/2026-07-12_rpc_add_users_to_group.sql** - Función RPC que hace la operación
2. **supabase/sql/2026-07-12_agregar_usuarios_torneo_19.sql** - Script directo (alternativa)
3. **lib/addUsersToTournament.ts** - Funciones TypeScript para ejecutar desde la app

## Opción 1: Ejecutar la función RPC desde el SQL Editor de Supabase (RECOMENDADO)

### Pasos:

1. **Crear la función RPC:**
   - Abre [Supabase SQL Editor](https://app.supabase.com/project/_/sql/new)
   - Copia y pega el contenido de `supabase/sql/2026-07-12_rpc_add_users_to_group.sql`
   - Ejecuta el script

2. **Ejecutar la operación:**
   ```sql
   SELECT * FROM public.add_users_to_tournament_group(
     19,
     'GRUPO 1',
     'pruebatorneo22',
     'pruebatorneo23'
   );
   ```

3. **Verificar resultados:**
   - La función retornará un resultado indicando:
     - `success`: true/false
     - `message`: Mensaje descriptivo
     - `participantes_actuales`: Número total de jugadores en el grupo
     - `partidos_creados`: Número de partidos generados

## Opción 2: Ejecutar el script directo

Si prefieres ejecutar el script SQL completo directamente:

1. Abre el SQL Editor de Supabase
2. Copia el contenido de `supabase/sql/2026-07-12_agregar_usuarios_torneo_19.sql`
3. Ejecuta el script
4. Revisa los notices (mensajes informativos) en la consola

## Opción 3: Desde la aplicación TypeScript (requiere agregar interfaz)

Primero, ejecuta la función RPC usando la Opción 1. Luego, desde la app:

```typescript
import { addUsersToTournament19 } from './lib/addUsersToTournament';

// En un componente de admin
const result = await addUsersToTournament19();
console.log(result);
```

## ¿Qué hace el script?

1. **Verifica permisos:** Solo administradores pueden ejecutar
2. **Busca los usuarios:** Localiza `pruebatorneo22` y `pruebatorneo23` por nombre de usuario o email
3. **Valida el grupo:** Verifica que el GRUPO 1 existe en el torneo 19
4. **Agrega usuarios:** Inserta los usuarios en la tabla `torneo_jugadores`
5. **Limpia partidos anteriores:** Borra partidos sin resultados para regenerar
6. **Genera fixture:** Crea todos los partidos de round robin (cada jugador vs cada otro jugador)
7. **Actualiza estado:** Marca el grupo como LOCKED y sorteo_realizado = true

## Datos técnicos

- **Torneo:** ID 19 (PRUEBA NO ENTRAR)
- **Grupo:** GRUPO 1
- **Usuarios:** pruebatorneo22, pruebatorneo23
- **Categoría:** Se obtiene automáticamente del subtítulo del torneo
- **Cantidad de partidos:** Si el grupo tenía 2 usuarios, ahora tendrá:
  - 2 usuarios previos + 2 nuevos = 4 usuarios
  - Total de partidos en round robin: 4 × 3 / 2 = 6 partidos

## Verificación posterior

Después de ejecutar, verifica en Supabase:

```sql
-- Ver jugadores en el grupo
SELECT p.username, tj.puntos, tj.partidos_jugados
FROM public.torneo_jugadores tj
JOIN public.perfiles p ON tj.perfil_id = p.id
WHERE tj.torneo_id = 19 AND tj.grupo = 'GRUPO 1';

-- Ver partidos generados
SELECT jugador1_id, jugador2_id, jornada, estado
FROM public.partidos
WHERE torneo_id = 19 AND grupo = 'GRUPO 1'
ORDER BY jornada;

-- Ver estado del grupo
SELECT estado, current_participantes, max_participantes, sorteo_realizado
FROM public.torneo_estado
WHERE torneo_id = 19 AND grupo = 'GRUPO 1';
```

## Notas importantes

- ⚠️ Esta es una **operación de excepción única** para testing
- ✅ Respeta la lógica existente de inscripciones sin romperla
- ✅ Usa las funciones existentes (`generar_fixture_round_robin_grupo`)
- ✅ Es idempotente: ejecutarla dos veces tiene el mismo efecto (no duplica usuarios)
- ✅ Solo administradores pueden ejecutar

## Troubleshooting

**Error: "No se encontraron los usuarios"**
- Verifica que los usuarios existan en la tabla `perfiles`
- Revisa que el nombre de usuario sea exacto (sin caracteres adicionales)

**Error: "No existe el grupo"**
- Verifica que el GRUPO 1 existe en el torneo 19
- Ejecuta: `SELECT * FROM public.torneo_estado WHERE torneo_id = 19;`

**Error: "El grupo ya tiene X partidos"**
- Los partidos sin resultados se limpian automáticamente
- Si aún hay partidos con resultados, no se pueden regenerar

**Error: "Error al generar partidos"**
- Verifica que la tabla `partidos` tiene todas las columnas necesarias
- Revisa que el grupo no sea PLAYOFFS (solo funciona con GRUPOS)
