# RLS Negative Tests

Tests que verifican empíricamente que Usuario A NO puede leer / modificar / borrar datos del Usuario B.

## Setup inicial

```powershell
# Instalar Vitest (si no está instalado)
npm install -D vitest @vitest/ui

# Crear dos usuarios de prueba en Supabase Auth:
#   userA@test.com  /  Test#User#A#2026
#   userB@test.com  /  Test#User#B#2026
# Y crear sus perfiles + inscripciones.
```

## Configurar env vars

Crear `.env.test` (no commitear):

```
VITE_SUPABASE_URL=https://<branch-de-prueba>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-del-branch>
```

> **NO usar el proyecto de producción.** Crear un branch:
> ```
> npx supabase branches create test-rls --persistent=false
> ```

## Correr

```powershell
npx vitest run tests/rls/negative.test.ts
```

## Qué prueba

| Test | Acción intentada | Comportamiento esperado |
|------|------------------|------------------------|
| 1 | A lee inscripciones de B | `data = []` (filtrado por RLS) |
| 2 | A modifica perfil de B | 0 filas afectadas |
| 3 | A reasigna su inscripción a B | Error `WITH CHECK` |
| 4 | A borra partidos | 0 filas (solo admin) |
| 5 | A ve propuestas de partidos ajenos | Solo ve propuestas donde es jugador |
| 6 | Anon lee perfiles | `data = []` |
| 7 | Anon lee inscripciones | `data = []` o error |
| 8 | A invoca RPC con p_user_id=B | RPC usa auth.uid() interno |
