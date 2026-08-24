-- ============================================================
-- 1. Fix: ranking_categorias_view no le daba credito individual
--    a jugador2_id de cada equipo en partidos de dobles.
--
--    torneo_partidos_historial.jugador1_perfil_id/jugador2_perfil_id
--    solo guardan el integrante "canonico" (jugador1_id) de cada
--    equipo en partidos de dobles (ver _confirmar_resultado_equipo_core
--    y el flujo de WO en 20260721_dobles_tournament_support.sql). La
--    vista ahora resuelve los 4 jugadores reales via JOIN a
--    torneo_equipos usando equipo1_id/equipo2_id (ya presentes en el
--    historial), sin tocar como se escribe el historial. No requiere
--    backfill: recalcula en cada lectura.
-- ============================================================

CREATE OR REPLACE VIEW public.ranking_categorias_view AS
WITH match_points AS (
  -- Singles: jugador1
  SELECT
    h.categoria,
    h.jugador1_perfil_id AS perfil_id,
    CASE
      WHEN h.sets_jugador1 = 2 AND h.sets_jugador2 = 0 THEN 3
      WHEN h.sets_jugador1 = 2 AND h.sets_jugador2 = 1 THEN 2
      WHEN h.sets_jugador1 = 1 AND h.sets_jugador2 = 2 THEN 1
      ELSE 0
    END AS puntos_ranking,
    CASE WHEN h.sets_jugador1 > h.sets_jugador2 THEN 1 ELSE 0 END AS victoria,
    CASE WHEN h.sets_jugador1 < h.sets_jugador2 THEN 1 ELSE 0 END AS derrota
  FROM public.torneo_partidos_historial h
  WHERE h.equipo1_id IS NULL
    AND h.jugador1_perfil_id IS NOT NULL
    AND h.sets_jugador1 IS NOT NULL
    AND h.sets_jugador2 IS NOT NULL

  UNION ALL

  -- Singles: jugador2
  SELECT
    h.categoria,
    h.jugador2_perfil_id AS perfil_id,
    CASE
      WHEN h.sets_jugador2 = 2 AND h.sets_jugador1 = 0 THEN 3
      WHEN h.sets_jugador2 = 2 AND h.sets_jugador1 = 1 THEN 2
      WHEN h.sets_jugador2 = 1 AND h.sets_jugador1 = 2 THEN 1
      ELSE 0
    END AS puntos_ranking,
    CASE WHEN h.sets_jugador2 > h.sets_jugador1 THEN 1 ELSE 0 END AS victoria,
    CASE WHEN h.sets_jugador2 < h.sets_jugador1 THEN 1 ELSE 0 END AS derrota
  FROM public.torneo_partidos_historial h
  WHERE h.equipo1_id IS NULL
    AND h.jugador2_perfil_id IS NOT NULL
    AND h.sets_jugador1 IS NOT NULL
    AND h.sets_jugador2 IS NOT NULL

  UNION ALL

  -- Dobles: ambos integrantes del equipo1 (mismo resultado/puntos que el equipo)
  SELECT
    h.categoria,
    te1.jugador1_id AS perfil_id,
    CASE
      WHEN h.sets_jugador1 = 2 AND h.sets_jugador2 = 0 THEN 3
      WHEN h.sets_jugador1 = 2 AND h.sets_jugador2 = 1 THEN 2
      WHEN h.sets_jugador1 = 1 AND h.sets_jugador2 = 2 THEN 1
      ELSE 0
    END AS puntos_ranking,
    CASE WHEN h.sets_jugador1 > h.sets_jugador2 THEN 1 ELSE 0 END AS victoria,
    CASE WHEN h.sets_jugador1 < h.sets_jugador2 THEN 1 ELSE 0 END AS derrota
  FROM public.torneo_partidos_historial h
  JOIN public.torneo_equipos te1 ON te1.id = h.equipo1_id
  WHERE h.equipo1_id IS NOT NULL
    AND h.sets_jugador1 IS NOT NULL
    AND h.sets_jugador2 IS NOT NULL

  UNION ALL

  SELECT
    h.categoria,
    te1.jugador2_id AS perfil_id,
    CASE
      WHEN h.sets_jugador1 = 2 AND h.sets_jugador2 = 0 THEN 3
      WHEN h.sets_jugador1 = 2 AND h.sets_jugador2 = 1 THEN 2
      WHEN h.sets_jugador1 = 1 AND h.sets_jugador2 = 2 THEN 1
      ELSE 0
    END AS puntos_ranking,
    CASE WHEN h.sets_jugador1 > h.sets_jugador2 THEN 1 ELSE 0 END AS victoria,
    CASE WHEN h.sets_jugador1 < h.sets_jugador2 THEN 1 ELSE 0 END AS derrota
  FROM public.torneo_partidos_historial h
  JOIN public.torneo_equipos te1 ON te1.id = h.equipo1_id
  WHERE h.equipo1_id IS NOT NULL
    AND h.sets_jugador1 IS NOT NULL
    AND h.sets_jugador2 IS NOT NULL

  UNION ALL

  -- Dobles: ambos integrantes del equipo2
  SELECT
    h.categoria,
    te2.jugador1_id AS perfil_id,
    CASE
      WHEN h.sets_jugador2 = 2 AND h.sets_jugador1 = 0 THEN 3
      WHEN h.sets_jugador2 = 2 AND h.sets_jugador1 = 1 THEN 2
      WHEN h.sets_jugador2 = 1 AND h.sets_jugador1 = 2 THEN 1
      ELSE 0
    END AS puntos_ranking,
    CASE WHEN h.sets_jugador2 > h.sets_jugador1 THEN 1 ELSE 0 END AS victoria,
    CASE WHEN h.sets_jugador2 < h.sets_jugador1 THEN 1 ELSE 0 END AS derrota
  FROM public.torneo_partidos_historial h
  JOIN public.torneo_equipos te2 ON te2.id = h.equipo2_id
  WHERE h.equipo2_id IS NOT NULL
    AND h.sets_jugador1 IS NOT NULL
    AND h.sets_jugador2 IS NOT NULL

  UNION ALL

  SELECT
    h.categoria,
    te2.jugador2_id AS perfil_id,
    CASE
      WHEN h.sets_jugador2 = 2 AND h.sets_jugador1 = 0 THEN 3
      WHEN h.sets_jugador2 = 2 AND h.sets_jugador1 = 1 THEN 2
      WHEN h.sets_jugador2 = 1 AND h.sets_jugador1 = 2 THEN 1
      ELSE 0
    END AS puntos_ranking,
    CASE WHEN h.sets_jugador2 > h.sets_jugador1 THEN 1 ELSE 0 END AS victoria,
    CASE WHEN h.sets_jugador2 < h.sets_jugador1 THEN 1 ELSE 0 END AS derrota
  FROM public.torneo_partidos_historial h
  JOIN public.torneo_equipos te2 ON te2.id = h.equipo2_id
  WHERE h.equipo2_id IS NOT NULL
    AND h.sets_jugador1 IS NOT NULL
    AND h.sets_jugador2 IS NOT NULL
),
aggregated AS (
  SELECT
    mp.categoria,
    mp.perfil_id,
    p.nombre_completo,
    COUNT(*)::int              AS partidos_jugados,
    SUM(mp.victoria)::int      AS victorias,
    SUM(mp.derrota)::int       AS derrotas,
    SUM(mp.puntos_ranking)::int AS puntos
  FROM match_points mp
  JOIN public.perfiles p ON p.id = mp.perfil_id
  WHERE mp.categoria IS NOT NULL
    AND mp.categoria NOT ILIKE 'no entrar%'
    AND p.nombre_completo NOT ILIKE 'prueba%'
  GROUP BY mp.categoria, mp.perfil_id, p.nombre_completo
)
SELECT
  categoria,
  perfil_id,
  nombre_completo,
  partidos_jugados,
  victorias,
  derrotas,
  puntos,
  ROW_NUMBER() OVER (
    PARTITION BY categoria
    ORDER BY puntos DESC, victorias DESC, partidos_jugados ASC
  )::int AS posicion
FROM aggregated;

GRANT SELECT ON public.ranking_categorias_view TO authenticated;


-- ============================================================
-- 2. Jugadores "placeholder": alguien sin cuenta propia que el
--    admin carga a mano para poder armar una pareja de dobles,
--    y que despues se puede reemplazar por una cuenta real sin
--    perder el historial ya jugado.
-- ============================================================

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS es_placeholder boolean NOT NULL DEFAULT false;


-- ------------------------------------------------------------
-- admin_crear_jugador_placeholder: crea el perfil + una
-- inscripcion ya aprobada, para que aparezca automaticamente en
-- el flujo de armado de parejas existente sin tocarlo.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_crear_jugador_placeholder(
  p_torneo_id bigint,
  p_categoria text,
  p_nombre text,
  p_whatsapp text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nombre text;
  v_categoria text;
  v_new_id uuid;
  v_email text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permiso denegado: solo admin puede crear jugadores sin cuenta.';
  END IF;

  v_nombre := NULLIF(TRIM(COALESCE(p_nombre, '')), '');
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'Debes indicar el nombre del jugador.';
  END IF;

  v_categoria := NULLIF(TRIM(COALESCE(p_categoria, '')), '');
  IF v_categoria IS NULL THEN
    RAISE EXCEPTION 'Debes indicar la categoria.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.torneos WHERE id = p_torneo_id) THEN
    RAISE EXCEPTION 'Torneo invalido.';
  END IF;

  v_new_id := gen_random_uuid();
  v_email := 'placeholder-' || v_new_id::text || '@tubarrio.invalid';

  INSERT INTO public.perfiles (id, email, nombre_completo, whatsapp, rol, es_placeholder)
  VALUES (v_new_id, v_email, v_nombre, NULLIF(TRIM(COALESCE(p_whatsapp, '')), ''), 'jugador', true);

  INSERT INTO public.inscripciones_torneo (
    torneo_id, perfil_id, estado, monto, moneda, metodo_pago,
    categoria, alias_destino, whatsapp_destino, aprobado_por, aprobado_en
  ) VALUES (
    p_torneo_id, v_new_id, 'pagado_aprobado', 0, 'ARS', 'placeholder_admin',
    v_categoria, 'placeholder', 'placeholder', auth.uid(), now()
  );

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_crear_jugador_placeholder(bigint, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_crear_jugador_placeholder(bigint, text, text, text) TO authenticated, service_role;


-- ------------------------------------------------------------
-- admin_reemplazar_jugador_placeholder: cuando la persona real
-- finalmente crea su cuenta, reasigna todas las parejas y el
-- historial ya jugado del placeholder a su perfil real.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_reemplazar_jugador_placeholder(
  p_placeholder_perfil_id uuid,
  p_real_perfil_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_placeholder public.perfiles%rowtype;
  v_real public.perfiles%rowtype;
  v_equipo public.torneo_equipos%rowtype;
  v_new_j1 uuid;
  v_new_j2 uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permiso denegado: solo admin puede reemplazar jugadores sin cuenta.';
  END IF;

  IF p_placeholder_perfil_id IS NULL OR p_real_perfil_id IS NULL THEN
    RETURN 'Debes indicar ambos jugadores.';
  END IF;
  IF p_placeholder_perfil_id = p_real_perfil_id THEN
    RETURN 'Los jugadores deben ser distintos.';
  END IF;

  SELECT * INTO v_placeholder FROM public.perfiles WHERE id = p_placeholder_perfil_id;
  IF v_placeholder.id IS NULL THEN
    RETURN 'Jugador sin cuenta no encontrado.';
  END IF;
  IF NOT v_placeholder.es_placeholder THEN
    RETURN 'El primer jugador no es un placeholder.';
  END IF;

  SELECT * INTO v_real FROM public.perfiles WHERE id = p_real_perfil_id;
  IF v_real.id IS NULL THEN
    RETURN 'Jugador real no encontrado.';
  END IF;
  IF v_real.es_placeholder THEN
    RETURN 'El jugador de reemplazo no puede ser otro placeholder.';
  END IF;

  FOR v_equipo IN
    SELECT * FROM public.torneo_equipos
    WHERE jugador1_id = p_placeholder_perfil_id OR jugador2_id = p_placeholder_perfil_id
  LOOP
    IF v_equipo.jugador1_id = p_placeholder_perfil_id THEN
      v_new_j1 := LEAST(p_real_perfil_id, v_equipo.jugador2_id);
      v_new_j2 := GREATEST(p_real_perfil_id, v_equipo.jugador2_id);
    ELSE
      v_new_j1 := LEAST(p_real_perfil_id, v_equipo.jugador1_id);
      v_new_j2 := GREATEST(p_real_perfil_id, v_equipo.jugador1_id);
    END IF;

    UPDATE public.torneo_equipos
    SET jugador1_id = v_new_j1, jugador2_id = v_new_j2, updated_at = now()
    WHERE id = v_equipo.id;

    UPDATE public.torneo_partidos_historial
    SET jugador1_id = CASE WHEN jugador1_id = p_placeholder_perfil_id THEN p_real_perfil_id ELSE jugador1_id END,
        jugador2_id = CASE WHEN jugador2_id = p_placeholder_perfil_id THEN p_real_perfil_id ELSE jugador2_id END,
        ganador_id = CASE WHEN ganador_id = p_placeholder_perfil_id THEN p_real_perfil_id ELSE ganador_id END,
        jugador1_perfil_id = CASE WHEN jugador1_perfil_id = p_placeholder_perfil_id THEN p_real_perfil_id ELSE jugador1_perfil_id END,
        jugador2_perfil_id = CASE WHEN jugador2_perfil_id = p_placeholder_perfil_id THEN p_real_perfil_id ELSE jugador2_perfil_id END,
        ganador_perfil_id = CASE WHEN ganador_perfil_id = p_placeholder_perfil_id THEN p_real_perfil_id ELSE ganador_perfil_id END
    WHERE equipo1_id = v_equipo.id OR equipo2_id = v_equipo.id;
  END LOOP;

  DELETE FROM public.inscripciones_torneo WHERE perfil_id = p_placeholder_perfil_id;

  RETURN 'OK';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reemplazar_jugador_placeholder(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reemplazar_jugador_placeholder(uuid, uuid) TO authenticated, service_role;
