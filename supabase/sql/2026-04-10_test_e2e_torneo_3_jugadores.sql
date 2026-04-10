-- ============================================================
-- TEST E2E: Torneo de 3 jugadores - flujo actual
-- Ejecutar CADA PASO por separado en Supabase SQL Editor.
--
-- IMPORTANTE:
-- - El sorteo automatico ahora crea round robin completo por grupo.
-- - Con 3 jugadores: crea 3 partidos en 3 jornadas.
-- ============================================================

-- ===========================================================
-- PASO 0: Obtener 3 UUID de perfiles
-- ===========================================================
select id, nombre_completo, rol, whatsapp
from public.perfiles
order by id desc
limit 20;

-- Necesitas:
--   v_user_a_id = tu usuario principal
--   v_user_b_id = jugador 2
--   v_user_c_id = jugador 3


-- ===========================================================
-- PASO 1: Reset + Setup inicial del torneo
-- Editar los 3 UUID antes de ejecutar.
-- ===========================================================
do $$
declare
  v_user_a_id uuid := 'REEMPLAZAR-CON-TU-UUID';
  v_user_b_id uuid := 'REEMPLAZAR-CON-UUID-JUGADOR2';
  v_user_c_id uuid := 'REEMPLAZAR-CON-UUID-JUGADOR3';

  v_torneo_id bigint := 3;
  v_categoria text := 'Singles Caballeros';
  v_grupo text := 'TORNEO_3';
begin
  -- Limpieza completa de scope
  delete from public.torneo_propuestas_partido
   where torneo_id = v_torneo_id
     and categoria = v_categoria
     and grupo = v_grupo;

  delete from public.torneo_partidos_historial
   where torneo_id = v_torneo_id
     and categoria = v_categoria
     and grupo = v_grupo;

  delete from public.partidos
   where torneo_id = v_torneo_id
     and categoria = v_categoria
     and grupo = v_grupo;

  delete from public.torneo_jugadores
   where torneo_id = v_torneo_id
     and categoria = v_categoria
     and grupo = v_grupo;

  delete from public.inscripciones_torneo
   where torneo_id = v_torneo_id
     and categoria = v_categoria
     and grupo = v_grupo;

  delete from public.torneo_estado
   where torneo_id = v_torneo_id
     and categoria = v_categoria
     and grupo = v_grupo;

  insert into public.torneo_estado
    (torneo_id, categoria, grupo, estado, max_participantes, current_participantes)
  values
    (v_torneo_id, v_categoria, v_grupo, 'RECRUITING', 3, 0);

  raise notice 'OK: torneo_estado listo en RECRUITING con max_participantes=3';
end;
$$;


-- ===========================================================
-- PASO 2: Crear 3 inscripciones pendientes
-- ===========================================================
insert into public.inscripciones_torneo
  (torneo_id, perfil_id, estado, monto, alias_destino, whatsapp_destino, categoria, grupo)
values
  (3, 'REEMPLAZAR-CON-TU-UUID', 'pendiente_revision', 5000,
   'tubarrio.torneos', '+5491155551234', 'Singles Caballeros', 'TORNEO_3')
on conflict on constraint uq_inscripcion_torneo_perfil
do update set estado = 'pendiente_revision', updated_at = now();

insert into public.inscripciones_torneo
  (torneo_id, perfil_id, estado, monto, alias_destino, whatsapp_destino, categoria, grupo)
values
  (3, 'REEMPLAZAR-CON-UUID-JUGADOR2', 'pendiente_revision', 5000,
   'tubarrio.torneos', '+5491155551234', 'Singles Caballeros', 'TORNEO_3')
on conflict on constraint uq_inscripcion_torneo_perfil
do update set estado = 'pendiente_revision', updated_at = now();

insert into public.inscripciones_torneo
  (torneo_id, perfil_id, estado, monto, alias_destino, whatsapp_destino, categoria, grupo)
values
  (3, 'REEMPLAZAR-CON-UUID-JUGADOR3', 'pendiente_revision', 5000,
   'tubarrio.torneos', '+5491155551234', 'Singles Caballeros', 'TORNEO_3')
on conflict on constraint uq_inscripcion_torneo_perfil
do update set estado = 'pendiente_revision', updated_at = now();


-- ===========================================================
-- PASO 3: Aprobar los 3 pagos (dispara trigger de inscripcion)
-- ===========================================================
update public.inscripciones_torneo
set estado = 'pagado_aprobado'
where torneo_id = 3
  and perfil_id = 'REEMPLAZAR-CON-TU-UUID';

update public.inscripciones_torneo
set estado = 'pagado_aprobado'
where torneo_id = 3
  and perfil_id = 'REEMPLAZAR-CON-UUID-JUGADOR2';

update public.inscripciones_torneo
set estado = 'pagado_aprobado'
where torneo_id = 3
  and perfil_id = 'REEMPLAZAR-CON-UUID-JUGADOR3';


-- ===========================================================
-- PASO 4: Verificar estado y jugadores
-- Esperado: current_participantes=3, max_participantes=3, estado=LOCKED
-- ===========================================================
select categoria, grupo, current_participantes, max_participantes, estado, sorteo_realizado
from public.torneo_estado
where torneo_id = 3
  and categoria = 'Singles Caballeros'
  and grupo = 'TORNEO_3';

select perfil_id, puntos, partidos_jugados, sets_ganados
from public.torneo_jugadores
where torneo_id = 3
  and categoria = 'Singles Caballeros'
  and grupo = 'TORNEO_3'
order by perfil_id;


-- ===========================================================
-- PASO 5: Verificar fixture generado automaticamente
-- Esperado con 3 jugadores (round robin):
--   - 3 partidos totales
--   - 3 jornadas
--   - cada par de jugadores se cruza 1 vez
-- ===========================================================
select id, jornada, estado, jugador1_id, jugador2_id, fecha_programada
from public.partidos
where torneo_id = 3
  and categoria = 'Singles Caballeros'
  and grupo = 'TORNEO_3'
order by jornada, id;

-- Conteos esperados
select
  count(*) as partidos_totales,
  count(distinct jornada) as jornadas_totales
from public.partidos
where torneo_id = 3
  and categoria = 'Singles Caballeros'
  and grupo = 'TORNEO_3';

-- Debe devolver 0 filas (no hay cruces repetidos)
select
  least(p.jugador1_id::text, p.jugador2_id::text) as par_a,
  greatest(p.jugador1_id::text, p.jugador2_id::text) as par_b,
  count(*) as repeticiones
from public.partidos p
where p.torneo_id = 3
  and p.categoria = 'Singles Caballeros'
  and p.grupo = 'TORNEO_3'
group by
  least(p.jugador1_id::text, p.jugador2_id::text),
  greatest(p.jugador1_id::text, p.jugador2_id::text)
having count(*) > 1;


-- ===========================================================
-- PASO 6: Iniciar torneo manualmente (LOCKED -> EN_CURSO)
-- ===========================================================
select *
from public.iniciar_torneo_manual(
  3,
  'Singles Caballeros',
  'TORNEO_3'
);


-- ===========================================================
-- PASO 7: Cargar y confirmar resultados de los partidos
-- (hacerlo desde la app con cada cruce del fixture)
-- ===========================================================

-- Ver partido real para saber quienes juegan:
select id as partido_id, jugador1_id, jugador2_id, estado
from public.partidos
where torneo_id = 3
  and categoria = 'Singles Caballeros'
  and grupo = 'TORNEO_3'
order by jornada, id;

-- Luego confirmar que impacto en historial y tabla de posiciones:
select
  h.partido_id,
  h.ganador_perfil_id,
  h.sets_jugador1,
  h.sets_jugador2,
  h.created_at
from public.torneo_partidos_historial h
where h.torneo_id = 3
  and h.categoria = 'Singles Caballeros'
  and h.grupo = 'TORNEO_3'
order by h.created_at desc;

select
  tj.perfil_id,
  tj.puntos,
  tj.partidos_jugados,
  tj.sets_ganados
from public.torneo_jugadores tj
where tj.torneo_id = 3
  and tj.categoria = 'Singles Caballeros'
  and tj.grupo = 'TORNEO_3'
order by tj.puntos desc, tj.sets_ganados desc;


-- ===========================================================
-- PASO 8 (opcional): Finalizar torneo
-- ===========================================================
update public.torneo_estado
set estado = 'FINALIZADO', updated_at = now()
where torneo_id = 3
  and categoria = 'Singles Caballeros'
  and grupo = 'TORNEO_3';

select torneo_id, categoria, grupo, estado, updated_at
from public.torneo_estado
where torneo_id = 3
  and categoria = 'Singles Caballeros'
  and grupo = 'TORNEO_3';
