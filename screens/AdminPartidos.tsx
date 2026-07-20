import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { supabase } from '../services/supabaseClient';
import { Skeleton } from '../components/Skeleton';

type TorneoOption = { id: number; titulo: string };
type GrupoOption = { torneo_id: number; categoria: string; grupo: string };

type PartidoRow = {
  id: string;
  jornada: number | null;
  estado: string | null;
  resultado: string | null;
  es_wo: boolean;
  jugador1_id: string | null;
  jugador2_id: string | null;
  ganador_id: string | null;
  jugador1_nombre: string;
  jugador2_nombre: string;
};

const AdminPartidos: React.FC = () => {
  const navigate = useNavigate();
  const { perfil, loading, authUser } = useCurrentUser();

  const [torneos, setTorneos] = useState<TorneoOption[]>([]);
  const [gruposPosiciones, setGruposPosiciones] = useState<GrupoOption[]>([]);
  const [activeTorneo, setActiveTorneo] = useState<number | null>(null);
  const [activeCategoria, setActiveCategoria] = useState<string>('');
  const [activeGrupo, setActiveGrupo] = useState<string>('');

  const [partidos, setPartidos] = useState<PartidoRow[]>([]);
  const [loadingPartidos, setLoadingPartidos] = useState(false);

  const [woModalPartido, setWoModalPartido] = useState<PartidoRow | null>(null);
  const [woPerdedorId, setWoPerdedorId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !authUser) {
      navigate('/login', { replace: true });
    }
  }, [loading, authUser, navigate]);

  useEffect(() => {
    if (!loading && perfil && perfil.rol !== 'admin') {
      navigate('/tournaments', { replace: true });
    }
  }, [loading, perfil, navigate]);

  useEffect(() => {
    if (perfil?.rol !== 'admin') return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('torneos')
        .select('id, titulo')
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error('[AdminPartidos] load torneos error:', error);
        return;
      }
      const rows = (data ?? []) as TorneoOption[];
      setTorneos(rows);
      setActiveTorneo((prev) => prev ?? rows[0]?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, [perfil]);

  useEffect(() => {
    if (perfil?.rol !== 'admin' || !activeTorneo) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('v_admin_grupos_posiciones')
        .select('torneo_id, categoria, grupo')
        .eq('torneo_id', activeTorneo);
      if (cancelled) return;
      if (error) {
        console.error('[AdminPartidos] load grupos error:', error);
        return;
      }
      setGruposPosiciones((data ?? []) as GrupoOption[]);
    })();
    return () => { cancelled = true; };
  }, [perfil, activeTorneo]);

  const categorias = [...new Set(gruposPosiciones.map((g) => g.categoria))].sort();
  const gruposDeCategoria = [...new Set(
    gruposPosiciones.filter((g) => g.categoria === activeCategoria).map((g) => g.grupo)
  )].sort();

  useEffect(() => {
    if (perfil?.rol !== 'admin') return;
    if (categorias.length > 0 && !categorias.includes(activeCategoria)) {
      setActiveCategoria(categorias[0]);
    }
  }, [perfil, categorias, activeCategoria]);

  useEffect(() => {
    if (perfil?.rol !== 'admin') return;
    if (gruposDeCategoria.length > 0 && !gruposDeCategoria.includes(activeGrupo)) {
      setActiveGrupo(gruposDeCategoria[0]);
    }
  }, [perfil, gruposDeCategoria, activeGrupo]);

  const loadPartidos = React.useCallback(async () => {
    if (perfil?.rol !== 'admin' || !activeTorneo || !activeCategoria || !activeGrupo) {
      setPartidos([]);
      return;
    }
    setLoadingPartidos(true);
    const { data, error } = await supabase
      .from('partidos')
      .select(`
        id, jornada, estado, resultado, es_wo, ganador_id,
        jugador1_id, jugador2_id,
        jugador1:perfiles!partidos_jugador1_id_fkey(nombre_completo),
        jugador2:perfiles!partidos_jugador2_id_fkey(nombre_completo)
      `)
      .eq('torneo_id', activeTorneo)
      .eq('categoria', activeCategoria)
      .eq('grupo', activeGrupo)
      .order('jornada', { ascending: true });

    setLoadingPartidos(false);
    if (error) {
      console.error('[AdminPartidos] load partidos error:', error);
      setFeedback('No se pudieron cargar los partidos.');
      return;
    }
    const rows: PartidoRow[] = (data ?? []).map((p: any) => ({
      id: p.id,
      jornada: p.jornada,
      estado: p.estado,
      resultado: p.resultado,
      es_wo: !!p.es_wo,
      jugador1_id: p.jugador1_id,
      jugador2_id: p.jugador2_id,
      ganador_id: p.ganador_id,
      jugador1_nombre: p.jugador1?.nombre_completo || 'Sin asignar',
      jugador2_nombre: p.jugador2?.nombre_completo || 'Sin asignar',
    }));
    setPartidos(rows);
  }, [perfil, activeTorneo, activeCategoria, activeGrupo]);

  useEffect(() => {
    loadPartidos();
  }, [loadPartidos]);

  const openWoModal = (partido: PartidoRow) => {
    setFeedback(null);
    setWoPerdedorId('');
    setWoModalPartido(partido);
  };

  const closeWoModal = () => {
    setWoModalPartido(null);
    setWoPerdedorId('');
  };

  const confirmWo = async () => {
    if (!woModalPartido || !woPerdedorId) return;
    const ganadorId = woPerdedorId === woModalPartido.jugador1_id
      ? woModalPartido.jugador2_id
      : woModalPartido.jugador1_id;
    if (!ganadorId) return;

    setSubmitting(true);
    const { data, error } = await supabase.rpc('admin_marcar_wo', {
      p_partido_id: woModalPartido.id,
      p_ganador_id: ganadorId,
    });
    setSubmitting(false);

    if (error) {
      console.error('[AdminPartidos] admin_marcar_wo error:', error);
      setFeedback(`Error: ${error.message}`);
      return;
    }

    setFeedback(String(data));
    closeWoModal();
    loadPartidos();
  };

  if (loading || !authUser || !perfil) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-100">
        <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
            <Skeleton className="h-4 w-40 mb-2" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }
  if (perfil.rol !== 'admin') return null;

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/admin')}
          className="text-slate-500 hover:text-slate-800 text-2xl leading-none"
        >
          ‹
        </button>
        <h1 className="font-black text-slate-900 text-lg uppercase tracking-wide">Gestionar Partidos</h1>
      </div>

      <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-600 uppercase mb-3">Torneo / Categoría / Grupo</h3>

          {torneos.length === 0 ? (
            <p className="text-sm text-slate-400">No hay torneos cargados.</p>
          ) : (
            <div className="space-y-3">
              <select
                value={activeTorneo ?? ''}
                onChange={(e) => {
                  setActiveTorneo(Number(e.target.value));
                  setActiveCategoria('');
                  setActiveGrupo('');
                }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                {torneos.map((t) => (
                  <option key={t.id} value={t.id}>{t.titulo}</option>
                ))}
              </select>

              <select
                value={activeCategoria}
                onChange={(e) => {
                  setActiveCategoria(e.target.value);
                  setActiveGrupo('');
                }}
                disabled={categorias.length === 0}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-50"
              >
                {categorias.length === 0 && <option value="">Sin categorías</option>}
                {categorias.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <select
                value={activeGrupo}
                onChange={(e) => setActiveGrupo(e.target.value)}
                disabled={gruposDeCategoria.length === 0}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-50"
              >
                {gruposDeCategoria.length === 0 && <option value="">Sin grupos</option>}
                {gruposDeCategoria.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          )}

          {feedback && (
            <div className="mt-4 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
              {feedback}
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-600 uppercase mb-3">Partidos</h3>

            {loadingPartidos ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-4 w-2/3 mb-2" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                    <Skeleton className="h-8 w-24 rounded-lg shrink-0" />
                  </div>
                ))}
              </div>
            ) : partidos.length === 0 ? (
              <p className="text-sm text-slate-400">No hay partidos para este grupo.</p>
            ) : (
              <div className="space-y-2">
                {partidos.map((p) => (
                  <div
                    key={p.id}
                    className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3"
                  >
                    <div className="text-sm min-w-0">
                      <p className="font-semibold text-slate-900 truncate">
                        {p.jugador1_nombre} <span className="text-slate-400">vs</span> {p.jugador2_nombre}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Jornada {p.jornada ?? '—'} · {p.estado || 'sin estado'}
                        {p.resultado ? ` · ${p.resultado}` : ''}
                        {p.es_wo && (
                          <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">
                            W.O.
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => openWoModal(p)}
                      disabled={!p.jugador1_id || !p.jugador2_id}
                      className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2 px-3 rounded-lg disabled:opacity-40 transition"
                    >
                      Marcar W.O.
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {woModalPartido && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-slate-900 mb-1">Marcar W.O.</h3>
            <p className="text-xs text-slate-500 mb-4">
              {woModalPartido.jugador1_nombre} vs {woModalPartido.jugador2_nombre}
            </p>

            {woModalPartido.estado === 'finalizado' && !woModalPartido.es_wo && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-4">
                Este partido ya tiene un resultado cargado. Marcar W.O. lo sobrescribe.
              </p>
            )}

            <p className="text-sm font-semibold text-slate-700 mb-2">¿Quién recibe el W.O.?</p>
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="wo_perdedor"
                  checked={woPerdedorId === woModalPartido.jugador1_id}
                  onChange={() => setWoPerdedorId(woModalPartido.jugador1_id || '')}
                />
                {woModalPartido.jugador1_nombre}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="wo_perdedor"
                  checked={woPerdedorId === woModalPartido.jugador2_id}
                  onChange={() => setWoPerdedorId(woModalPartido.jugador2_id || '')}
                />
                {woModalPartido.jugador2_nombre}
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={closeWoModal}
                disabled={submitting}
                className="flex-1 border border-slate-200 text-slate-700 font-semibold py-2 rounded-lg text-sm disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmWo}
                disabled={submitting || !woPerdedorId}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 rounded-lg text-sm disabled:opacity-50 transition"
              >
                {submitting ? 'Guardando...' : 'Confirmar W.O.'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPartidos;
