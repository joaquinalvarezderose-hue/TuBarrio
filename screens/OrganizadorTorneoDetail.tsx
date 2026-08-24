import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRequireRole } from '../hooks/useRequireRole';
import { useTorneoAdminActions, type Modalidad } from '../hooks/useTorneoAdminActions';
import { useCategoriaGrupoOptions } from '../hooks/useCategoriaGrupoOptions';
import { supabase } from '../services/supabaseClient';
import { Skeleton } from '../components/Skeleton';

const DOBLE_WO_SENTINEL = '__DOBLE_WO__';

type TorneoInfo = {
  id: number;
  titulo: string;
  subtitulo: string;
  activo: boolean;
  cancelado: boolean;
};

type EstadoRow = {
  categoria: string;
  grupo: string;
  estado: string;
  current_participantes: number;
  sorteo_realizado: boolean;
};
const getEstadoCategoria = (e: EstadoRow) => e.categoria;
const getEstadoGrupo = (e: EstadoRow) => e.grupo;

type InscripcionRow = {
  id: string;
  perfil_id: string;
  categoria: string | null;
  monto: number;
  metodo_pago: string;
  comprobante_url: string | null;
  nombre: string;
};

type PartidoRow = {
  id: string;
  jornada: number | null;
  estado: string | null;
  resultado: string | null;
  jugador1_id: string | null;
  jugador2_id: string | null;
  equipo1_id: string | null;
  equipo2_id: string | null;
  nombre1: string;
  nombre2: string;
};

const OrganizadorTorneoDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const torneoId = id ? Number(id) : null;
  const { loading, hasAccess } = useRequireRole(['admin', 'organizador']);
  const actions = useTorneoAdminActions(torneoId);

  const [torneo, setTorneo] = useState<TorneoInfo | null>(null);
  const [modalidad, setModalidad] = useState<Modalidad>('singles');
  const [estados, setEstados] = useState<EstadoRow[]>([]);
  const [inscripciones, setInscripciones] = useState<InscripcionRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [activeCategoria, setActiveCategoria] = useState<string>('');
  const [activeGrupo, setActiveGrupo] = useState<string>('');
  const [partidos, setPartidos] = useState<PartidoRow[]>([]);
  const [woModalPartido, setWoModalPartido] = useState<PartidoRow | null>(null);
  const [woPerdedorId, setWoPerdedorId] = useState<string>('');

  const loadAll = useCallback(async () => {
    if (!torneoId) return;
    setLoadingData(true);

    const [{ data: torneoData, error: tErr }, { data: configData }, { data: estadoData }, { data: inscData }] =
      await Promise.all([
        supabase.from('torneos').select('id, titulo, subtitulo, activo, cancelado').eq('id', torneoId).maybeSingle(),
        supabase.from('torneo_configuracion').select('modalidad').eq('torneo_id', torneoId).maybeSingle(),
        supabase
          .from('torneo_estado')
          .select('categoria, grupo, estado, current_participantes, sorteo_realizado')
          .eq('torneo_id', torneoId)
          .order('categoria', { ascending: true }),
        supabase
          .from('inscripciones_torneo')
          .select('id, perfil_id, categoria, monto, metodo_pago, comprobante_url, perfil:perfiles!inscripciones_torneo_perfil_id_fkey(nombre_completo)')
          .eq('torneo_id', torneoId)
          .eq('estado', 'pendiente_revision'),
      ]);

    setLoadingData(false);

    if (tErr || !torneoData) {
      setFeedback('No se pudo cargar el torneo (o no tenes permiso sobre el).');
      return;
    }

    setTorneo(torneoData as TorneoInfo);
    setModalidad(configData?.modalidad === 'dobles' ? 'dobles' : 'singles');
    setEstados((estadoData ?? []) as EstadoRow[]);
    setInscripciones(((inscData ?? []) as any[]).map((i) => ({
      id: i.id,
      perfil_id: i.perfil_id,
      categoria: i.categoria,
      monto: i.monto,
      metodo_pago: i.metodo_pago,
      comprobante_url: i.comprobante_url,
      nombre: i.perfil?.nombre_completo || 'Sin nombre',
    })));
  }, [torneoId]);

  useEffect(() => {
    if (!hasAccess || !torneoId) return;
    loadAll();
  }, [hasAccess, torneoId, loadAll]);

  const { categorias, gruposDeCategoria } = useCategoriaGrupoOptions(
    estados,
    getEstadoCategoria,
    getEstadoGrupo,
    activeCategoria
  );

  useEffect(() => {
    if (categorias.length > 0 && !categorias.includes(activeCategoria)) {
      setActiveCategoria(categorias[0]);
    }
  }, [categorias, activeCategoria]);

  useEffect(() => {
    if (gruposDeCategoria.length > 0 && !gruposDeCategoria.includes(activeGrupo)) {
      setActiveGrupo(gruposDeCategoria[0]);
    }
  }, [gruposDeCategoria, activeGrupo]);

  const loadPartidos = useCallback(async () => {
    if (!torneoId || !activeCategoria || !activeGrupo) {
      setPartidos([]);
      return;
    }
    const select = modalidad === 'dobles'
      ? `id, jornada, estado, resultado, equipo1_id, equipo2_id,
         eq1:torneo_equipos!partidos_equipo1_id_fkey(jugador1_id, jugador2_id),
         eq2:torneo_equipos!partidos_equipo2_id_fkey(jugador1_id, jugador2_id)`
      : `id, jornada, estado, resultado, jugador1_id, jugador2_id,
         jugador1:perfiles!partidos_jugador1_id_fkey(nombre_completo),
         jugador2:perfiles!partidos_jugador2_id_fkey(nombre_completo)`;

    const { data, error } = await supabase
      .from('partidos')
      .select(select)
      .eq('torneo_id', torneoId)
      .eq('categoria', activeCategoria)
      .eq('grupo', activeGrupo)
      .order('jornada', { ascending: true });

    if (error) {
      console.error('[OrganizadorTorneoDetail] load partidos error:', error);
      return;
    }

    const rows: PartidoRow[] = (data ?? []).map((p: any) => ({
      id: p.id,
      jornada: p.jornada,
      estado: p.estado,
      resultado: p.resultado,
      jugador1_id: p.jugador1_id ?? null,
      jugador2_id: p.jugador2_id ?? null,
      equipo1_id: p.equipo1_id ?? null,
      equipo2_id: p.equipo2_id ?? null,
      nombre1: modalidad === 'dobles' ? 'Equipo 1' : (p.jugador1?.nombre_completo || 'Sin asignar'),
      nombre2: modalidad === 'dobles' ? 'Equipo 2' : (p.jugador2?.nombre_completo || 'Sin asignar'),
    }));
    setPartidos(rows);
  }, [torneoId, activeCategoria, activeGrupo, modalidad]);

  useEffect(() => { loadPartidos(); }, [loadPartidos]);

  const withFeedback = async (promise: PromiseLike<{ ok: boolean; error?: string; data?: unknown }>) => {
    const res = await promise;
    setFeedback(res.ok ? (typeof res.data === 'string' ? res.data : 'Listo.') : `Error: ${res.error}`);
    if (res.ok) {
      loadAll();
      loadPartidos();
    }
  };

  const confirmWo = async () => {
    if (!woModalPartido || !woPerdedorId) return;
    if (woPerdedorId === DOBLE_WO_SENTINEL) {
      setWoModalPartido(null);
      setWoPerdedorId('');
      if (modalidad === 'dobles') {
        await withFeedback(actions.marcarDobleWOEquipo(woModalPartido.id));
      } else {
        await withFeedback(actions.marcarDobleWO(woModalPartido.id));
      }
      return;
    }
    const ganadorId = woPerdedorId === woModalPartido.jugador1_id ? woModalPartido.jugador2_id : woModalPartido.jugador1_id;
    const ganadorEquipoId = woPerdedorId === woModalPartido.equipo1_id ? woModalPartido.equipo2_id : woModalPartido.equipo1_id;
    setWoModalPartido(null);
    setWoPerdedorId('');
    if (modalidad === 'dobles' && ganadorEquipoId) {
      await withFeedback(actions.marcarWOEquipo(woModalPartido.id, ganadorEquipoId));
    } else if (ganadorId) {
      const { error } = await supabase.rpc('admin_marcar_wo', { p_partido_id: woModalPartido.id, p_ganador_id: ganadorId });
      setFeedback(error ? `Error: ${error.message}` : 'W.O. marcado.');
      loadAll();
      loadPartidos();
    }
  };

  if (loading || loadingData) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-100">
        <div className="bg-white border-b border-slate-200 px-4 py-4"><Skeleton className="h-6 w-48" /></div>
        <div className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    );
  }
  if (!hasAccess) return null;
  if (!torneo) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-100 items-center justify-center p-6">
        <p className="text-sm text-slate-500">{feedback || 'Torneo no encontrado.'}</p>
        <button onClick={() => navigate('/organizador')} className="mt-4 text-primary font-semibold text-sm">Volver</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/organizador')} className="text-slate-500 hover:text-slate-800 text-2xl leading-none">‹</button>
        <div className="min-w-0 flex-1">
          <h1 className="font-black text-slate-900 text-lg uppercase tracking-wide truncate">{torneo.titulo}</h1>
          <p className="text-xs text-slate-500">{torneo.subtitulo}</p>
        </div>
        <button
          onClick={() => navigate(`/organizador/torneos/${torneo.id}/editar`)}
          className="text-xs font-bold text-slate-600 border border-slate-200 rounded-lg px-3 py-2"
        >
          Editar
        </button>
      </div>

      <div className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6">
        {feedback && (
          <div className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
            {feedback}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            Estado: {torneo.cancelado ? 'Cancelado' : torneo.activo ? 'Activo' : 'Archivado'}
          </div>
          <div className="flex gap-2">
            {torneo.activo && !torneo.cancelado && (
              <button
                onClick={() => withFeedback(
                  supabase.rpc('archivar_torneo', { p_torneo_id: torneo.id, p_activo: false, p_cancelado: null })
                    .then(({ error }) => ({ ok: !error, error: error?.message, data: 'Torneo archivado.' }))
                )}
                className="text-xs font-bold text-slate-600 border border-slate-200 rounded-lg px-3 py-2"
              >
                Archivar
              </button>
            )}
            {!torneo.cancelado && (
              <button
                onClick={() => withFeedback(
                  supabase.rpc('archivar_torneo', { p_torneo_id: torneo.id, p_activo: false, p_cancelado: true })
                    .then(({ error }) => ({ ok: !error, error: error?.message, data: 'Torneo cancelado.' }))
                )}
                className="text-xs font-bold text-red-600 border border-red-200 rounded-lg px-3 py-2"
              >
                Cancelar torneo
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-600 uppercase mb-3">
            Inscripciones pendientes ({inscripciones.length})
          </h3>
          {inscripciones.length === 0 ? (
            <p className="text-sm text-slate-400">No hay inscripciones pendientes de revision.</p>
          ) : (
            <div className="space-y-2">
              {inscripciones.map((i) => (
                <div key={i.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{i.nombre}</p>
                    <p className="text-xs text-slate-500">
                      {i.categoria || 'Sin categoria'} · ${i.monto} · {i.metodo_pago}
                      {i.comprobante_url && (
                        <a href={i.comprobante_url} target="_blank" rel="noreferrer" className="ml-2 text-primary underline">
                          Ver comprobante
                        </a>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => withFeedback(actions.rechazarInscripcion(i.id))}
                      className="text-xs font-bold text-red-600 border border-red-200 rounded-lg px-3 py-2"
                    >
                      Rechazar
                    </button>
                    <button
                      onClick={() => withFeedback(actions.aprobarInscripcion(i.id))}
                      className="text-xs font-bold text-white bg-primary rounded-lg px-3 py-2"
                    >
                      Aprobar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-600 uppercase mb-3">Grupos y fase</h3>
          {estados.length === 0 ? (
            <p className="text-sm text-slate-400">Todavia no se sorteo ningun grupo.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {estados.map((e) => (
                <div key={`${e.categoria}-${e.grupo}`} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{e.categoria} · {e.grupo}</p>
                    <p className="text-xs text-slate-500">{e.estado} · {e.current_participantes} anotados</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-200">
            <button
              disabled={actions.loading}
              onClick={() => withFeedback(actions.sortearGrupos(modalidad))}
              className="text-xs font-bold text-slate-700 border border-slate-200 rounded-lg px-3 py-2 disabled:opacity-50"
            >
              Sortear grupos
            </button>
            <button
              disabled={actions.loading}
              onClick={() => withFeedback(actions.iniciarTorneo())}
              className="text-xs font-bold text-slate-700 border border-slate-200 rounded-lg px-3 py-2 disabled:opacity-50"
            >
              Iniciar torneo (grupos en curso)
            </button>
            <button
              disabled={actions.loading}
              onClick={() => withFeedback(actions.generarPlayoffs(modalidad))}
              className="text-xs font-bold text-slate-700 border border-slate-200 rounded-lg px-3 py-2 disabled:opacity-50"
            >
              Generar playoffs
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-600 uppercase mb-3">Partidos</h3>

          {categorias.length === 0 ? (
            <p className="text-sm text-slate-400">Todavia no hay grupos ni partidos.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <select
                  value={activeCategoria}
                  onChange={(e) => { setActiveCategoria(e.target.value); setActiveGrupo(''); }}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  value={activeGrupo}
                  onChange={(e) => setActiveGrupo(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {gruposDeCategoria.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              {partidos.length === 0 ? (
                <p className="text-sm text-slate-400">No hay partidos para este grupo.</p>
              ) : (
                <div className="space-y-2">
                  {partidos.map((p) => (
                    <div key={p.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
                      <div className="text-sm min-w-0">
                        <p className="font-semibold text-slate-900 truncate">
                          {p.nombre1} <span className="text-slate-400">vs</span> {p.nombre2}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Jornada {p.jornada ?? '—'} · {p.estado || 'sin estado'}
                          {p.resultado ? ` · ${p.resultado}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => { setFeedback(null); setWoPerdedorId(''); setWoModalPartido(p); }}
                        disabled={modalidad === 'dobles' ? (!p.equipo1_id || !p.equipo2_id) : (!p.jugador1_id || !p.jugador2_id)}
                        className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2 px-3 rounded-lg disabled:opacity-40 transition"
                      >
                        Marcar W.O.
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {woModalPartido && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-slate-900 mb-1">Marcar W.O.</h3>
            <p className="text-xs text-slate-500 mb-4">{woModalPartido.nombre1} vs {woModalPartido.nombre2}</p>

            <p className="text-sm font-semibold text-slate-700 mb-2">¿Quien recibe el W.O.?</p>
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="wo_perdedor"
                  checked={woPerdedorId === (modalidad === 'dobles' ? woModalPartido.equipo1_id : woModalPartido.jugador1_id)}
                  onChange={() => setWoPerdedorId((modalidad === 'dobles' ? woModalPartido.equipo1_id : woModalPartido.jugador1_id) || '')}
                />
                {woModalPartido.nombre1}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="wo_perdedor"
                  checked={woPerdedorId === (modalidad === 'dobles' ? woModalPartido.equipo2_id : woModalPartido.jugador2_id)}
                  onChange={() => setWoPerdedorId((modalidad === 'dobles' ? woModalPartido.equipo2_id : woModalPartido.jugador2_id) || '')}
                />
                {woModalPartido.nombre2}
              </label>
              <label className="flex items-center gap-2 text-sm border-t border-slate-100 pt-2 mt-1">
                <input
                  type="radio"
                  name="wo_perdedor"
                  checked={woPerdedorId === DOBLE_WO_SENTINEL}
                  onChange={() => setWoPerdedorId(DOBLE_WO_SENTINEL)}
                />
                Ninguno de los dos puede jugar (doble W.O.)
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setWoModalPartido(null)}
                className="flex-1 border border-slate-200 text-slate-700 font-semibold py-2 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={confirmWo}
                disabled={!woPerdedorId}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 rounded-lg text-sm disabled:opacity-50 transition"
              >
                Confirmar W.O.
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrganizadorTorneoDetail;
