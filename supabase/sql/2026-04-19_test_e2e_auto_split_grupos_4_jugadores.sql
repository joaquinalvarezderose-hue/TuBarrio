-- ============================================================
-- TEST E2E: Auto-split con 4 jugadores
-- Objetivo: validar que, al completarse un grupo de 2 jugadores,
-- el siguiente jugador vaya a un nuevo grupo automático.
-- ============================================================

-- PASO 0: Obtén 4 UUIDs de perfiles válidos.
select id, nombre_completo
from public.perfiles
order by id desc
limit 20;

-- PASO 1: Ajusta estos valores a tu torneo de prueba.
do $$
declare
  v_torneo_id bigint := 3;
  v_categoria text := 'Singles Caballeros';
  v_grupo_base text := 'TORNEO_3';
begin
  delete from public.torneo_propuestas_partido
   where torneo_id = v_torneo_id
     and categoria = v_categoria
     and (grupo = v_grupo_base or grupo like (v_grupo_base || '\_G%') escape '\');

  delete from public.torneo_partidos_historial
   where torneo_id = v_torneo_id
     and categoria = v_categoria
     and (grupo = v_grupo_base or grupo like (v_grupo_base || '\_G%') escape '\');

  delete from public.partidos
   where torneo_id = v_torneo_id
     and categoria = v_categoria
     and (grupo = v_grupo_base or grupo like (v_grupo_base || '\_G%') escape '\');

  delete from public.torneo_jugadores
   where torneo_id = v_torneo_id
     and categoria = v_categoria
     and (grupo = v_grupo_base or grupo like (v_grupo_base || '\_G%') escape '\');

  delete from public.inscripciones_torneo
   where torneo_id = v_torneo_id
     and categoria = v_categoria
     and (grupo = v_grupo_base or grupo like (v_grupo_base || '\_G%') escape '\');

  delete from public.torneo_estado
   where torneo_id = v_torneo_id
     and categoria = v_categoria
     and (grupo = v_grupo_base or grupo like (v_grupo_base || '\_G%') escape '\');

  insert into public.torneo_estado
    (torneo_id, categoria, grupo, estado, max_participantes, current_participantes)
  values
    (v_torneo_id, v_categoria, v_grupo_base, 'RECRUITING', 2, 0);
end;
$$;

-- PASO 2: Crea 4 inscripciones pendientes en el grupo base.
insert into public.inscripciones_torneo (torneo_id, perfil_id, estado, monto, alias_destino, whatsapp_destino, categoria, grupo)
values
  (3, 'UUID1', 'pendiente_revision', 5000, 'tubarrio.torneos', '+5491155551234', 'Singles Caballeros', 'TORNEO_3'),
  (3, 'UUID2', 'pendiente_revision', 5000, 'tubarrio.torneos', '+5491155551234', 'Singles Caballeros', 'TORNEO_3'),
  (3, 'UUID3', 'pendiente_revision', 5000, 'tubarrio.torneos', '+5491155551234', 'Singles Caballeros', 'TORNEO_3'),
  (3, 'UUID4', 'pendiente_revision', 5000, 'tubarrio.torneos', '+5491155551234', 'Singles Caballeros', 'TORNEO_3')
on conflict on constraint uq_inscripcion_torneo_perfil
  do update set estado = excluded.estado, updated_at = now();

-- PASO 3: Aprueba los 4 pagos.
update public.inscripciones_torneo
set estado = 'pagado_aprobado'
where torneo_id = 3
  and perfil_id in ('UUID1', 'UUID2', 'UUID3', 'UUID4');

-- PASO 4: Ver distribución por grupos (esperado: 2 en TORNEO_3 y 2 en TORNEO_3_G2).
select grupo, count(*) as jugadores
from public.torneo_jugadores
where torneo_id = 3
  and categoria = 'Singles Caballeros'
  and (grupo = 'TORNEO_3' or grupo like ('TORNEO_3\_G%') escape '\')
group by grupo
order by grupo;

-- PASO 5: Ver estado por grupo.
select grupo, estado, current_participantes, max_participantes, sorteo_realizado
from public.torneo_estado
where torneo_id = 3
  and categoria = 'Singles Caballeros'
  and (grupo = 'TORNEO_3' or grupo like ('TORNEO_3\_G%') escape '\')
order by grupo;

-- PASO 6: Ver partidos creados por grupo.
select grupo, jornada, count(*) as partidos
from public.partidos
where torneo_id = 3
  and categoria = 'Singles Caballeros'
  and (grupo = 'TORNEO_3' or grupo like ('TORNEO_3\_G%') escape '\')
group by grupo, jornada
order by grupo, jornada;
