-- Agregar pruebatorneo22 y pruebatorneo23 al torneo 19 (PRUEBA NO ENTRAR)
-- Caso de excepción única: agregar usuarios al GRUPO 1 existente y generar partidos
-- Fecha: 2026-07-12

do $$
declare
  v_torneo_id bigint := 19;
  v_grupo text := 'GRUPO 1';
  v_categoria text;
  v_perfil_id_22 uuid;
  v_perfil_id_23 uuid;
  v_partidos_creados integer;
begin
  -- 1. Obtener la categoría correcta del torneo
  select t.subtitulo into v_categoria
  from public.torneos t
  where t.id = v_torneo_id
  limit 1;

  v_categoria := coalesce(nullif(trim(v_categoria), ''), 'General');
  raise notice 'Trabajando con torneo % categoría %', v_torneo_id, v_categoria;

  -- 2. Obtener los perfil_id de pruebatorneo22 y pruebatorneo23
  select id into v_perfil_id_22
  from public.perfiles
  where username ilike '%pruebatorneo22%' or email ilike '%pruebatorneo22%'
  limit 1;

  select id into v_perfil_id_23
  from public.perfiles
  where username ilike '%pruebatorneo23%' or email ilike '%pruebatorneo23%'
  limit 1;

  if v_perfil_id_22 is null or v_perfil_id_23 is null then
    raise exception 'No se encontraron los usuarios pruebatorneo22 o pruebatorneo23';
  end if;

  raise notice 'Usuarios encontrados: % y %', v_perfil_id_22, v_perfil_id_23;

  -- 3. Verificar que el grupo existe
  if not exists (
    select 1 from public.torneo_estado
    where torneo_id = v_torneo_id
      and categoria = v_categoria
      and grupo = v_grupo
  ) then
    raise exception 'No existe el grupo % en el torneo %', v_grupo, v_torneo_id;
  end if;

  -- 4. Agregar los usuarios al grupo si no están ya
  insert into public.torneo_jugadores (torneo_id, perfil_id, categoria, grupo, puntos, partidos_jugados, sets_ganados)
  values (v_torneo_id, v_perfil_id_22, v_categoria, v_grupo, 0, 0, 0)
  on conflict (torneo_id, perfil_id, categoria, grupo) do nothing;

  insert into public.torneo_jugadores (torneo_id, perfil_id, categoria, grupo, puntos, partidos_jugados, sets_ganados)
  values (v_torneo_id, v_perfil_id_23, v_categoria, v_grupo, 0, 0, 0)
  on conflict (torneo_id, perfil_id, categoria, grupo) do nothing;

  raise notice 'Usuarios agregados al grupo';

  -- 5. Actualizar el contador de participantes
  update public.torneo_estado te
  set current_participantes = (
    select count(*)::integer
    from public.torneo_jugadores tj
    where tj.torneo_id = v_torneo_id
      and tj.categoria = v_categoria
      and tj.grupo = v_grupo
  ),
  updated_at = now()
  where te.torneo_id = v_torneo_id
    and te.categoria = v_categoria
    and te.grupo = v_grupo;

  raise notice 'Contador de participantes actualizado';

  -- 6. Limpiar partidos existentes sin resultados (para regenerar)
  delete from public.partidos
  where torneo_id = v_torneo_id
    and categoria = v_categoria
    and grupo = v_grupo
    and (resultado is null or estado = 'programado');

  raise notice 'Partidos sin resultado limpiados';

  -- 7. Generar fixture round robin usando la función existente
  v_partidos_creados := public.generar_fixture_round_robin_grupo(
    v_torneo_id,
    v_categoria,
    v_grupo
  );

  raise notice 'Fixture round robin generado: % partidos creados', v_partidos_creados;

  -- 8. Actualizar el estado del grupo
  update public.torneo_estado
  set estado = 'LOCKED',
      sorteo_realizado = true,
      updated_at = now()
  where torneo_id = v_torneo_id
    and categoria = v_categoria
    and grupo = v_grupo;

  raise notice 'Grupo marcado como LOCKED. Operación completada exitosamente.';

end $$;
