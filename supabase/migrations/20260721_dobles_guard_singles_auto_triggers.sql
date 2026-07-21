-- ============================================================
-- Hallazgo de la prueba end-to-end de dobles: on_torneo_estado_en_curso()
-- y finalizar_grupo_si_completo() (ambas preexistentes, de singles)
-- no discriminan modalidad: si un torneo_estado de un torneo de
-- dobles llega a EN_CURSO con sorteo_realizado=false, o si un
-- partido de dobles finaliza y quedan 0 partidos pendientes,
-- estas funciones intentarian ejecutar el pipeline de SINGLES
-- (sortear_grupos_y_fixture_torneo / generar_playoffs_eliminacion_directa_torneo)
-- sobre ese torneo, generando un bracket/fixture espureo basado en
-- torneo_jugadores en paralelo al de torneo_equipos.
--
-- Fix minimo y aditivo: cortar temprano si el torneo es modalidad
-- 'dobles'. Default de modalidad es 'singles', asi que esto es un
-- no-op total para cualquier torneo singles existente o futuro.
-- ============================================================

CREATE OR REPLACE FUNCTION public.on_torneo_estado_en_curso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_grupo_base text;
  v_modalidad text;
BEGIN
  IF NEW.estado <> 'EN_CURSO' OR coalesce(NEW.sorteo_realizado, false) = true THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado = 'EN_CURSO' THEN
    RETURN NEW;
  END IF;

  SELECT tc.modalidad INTO v_modalidad
  FROM public.torneo_configuracion tc
  WHERE tc.torneo_id = NEW.torneo_id;

  IF v_modalidad = 'dobles' THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(nullif(trim(tc.grupo_base), ''), format('TORNEO_%s', NEW.torneo_id))
  INTO v_grupo_base
  FROM public.torneo_configuracion tc
  WHERE tc.torneo_id = NEW.torneo_id;
  v_grupo_base := coalesce(v_grupo_base, format('TORNEO_%s', NEW.torneo_id));

  IF NEW.grupo <> v_grupo_base THEN RETURN NEW; END IF;

  PERFORM public.sortear_grupos_y_fixture_torneo(NEW.torneo_id, NEW.categoria);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_grupo_si_completo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_torneo_id     bigint;
  v_categoria     text;
  v_pendientes    integer;
  v_modalidad     text;
BEGIN
  IF NEW.estado <> 'finalizado'
     OR OLD.estado = 'finalizado'
     OR NEW.bracket_tipo = 'eliminacion_directa' THEN
    RETURN NEW;
  END IF;

  v_torneo_id := NEW.torneo_id;
  v_categoria := NEW.categoria;

  SELECT tc.modalidad INTO v_modalidad
  FROM public.torneo_configuracion tc
  WHERE tc.torneo_id = v_torneo_id;

  IF v_modalidad = 'dobles' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_pendientes
  FROM public.partidos
  WHERE torneo_id = v_torneo_id
    AND (v_categoria IS NULL OR categoria = v_categoria)
    AND (bracket_tipo IS NULL OR bracket_tipo <> 'eliminacion_directa')
    AND estado <> 'finalizado';

  IF v_pendientes > 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.torneo_estado
  SET estado = 'FINALIZADO', updated_at = now()
  WHERE torneo_id = v_torneo_id
    AND (v_categoria IS NULL OR categoria = v_categoria)
    AND grupo NOT LIKE '%_PLAYOFFS'
    AND TRIM(estado) <> 'FINALIZADO';

  IF EXISTS (
    SELECT 1 FROM public.partidos
    WHERE torneo_id = v_torneo_id
      AND (v_categoria IS NULL OR categoria = v_categoria)
      AND bracket_tipo = 'eliminacion_directa'
  ) THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.torneo_configuracion
    WHERE torneo_id = v_torneo_id
      AND crear_playoffs_eliminacion_directa = true
  ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.generar_playoffs_eliminacion_directa_torneo(v_torneo_id, v_categoria);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Auto-generación de playoffs falló para torneo %: %', v_torneo_id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
