-- ============================================================
-- TEST E2E: Torneo de 2 jugadores - Ciclo completo
-- Ejecutar CADA PASO por separado en Supabase SQL Editor.
-- Usamos torneo_id = 3 (ya existe en el frontend como
-- "Caballeros Singles - Intermedia").
-- ============================================================
-- PREREQUISITO: Hay que haber ejecutado antes:
--   1. supabase/migrations/20260326_inscripciones_torneo.sql
--   2. supabase/sql/2026-03-25_result_confirmation_hardening.sql
-- ============================================================


-- ===========================================================
-- PASO 0-A: (SOLO UNA VEZ EN TODA LA VIDA DEL PROYECTO)
-- Ampliar el check constraint de torneo_estado.estado
-- para que acepte todos los estados que usa el frontend.
-- ===========================================================
alter table public.torneo_estado
  drop constraint if exists torneo_estado_estado_check;

alter table public.torneo_estado
  add constraint torneo_estado_estado_check
  check (estado in (
    'RECRUITING',
    'INSCRIPCION_ABIERTA',
    'INSCRIPCION_CERRADA',
    'ARMADO_FIXTURE',
    'ACTIVO',
    'EN_CURSO',
    'PLAYOFFS',
    'FINALIZADO',
    -- LOCKED = cupo lleno, sorteo pendiente (≈ INSCRIPCION_CERRADA)
    'LOCKED'
  ));


-- ===========================================================
-- PASO 0-B: Encontrar tus UUIDs de perfil
-- Copiar los resultados para usarlos en los pasos siguientes.
-- ===========================================================
select id, nombre_completo, rol, whatsapp
from public.perfiles
order by id desc
limit 10;

-- Si queres confirmar columnas disponibles en tu entorno:
-- select column_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'perfiles'
-- order by ordinal_position;

-- Necesitas 2 perfiles:
--   v_user_a_id = tu perfil real (el que usas para loguearte)
--   v_user_b_id = un segundo perfil de prueba
--
-- Si no tenés un segundo usuario todavia:
--   1. En Supabase → Authentication → Users → "Invite user"
--      (crear un segundo email de prueba)
--   2. Loguear con ese segundo usuario una vez en la app para
--      que se cree la fila en perfiles automaticamente.
--   3. Volver a correr este SELECT para ver su UUID.


-- ===========================================================
-- PASO 1: Reset + Setup inicial del torneo de prueba
-- Editar los 2 UUID antes de correr.
-- ===========================================================
do $$
declare
  v_user_a_id uuid := 'REEMPLAZAR-CON-TU-UUID';
  v_user_b_id uuid := 'REEMPLAZAR-CON-UUID-JUGADOR2';
  v_torneo_id bigint := 3;
  v_categoria text := 'Singles Caballeros';
  v_grupo     text := 'TORNEO_3';
begin
  -- Limpieza total del torneo para empezar de cero
  delete from public.torneo_propuestas_partido
    where torneo_id = v_torneo_id;
  delete from public.torneo_partidos_historial
    where torneo_id = v_torneo_id;
  delete from public.partidos
    where torneo_id = v_torneo_id;
  delete from public.torneo_jugadores
    where torneo_id = v_torneo_id;
  delete from public.inscripciones_torneo
    where torneo_id = v_torneo_id;
  delete from public.torneo_estado
    where torneo_id = v_torneo_id;

  -- Estado inicial: inscripcion abierta, maximo 2 jugadores
  insert into public.torneo_estado
    (torneo_id, categoria, grupo, estado, max_participantes, current_participantes)
  values
    (v_torneo_id, v_categoria, v_grupo, 'RECRUITING', 2, 0);

  raise notice '✓ torneo_estado listo: RECRUITING, max 2 jugadores.';
end;
$$;

-- ===========================================================
-- QUE VER EN LA APP despues del PASO 1:
-- → Tournaments → "Disponibles" → Torneo 3 debería aparecer
--   sin ningún bloqueo (status RECRUITING = inscripcion abierta)
-- ===========================================================


-- ===========================================================
-- PASO 2: Simular pago del Jugador A (pendiente_revision)
-- Esto replica lo que hace la app cuando el jugador completa
-- el formulario de pago. Reemplazar el UUID.
-- ===========================================================
insert into public.inscripciones_torneo
  (torneo_id, perfil_id, estado, monto, alias_destino, whatsapp_destino, categoria, grupo)
values
  (3, 'REEMPLAZAR-CON-TU-UUID', 'pendiente_revision', 5000,
   'tubarrio.torneos', '+5491155551234',
   'Singles Caballeros', 'TORNEO_3')
on conflict on constraint uq_inscripcion_torneo_perfil
do update set estado = 'pendiente_revision', updated_at = now();

-- ===========================================================
-- QUE VER EN LA APP despues del PASO 2:
-- → Loguearte como Jugador A → hacer el flujo de pago
--   (Payment.tsx → Confirmation.tsx)
-- → Confirmation debe mostrar "Pago en revisión" (no "inscripto")
-- → torneo_jugadores todavia NO tiene al Jugador A
-- ===========================================================


-- ===========================================================
-- PASO 3: Simular pago del Jugador B (pendiente_revision)
-- Reemplazar el UUID.
-- ===========================================================
insert into public.inscripciones_torneo
  (torneo_id, perfil_id, estado, monto, alias_destino, whatsapp_destino, categoria, grupo)
values
  (3, 'REEMPLAZAR-CON-UUID-JUGADOR2', 'pendiente_revision', 5000,
   'tubarrio.torneos', '+5491155551234',
   'Singles Caballeros', 'TORNEO_3')
on conflict on constraint uq_inscripcion_torneo_perfil
do update set estado = 'pendiente_revision', updated_at = now();


-- ===========================================================
-- PASO 4: Admin aprueba al Jugador A
-- El trigger trg_procesar_inscripcion_aprobada se dispara
-- automaticamente → inserta en torneo_jugadores
--                   → incrementa current_participantes
-- ===========================================================
update public.inscripciones_torneo
set estado = 'pagado_aprobado'
where torneo_id = 3
  and perfil_id = 'REEMPLAZAR-CON-TU-UUID';


-- ===========================================================
-- PASO 5: Admin aprueba al Jugador B
-- ===========================================================
update public.inscripciones_torneo
set estado = 'pagado_aprobado'
where torneo_id = 3
  and perfil_id = 'REEMPLAZAR-CON-UUID-JUGADOR2';


-- ===========================================================
-- VERIFICACION despues del PASO 5:
-- Ambos deben estar en torneo_jugadores, current_participantes=2 y
-- el estado deberia pasar automaticamente a LOCKED (cupo completo).
-- El torneo pasa a EN_CURSO solamente cuando el admin lo inicia manualmente.
-- ===========================================================
select perfil_id, puntos, partidos_jugados
from public.torneo_jugadores
where torneo_id = 3;

select categoria, grupo, current_participantes, max_participantes, estado
from public.torneo_estado
where torneo_id = 3
  and categoria = 'Singles Caballeros'
  and grupo = 'TORNEO_3';


-- ===========================================================
-- PASO 6: Verificar acceso al panel con estado automatico
-- ===========================================================
select categoria, grupo, estado
from public.torneo_estado
where torneo_id = 3
  and categoria = 'Singles Caballeros'
  and grupo = 'TORNEO_3';

-- ===========================================================
-- QUE VER EN LA APP despues del PASO 6:
-- → Tournaments → "Mis Torneos" → Torneo 3 ya NO dice
--   "Torneo en preparación" → hacer click abre TournamentPanel
-- → TournamentPanel muestra fase "LOCKED"
--   pero todavía no hay partido programado → "Sin partido próximo"
-- ===========================================================


-- ===========================================================
-- PASO 7: Crear el fixture (partido entre los 2 jugadores)
-- Con el nuevo flujo, al llenarse el cupo el fixture se crea solo.
-- Este paso ahora es solo para verificar.
-- ===========================================================
select id, jornada, estado, jugador1_id, jugador2_id, fecha_programada
from public.partidos
where torneo_id = 3
  and categoria = 'Singles Caballeros'
  and grupo = 'TORNEO_3'
order by jornada, id;


-- ===========================================================
-- PASO 8: Iniciar torneo manualmente (sin programar fechas)
-- ===========================================================
select *
from public.iniciar_torneo_manual(
  3,
  'Singles Caballeros',
  'TORNEO_3'
);

-- ===========================================================
-- QUE VER EN LA APP despues de los PASOS 7-8:
-- → TournamentPanel (Jugador A): muestra nombre del rival,
--   boton de WhatsApp habilitado (si el rival tiene nro en perfiles)
-- → Fixture.tsx: muestra el partido entre los 2 jugadores
-- → MatchResult.tsx (Jugador A): permite cargar el marcador,
--   muestra los nombres reales de ambos jugadores
-- ===========================================================

-- === FLUJO DE CARGA DE RESULTADO DESDE LA APP ===
-- 1. Loguear como Jugador A → ir a Cargar Resultado
-- 2. Cargar sets (ej: 6-2, 6-1) → confirmar
--    Estado de propuesta queda "pendiente"
-- 3. Loguear como Jugador B → ir a Cargar Resultado
-- 4. Cargar los MISMOS sets → confirmar
--    Estado pasa a "confirmado", historial registrado,
--    puntos actualizados en torneo_jugadores


-- ===========================================================
-- PASO 9 (ULTIMO): Finalizar el torneo
-- ===========================================================
update public.torneo_estado
set estado = 'FINALIZADO'
where torneo_id = 3;

-- ===========================================================
-- QUE VER EN LA APP despues del PASO 9:
-- → MatchResult.tsx: pantalla bloqueada, mensaje
--   "Solo historial - El torneo ya finalizó"
-- → Fixture.tsx: sigue visible (solo consulta, no accion)
-- ===========================================================


-- ===========================================================
-- PASO 9-B: Verificar que el RPC también rechaza (backend guard)
-- Primero obtener el partido_id real:
-- ===========================================================
select id as partido_id, estado, jugador1_id, jugador2_id
from public.partidos
where torneo_id = 3
limit 5;

-- Luego intentar cargar resultado con ese partido_id:
-- (reemplazar los 2 UUID)
--
-- select * from public.proponer_resultado_partido(
--   'PARTIDO-UUID-AQUI'::uuid,
--   'REEMPLAZAR-CON-TU-UUID'::uuid,
--   '[{"j1":6,"j2":2},{"j1":6,"j2":1}]'::jsonb
-- );
--
-- → Debe fallar con:
--   "El torneo ya esta finalizado. No se permiten nuevas cargas de resultado."


-- ===========================================================
-- PASO 10: Verificacion completa post-FINALIZADO
-- Confirmar que los datos historicos estan intactos y
-- que ninguna pantalla permite modificaciones.
-- ===========================================================

-- 10-A: El historial de resultados sigue visible y no se borro
select
  h.partido_id,
  h.sets_jugador1,
  h.sets_jugador2,
  p1.nombre_completo as ganador
from public.torneo_partidos_historial h
left join public.perfiles p1 on p1.id = h.ganador_perfil_id
where h.torneo_id = 3;
-- → Debe mostrar el partido con el resultado que cargaron ambos jugadores.

-- 10-B: Los puntos del ganador quedaron registrados
select
  pf.nombre_completo,
  tj.puntos,
  tj.partidos_jugados,
  tj.sets_ganados
from public.torneo_jugadores tj
join public.perfiles pf on pf.id = tj.perfil_id
where tj.torneo_id = 3
order by tj.puntos desc;
-- → El ganador debe tener puntos > 0 y partidos_jugados = 1.

-- 10-C: Confirmar que el RPC rechaza cualquier intento de carga
-- (reemplazar partido_id y perfil_id con valores reales)
--
-- select * from public.proponer_resultado_partido(
--   'PARTIDO-UUID-AQUI'::uuid,
--   'UUID-DE-CUALQUIER-JUGADOR'::uuid,
--   '[{"j1":6,"j2":0},{"j1":6,"j2":0}]'::jsonb
-- );
-- → Error esperado:
--   "El torneo ya esta finalizado. No se permiten nuevas cargas de resultado."

-- 10-D: Lo que se puede hacer en la app con el torneo FINALIZADO:
-- ✅ Fixture.tsx        → visible, resultados mostrados, boton dice "Solo historial"
-- ✅ Standings.tsx      → visible, posiciones finales
-- ✅ TournamentPanel    → visible, fase muestra "Finalizado",
--                         boton dice "Ver Historial" con icono history
-- ✅ MatchResult.tsx    → abre pero bloquea con "Solo historial"
-- ✅ RPC backend        → rechaza con excepcion
-- ✅ inscripciones_torneo → datos intactos (solo consulta, nadie los borra)

-- ===========================================================
-- RESET COMPLETO (si queres volver al principio)
-- Ejecutar el bloque del PASO 1 nuevamente.
-- ===========================================================
