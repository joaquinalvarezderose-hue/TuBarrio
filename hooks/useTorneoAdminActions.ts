import { useCallback, useState } from 'react';
import { supabase } from '../services/supabaseClient';

export type Modalidad = 'singles' | 'dobles';

interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

/**
 * Envuelve los RPCs de administracion de un torneo especifico
 * (sorteo, playoffs, iniciar, aprobar inscripciones, forzar resultado,
 * W.O., resetear disputas). Todos estan protegidos server-side por
 * puede_administrar_torneo(torneo_id) -- este hook solo evita repetir
 * el boilerplate de supabase.rpc(...) en cada pantalla.
 */
export function useTorneoAdminActions(torneoId: number | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(fn: () => PromiseLike<{ data: T | null; error: any }>): Promise<ActionResult<T>> => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fn();
    setLoading(false);
    if (err) {
      setError(err.message || 'Error inesperado.');
      return { ok: false, error: err.message };
    }
    return { ok: true, data: data ?? undefined };
  }, []);

  const sortearGrupos = useCallback((modalidad: Modalidad, categoria?: string, grupoBase?: string) => {
    if (!torneoId) return Promise.resolve<ActionResult>({ ok: false, error: 'Torneo invalido.' });
    const rpc = modalidad === 'dobles' ? 'sortear_grupos_y_fixture_equipos_torneo' : 'sortear_grupos_y_fixture_torneo';
    return run(() => supabase.rpc(rpc, {
      p_torneo_id: torneoId,
      p_categoria: categoria ?? null,
      p_grupo_base: grupoBase ?? null,
    }));
  }, [torneoId, run]);

  const generarPlayoffs = useCallback((modalidad: Modalidad, categoria?: string, grupoBase?: string) => {
    if (!torneoId) return Promise.resolve<ActionResult>({ ok: false, error: 'Torneo invalido.' });
    const rpc = modalidad === 'dobles'
      ? 'generar_playoffs_eliminacion_directa_equipos_torneo'
      : 'generar_playoffs_eliminacion_directa_torneo';
    return run(() => supabase.rpc(rpc, {
      p_torneo_id: torneoId,
      p_categoria: categoria ?? null,
      p_grupo_base: grupoBase ?? null,
    }));
  }, [torneoId, run]);

  const iniciarTorneo = useCallback((categoria?: string, grupoBase?: string) => {
    if (!torneoId) return Promise.resolve<ActionResult>({ ok: false, error: 'Torneo invalido.' });
    return run(() => supabase.rpc('iniciar_torneo_en_curso', {
      p_torneo_id: torneoId,
      p_categoria: categoria ?? null,
      p_grupo_base: grupoBase ?? null,
    }));
  }, [torneoId, run]);

  const aprobarInscripcion = useCallback((inscripcionId: string) => {
    return run(() => supabase
      .from('inscripciones_torneo')
      .update({ estado: 'pagado_aprobado', aprobado_en: new Date().toISOString() })
      .eq('id', inscripcionId)
      .select()
      .maybeSingle());
  }, [run]);

  const rechazarInscripcion = useCallback((inscripcionId: string) => {
    return run(() => supabase
      .from('inscripciones_torneo')
      .update({ estado: 'rechazado' })
      .eq('id', inscripcionId)
      .select()
      .maybeSingle());
  }, [run]);

  const crearEquipoDobles = useCallback((categoria: string, jugador1Id: string, jugador2Id: string) => {
    if (!torneoId) return Promise.resolve<ActionResult>({ ok: false, error: 'Torneo invalido.' });
    return run(() => supabase.rpc('crear_equipo_dobles', {
      p_torneo_id: torneoId,
      p_categoria: categoria,
      p_jugador1_id: jugador1Id,
      p_jugador2_id: jugador2Id,
    }));
  }, [torneoId, run]);

  const eliminarEquipoDobles = useCallback((equipoId: string) => {
    return run(() => supabase.rpc('eliminar_equipo_dobles', { p_equipo_id: equipoId }));
  }, [run]);

  const forzarResultado = useCallback((
    partidoId: string,
    ganadorId: string,
    setsJson: Array<{ p1: number; p2: number }>,
    motivo?: string
  ) => {
    return run(() => supabase.rpc('admin_forzar_resultado_partido', {
      p_partido_id: partidoId,
      p_ganador_id: ganadorId,
      p_sets_json: setsJson,
      p_motivo: motivo ?? null,
    }));
  }, [run]);

  const marcarWOEquipo = useCallback((partidoId: string, equipoGanadorId: string) => {
    return run(() => supabase.rpc('admin_marcar_wo_equipo', {
      p_partido_id: partidoId,
      p_equipo_ganador_id: equipoGanadorId,
    }));
  }, [run]);

  const resetearDisputa = useCallback((partidoId: string, motivo?: string) => {
    return run(() => supabase.rpc('admin_resetear_disputa', {
      p_partido_id: partidoId,
      p_motivo: motivo ?? null,
    }));
  }, [run]);

  return {
    loading,
    error,
    sortearGrupos,
    generarPlayoffs,
    iniciarTorneo,
    aprobarInscripcion,
    rechazarInscripcion,
    crearEquipoDobles,
    eliminarEquipoDobles,
    forzarResultado,
    marcarWOEquipo,
    resetearDisputa,
  };
}
