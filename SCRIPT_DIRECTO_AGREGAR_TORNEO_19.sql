-- ============================================================
-- SCRIPT DIRECTO: Agregar pruebatorneo22 y pruebatorneo23 al Torneo 19
-- ============================================================
--
-- Instrucciones:
-- 1. Abre https://app.supabase.com/project/YOUR_PROJECT_ID/sql/new
-- 2. Copia y pega este script completo
-- 3. Haz clic en "RUN" o presiona Ctrl+Enter
-- 4. Revisa los mensajes de confirmación en la consola
--
-- ============================================================

-- Primero, crear la función RPC si no existe
create or replace function public.add_users_to_tournament_group(
  p_torneo_id bigint,
  p_grupo text,
  p_username_22 text default 'pruebatorneo22',
  p_username_23 text default 'pruebatorneo23'
)
returns table (
  success boolean,
  message text,
  participantes_actuales integer,
  partidos_creados integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria text;
  v_perfil_id_22 uuid;
  v_perfil_id_23 uuid;
  v_partidos_creados integer := 0;
  v_current_count integer := 0;
begin
  -- Verificar que es admin
  if not public.is_admin() then
    return query
    select false, 'Solo administradores pueden ejecutar esta operación'::text, 0, 0;
    return;
  end if;

  -- 1. Obtener la categoría correcta del torneo
  select t.subtitulo into v_categoria
  from public.torneos t
  where t.id = p_torneo_id
  limit 1;

  v_categoria := coalesce(nullif(trim(v_categoria), ''), 'General');

  -- 2. Obtener los perfil_id de los usuarios
  select id into v_perfil_id_22
  from public.perfiles
  where username ilike '%' || p_username_22 || '%' or email ilike '%' || p_username_22 || '%'
  limit 1;

  select id into v_perfil_id_23
  from public.perfiles
  where username ilike '%' || p_username_23 || '%' or email ilike '%' || p_username_23 || '%'
  limit 1;

  if v_perfil_id_22 is null or v_perfil_id_23 is null then
    return query
    select false, format('No se encontraron los usuarios: %s (id: %s) o %s (id: %s)',
      p_username_22, v_perfil_id_22::text, p_username_23, v_perfil_id_23::text)::text, 0, 0;
    return;
  end if;

  -- 3. Verificar que el grupo existe
  if not exists (
    select 1 from public.torneo_estado
    where torneo_id = p_torneo_id
      and categoria = v_categoria
      and grupo = p_grupo
  ) then
    return query
    select false, format('No existe el grupo %s en el torneo %s', p_grupo, p_torneo_id)::text, 0, 0;
    return;
  end if;

  -- 4. Agregar los usuarios al grupo si no están ya
  begin
    insert into public.torneo_jugadores (torneo_id, perfil_id, categoria, grupo, puntos, partidos_jugados, sets_ganados)
    values (p_torneo_id, v_perfil_id_22, v_categoria, p_grupo, 0, 0, 0)
    on conflict (torneo_id, perfil_id, categoria, grupo) do nothing;

    insert into public.torneo_jugadores (torneo_id, perfil_id, categoria, grupo, puntos, partidos_jugados, sets_ganados)
    values (p_torneo_id, v_perfil_id_23, v_categoria, p_grupo, 0, 0, 0)
    on conflict (torneo_id, perfil_id, categoria, grupo) do nothing;
  exception when others then
    return query
    select false, format('Error al agregar usuarios: %s', SQLERRM)::text, 0, 0;
    return;
  end;

  -- 5. Actualizar el contador de participantes
  update public.torneo_estado te
  set current_participantes = (
    select count(*)::integer
    from public.torneo_jugadores tj
    where tj.torneo_id = p_torneo_id
      and tj.categoria = v_categoria
      and tj.grupo = p_grupo
  ),
  updated_at = now()
  where te.torneo_id = p_torneo_id
    and te.categoria = v_categoria
    and te.grupo = p_grupo;

  select current_participantes into v_current_count
  from public.torneo_estado
  where torneo_id = p_torneo_id
    and categoria = v_categoria
    and grupo = p_grupo;

  -- 6. Limpiar partidos existentes sin resultados (para regenerar)
  begin
    delete from public.partidos
    where torneo_id = p_torneo_id
      and categoria = v_categoria
      and grupo = p_grupo
      and (resultado is null or estado = 'programado');
  exception when others then
    null;
  end;

  -- 7. Generar fixture round robin usando la función existente
  begin
    v_partidos_creados := public.generar_fixture_round_robin_grupo(
      p_torneo_id,
      v_categoria,
      p_grupo
    );
  exception when others then
    return query
    select false, format('Error al generar partidos: %s', SQLERRM)::text, v_current_count, 0;
    return;
  end;

  -- 8. Actualizar el estado del grupo
  begin
    update public.torneo_estado
    set estado = 'LOCKED',
        sorteo_realizado = true,
        updated_at = now()
    where torneo_id = p_torneo_id
      and categoria = v_categoria
      and grupo = p_grupo;
  exception when others then
    null;
  end;

  return query
  select true, format('Operación completada. %s participantes, %s partidos generados', v_current_count, v_partidos_creados)::text, v_current_count, v_partidos_creados;

end $$;

-- ============================================================
-- AHORA EJECUTA LA OPERACIÓN
-- ============================================================

SELECT * FROM public.add_users_to_tournament_group(
  19,                -- p_torneo_id
  'GRUPO 1',         -- p_grupo
  'pruebatorneo22',  -- p_username_22
  'pruebatorneo23'   -- p_username_23
);

-- ============================================================
-- VERIFICA LOS RESULTADOS
-- ============================================================

-- Ver jugadores en el grupo
SELECT
  p.username,
  tj.puntos,
  tj.partidos_jugados,
  tj.sets_ganados
FROM public.torneo_jugadores tj
JOIN public.perfiles p ON tj.perfil_id = p.id
WHERE tj.torneo_id = 19 AND tj.grupo = 'GRUPO 1'
ORDER BY p.username;

-- Ver partidos generados
SELECT
  to_char(p1.created_at, 'YYYY-MM-DD HH24:MI:SS') as fecha_creacion,
  p.jornada,
  p.estado,
  p.resultado,
  (SELECT username FROM public.perfiles WHERE id = p.jugador1_id) as jugador1,
  (SELECT username FROM public.perfiles WHERE id = p.jugador2_id) as jugador2
FROM public.partidos p
LEFT JOIN public.perfiles p1 ON p1.id = p.id
WHERE p.torneo_id = 19 AND p.grupo = 'GRUPO 1'
ORDER BY p.jornada, p.created_at;

-- Ver estado del grupo
SELECT
  estado,
  current_participantes,
  max_participantes,
  sorteo_realizado
FROM public.torneo_estado
WHERE torneo_id = 19 AND grupo = 'GRUPO 1';
