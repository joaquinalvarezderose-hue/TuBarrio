-- ============================================================
-- Panel manual de operador para torneos
-- Uso: ejecutar bloques separados desde Supabase SQL Editor.
-- Objetivo: administrar grupos, sorteo y playoffs 100% desde Supabase.
-- ============================================================

-- ============================================================
-- 1) VER ESTADO ACTUAL DEL TORNEO
-- Cambia torneo_id/categoria segun el torneo que quieras inspeccionar.
-- ============================================================
select *
from public.torneos
where id = 3;

select *
from public.torneo_configuracion
where torneo_id = 3;

select id, torneo_id, categoria, codigo, nombre, fase, orden, grupo_padre_id, es_base
from public.torneo_grupos
where torneo_id = 3
  and categoria = 'Singles Caballeros'
order by fase, orden, codigo;

select torneo_id, categoria, grupo, estado, current_participantes, max_participantes, sorteo_realizado
from public.torneo_estado
where torneo_id = 3
  and categoria = 'Singles Caballeros'
order by grupo;

select torneo_id, categoria, grupo, perfil_id, estado
from public.inscripciones_torneo
where torneo_id = 3
  and categoria = 'Singles Caballeros'
order by grupo, perfil_id;


-- ============================================================
-- 2) CREAR O ACTUALIZAR EL GRUPO BASE VISIBLE
-- Esto crea una fila real en torneo_grupos y la deja lista para usar.
-- ============================================================
with grupo_base as (
  select public.upsert_torneo_grupo(
    3,
    'Singles Caballeros',
    'TORNEO_3',
    'Grupo Base Intermedia',
    'GRUPOS',
    1,
    null,
    true
  ) as grupo_id
)
select tg.*
from public.torneo_grupos tg
join grupo_base gb on gb.grupo_id = tg.id;


-- ============================================================
-- 3) CONFIGURAR EL TORNEO
-- Ajusta estos valores segun tu formato.
-- jugadores_por_grupo: cantidad objetivo por grupo.
-- sortear_grupos_en_sorteo: true => los grupos finales se crean al sortear.
-- clasificados_por_grupo: cuantos pasan a playoffs desde cada grupo.
-- crear_playoffs_eliminacion_directa: habilita la etapa final de cruces.
-- ============================================================
with grupo_base as (
  select id
  from public.torneo_grupos
  where torneo_id = 3
    and categoria = 'Singles Caballeros'
    and codigo = 'TORNEO_3'
  limit 1
)
insert into public.torneo_configuracion (
  torneo_id,
  jugadores_por_grupo,
  sortear_grupos_en_sorteo,
  grupo_base,
  grupo_base_id,
  clasificados_por_grupo,
  crear_playoffs_eliminacion_directa
)
select
  3,
  4,
  true,
  'TORNEO_3',
  gb.id,
  2,
  true
from grupo_base gb
on conflict (torneo_id)
do update set
  jugadores_por_grupo = excluded.jugadores_por_grupo,
  sortear_grupos_en_sorteo = excluded.sortear_grupos_en_sorteo,
  grupo_base = excluded.grupo_base,
  grupo_base_id = excluded.grupo_base_id,
  clasificados_por_grupo = excluded.clasificados_por_grupo,
  crear_playoffs_eliminacion_directa = excluded.crear_playoffs_eliminacion_directa,
  updated_at = now();

select *
from public.torneo_configuracion
where torneo_id = 3;


-- ============================================================
-- 4) VER QUIENES ESTAN APROBADOS PARA EL SORTEO
-- Solo los pagado_aprobado entran al sorteo real.
-- ============================================================
with aprobados as (
  select *
  from public.inscripciones_torneo i
  where i.torneo_id = 3
    and coalesce(i.categoria, 'Singles Caballeros') = 'Singles Caballeros'
    and i.estado = 'pagado_aprobado'
)
select
  a.perfil_id,
  a.categoria,
  a.grupo,
  a.estado,
  count(*) over () as total_aprobados
from aprobados a
order by a.created_at;


-- ============================================================
-- 5) SORTEAR GRUPOS Y GENERAR FIXTURE
-- Esto toma los aprobados, crea los grupos reales y genera el round robin.
-- ============================================================
select *
from public.sortear_grupos_y_fixture_torneo(
  3,
  'Singles Caballeros',
  'TORNEO_3'
);


-- ============================================================
-- 6) REVISAR COMO QUEDARON LOS GRUPOS REALES
-- ============================================================
select id, torneo_id, categoria, codigo, nombre, fase, orden, grupo_padre_id, es_base
from public.torneo_grupos
where torneo_id = 3
  and categoria = 'Singles Caballeros'
order by fase, orden, codigo;

select grupo, count(*) as jugadores
from public.torneo_jugadores
where torneo_id = 3
  and categoria = 'Singles Caballeros'
group by grupo
order by grupo;

select grupo, estado, current_participantes, max_participantes, sorteo_realizado
from public.torneo_estado
where torneo_id = 3
  and categoria = 'Singles Caballeros'
order by grupo;

select grupo, jornada, jugador1_id, jugador2_id, estado
from public.partidos
where torneo_id = 3
  and categoria = 'Singles Caballeros'
order by grupo, jornada, id;


-- ============================================================
-- 7) GENERAR PLAYOFFS DE ELIMINACION DIRECTA
-- Requisito: clasificados totales debe dar potencia de 2.
-- Ejemplo: 2 grupos x 2 clasificados = 4.
-- ============================================================
select *
from public.generar_playoffs_eliminacion_directa_torneo(
  3,
  'Singles Caballeros',
  'TORNEO_3'
);


-- ============================================================
-- 8) REVISAR PLAYOFFS
-- ============================================================
select id, torneo_id, categoria, codigo, nombre, fase, orden, grupo_padre_id, es_base
from public.torneo_grupos
where torneo_id = 3
  and categoria = 'Singles Caballeros'
order by fase, orden, codigo;

select grupo, estado, current_participantes, max_participantes, sorteo_realizado
from public.torneo_estado
where torneo_id = 3
  and categoria = 'Singles Caballeros'
order by grupo;

select grupo, jornada, jugador1_id, jugador2_id, estado
from public.partidos
where torneo_id = 3
  and categoria = 'Singles Caballeros'
  and grupo like 'TORNEO_3%PLAYOFFS%'
order by jornada, id;


-- ============================================================
-- 9) INICIAR TODOS LOS GRUPOS LOCKED DE LA FASE DE GRUPOS
-- Ejecuta iniciar_torneo_manual solo sobre grupos reales, no playoffs.
-- ============================================================
do $$
declare
  r record;
begin
  for r in
    select te.categoria, te.grupo
    from public.torneo_estado te
    where te.torneo_id = 3
      and te.categoria = 'Singles Caballeros'
      and te.estado = 'LOCKED'
      and te.grupo not like '%PLAYOFFS%'
    order by te.grupo
  loop
    perform *
    from public.iniciar_torneo_manual(
      3,
      r.categoria,
      r.grupo,
      now(),
      0
    );
  end loop;
end $$;

select grupo, estado
from public.torneo_estado
where torneo_id = 3
  and categoria = 'Singles Caballeros'
order by grupo;


-- ============================================================
-- 10) INICIAR PLAYOFFS
-- Úsalo cuando ya quieras abrir la etapa de cruces.
-- ============================================================
do $$
declare
  r record;
begin
  for r in
    select te.categoria, te.grupo
    from public.torneo_estado te
    where te.torneo_id = 3
      and te.categoria = 'Singles Caballeros'
      and te.estado = 'LOCKED'
      and te.grupo like '%PLAYOFFS%'
    order by te.grupo
  loop
    perform *
    from public.iniciar_torneo_manual(
      3,
      r.categoria,
      r.grupo,
      now(),
      0
    );
  end loop;
end $$;

select grupo, estado
from public.torneo_estado
where torneo_id = 3
  and categoria = 'Singles Caballeros'
order by grupo;


-- ============================================================
-- 11) CONSULTAS RAPIDAS DE DIAGNOSTICO
-- ============================================================
-- Ver solo catalogo de grupos:
-- select * from public.torneo_grupos where torneo_id = 3 order by fase, orden, codigo;

-- Ver clasificados potenciales por grupo segun puntos/sets:
-- with ranking as (
--   select
--     tj.grupo,
--     tj.perfil_id,
--     tj.puntos,
--     tj.sets_ganados,
--     tj.partidos_jugados,
--     row_number() over (
--       partition by tj.grupo
--       order by tj.puntos desc, tj.sets_ganados desc, tj.partidos_jugados asc, tj.perfil_id asc
--     ) as pos_grupo
--   from public.torneo_jugadores tj
--   where tj.torneo_id = 3
--     and tj.categoria = 'Singles Caballeros'
-- )
-- select * from ranking order by grupo, pos_grupo;
