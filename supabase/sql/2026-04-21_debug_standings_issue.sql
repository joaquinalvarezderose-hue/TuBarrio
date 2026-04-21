-- Verificar si los jugadores existen en ambos grupos

-- 1) Ver todos los grupos del torneo 3
select 
  grupo,
  count(*) as total_jugadores
from public.torneo_jugadores
where torneo_id = 3
  and categoria = 'Singles Caballeros'
group by grupo
order by grupo;

-- 2) Ver jugadores específicamente en cada grupo
select 
  grupo,
  perfil_id,
  puntos,
  partidos_jugados,
  sets_ganados
from public.torneo_jugadores
where torneo_id = 3
  and categoria = 'Singles Caballeros'
order by grupo, puntos desc;

-- 3) Ver estado del torneo por grupo
select 
  grupo,
  estado,
  current_participantes,
  max_participantes,
  sorteo_realizado
from public.torneo_estado
where torneo_id = 3
  and categoria = 'Singles Caballeros'
order by grupo;

-- 4) Ver políticas RLS actuales en torneo_jugadores
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'torneo_jugadores'
ORDER BY policyname;
