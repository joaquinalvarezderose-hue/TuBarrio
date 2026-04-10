-- ============================================================
-- USO: Sorteo diferido por grupos + round robin
-- ============================================================

-- 1) Configurar un torneo para dividir grupos en el sorteo
insert into public.torneo_configuracion (
  torneo_id,
  jugadores_por_grupo,
  sortear_grupos_en_sorteo,
  grupo_base,
  clasificados_por_grupo,
  crear_playoffs_eliminacion_directa
)
values (
  3,
  4,
  true,
  'TORNEO_3',
  2,
  true
)
on conflict (torneo_id)
do update set
  jugadores_por_grupo = excluded.jugadores_por_grupo,
  sortear_grupos_en_sorteo = excluded.sortear_grupos_en_sorteo,
  grupo_base = excluded.grupo_base,
  clasificados_por_grupo = excluded.clasificados_por_grupo,
  crear_playoffs_eliminacion_directa = excluded.crear_playoffs_eliminacion_directa,
  updated_at = now();

-- 2) Ver configuracion
select *
from public.torneo_configuracion
where torneo_id = 3;

select id, torneo_id, categoria, codigo, nombre, fase, orden, grupo_padre_id, es_base
from public.torneo_grupos
where torneo_id = 3
order by fase, orden, codigo;

-- 3) Aprobar inscripciones normalmente.
-- El trigger NO asigna grupo final ni crea partidos si sortear_grupos_en_sorteo=true.
-- Solo deja el grupo base en inscripciones_torneo y un torneo_estado placeholder.

-- 4) Cuando quieras cerrar inscripcion y sortear:
select *
from public.sortear_grupos_y_fixture_torneo(
  3,
  'Singles Caballeros',
  'TORNEO_3'
);

-- 5) Ver jugadores asignados por grupo
select grupo, count(*) as jugadores
from public.torneo_jugadores
where torneo_id = 3
  and categoria = 'Singles Caballeros'
group by grupo
order by grupo;

-- 6) Ver estados por grupo
select grupo, estado, current_participantes, max_participantes, sorteo_realizado
from public.torneo_estado
where torneo_id = 3
  and categoria = 'Singles Caballeros'
order by grupo;

-- 7) Ver fixture generado
select grupo, jornada, jugador1_id, jugador2_id, estado
from public.partidos
where torneo_id = 3
  and categoria = 'Singles Caballeros'
order by grupo, jornada, id;
