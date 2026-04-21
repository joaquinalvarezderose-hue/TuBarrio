-- Debug: Verificar por qué no se ven jugadores del Grupo 2

-- 1) Obtener el UUID del usuario actual desde session
-- Reemplaza esto con tu user_id actual de Supabase
select auth.uid() as current_user_id;

-- 2) Verificar inscripción del usuario
-- Reemplaza 'YOUR_USER_ID' con el UUID del paso anterior
select 
  id,
  torneo_id,
  perfil_id,
  estado,
  categoria,
  grupo,
  created_at
from public.inscripciones_torneo
where perfil_id = auth.uid()
  and torneo_id = 3
order by created_at desc;

-- 3) Simular la RLS: ¿Puede el usuario ver jugadores del torneo 3?
-- Este query simula lo que hace la RLS
select 
  tj.grupo,
  tj.perfil_id,
  tj.puntos,
  tj.partidos_jugados,
  tj.sets_ganados
from public.torneo_jugadores tj
where tj.torneo_id = 3
  and tj.categoria = 'Singles Caballeros'
  and (
    tj.perfil_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.inscripciones_torneo it
      WHERE it.torneo_id = tj.torneo_id
        AND it.perfil_id = auth.uid()
        AND it.estado IN ('pagado_aprobado', 'pendiente_revision')
    )
  )
order by tj.grupo;

-- 4) Ver si hay perfiles válidos para estos jugadores
select 
  p.id,
  p.nombre,
  p.email
from public.perfiles p
where p.id in (
  select perfil_id from public.torneo_jugadores
  where torneo_id = 3
    and categoria = 'Singles Caballeros'
)
order by p.nombre;
