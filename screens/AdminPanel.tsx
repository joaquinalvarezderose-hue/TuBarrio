import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useCurrentUser } from '../hooks/useCurrentUser';
import BracketTab from '../components/BracketTab';

// ─── Types ────────────────────────────────────────────────────────────────────

type TorneoRow = { id: number; titulo: string };

type DisputaRow = {
  propuesta_id: string;
  partido_id: string;
  torneo_id: number;
  torneo_titulo: string;
  categoria: string;
  grupo: string | null;
  stage_name: string | null;
  bracket_tipo: string | null;
  estado: string;
  horas_pendiente: number;
  jugador1_nombre: string | null;
  jugador2_nombre: string | null;
  jugador1_id: string;
  jugador2_id: string;
  sets_json_j1: unknown;
  sets_json_j2: unknown;
};

type GrupoRow = {
  torneo_id: number;
  categoria: string;
  grupo: string;
  posicion: number;
  jugador_nombre: string;
  perfil_id: string;
  puntos: number;
  pj: number;
  sg: number;
  sp: number;
  dif_sets: number;
  estado_grupo: string | null;
};

type SetPair = { p1: number; p2: number };

type ServicioClickRow = {
  id: string;
  servicio_id: string;
  servicio_titulo: string;
  user_id: string | null;
  user_nombre: string | null;
  tipo_evento: 'profile_view' | 'whatsapp_click';
  clicked_at: string;
};

type ForceForm = {
  ganador_id: string;
  sets: SetPair[];
  motivo: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TABS = ['Disputas', 'Grupos', 'Llaves', 'Acciones', 'Servicios'] as const;
type Tab = typeof TABS[number];

function setsLabel(json: unknown): string {
  if (!json || !Array.isArray(json)) return '—';
  return (json as SetPair[]).map(s => `${s.p1}-${s.p2}`).join(', ');
}

// ─── Component ────────────────────────────────────────────────────────────────

const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const { perfil, loading: userLoading } = useCurrentUser();

  const [tab, setTab] = useState<Tab>('Disputas');
  const [torneos, setTorneos] = useState<TorneoRow[]>([]);
  const [activeTorneo, setActiveTorneo] = useState<number | null>(null);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [activeCategoria, setActiveCategoria] = useState<string>('');

  const [disputas, setDisputas] = useState<DisputaRow[]>([]);
  const [grupos, setGrupos] = useState<GrupoRow[]>([]);
  const [servicioClicks, setServicioClicks] = useState<ServicioClickRow[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Force result form state per propuesta_id
  const [forceOpen, setForceOpen] = useState<string | null>(null);
  const [forceForm, setForceForm] = useState<ForceForm>({
    ganador_id: '',
    sets: [{ p1: 0, p2: 0 }, { p1: 0, p2: 0 }, { p1: 0, p2: 0 }],
    motivo: '',
  });
  const [actionMsg, setActionMsg] = useState<{ id: string; msg: string; ok: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Admin guard
  useEffect(() => {
    if (userLoading) return;
    if (perfil?.rol !== 'admin') {
      navigate('/tournaments', { replace: true });
    }
  }, [userLoading, perfil, navigate]);

  // Load active torneos
  useEffect(() => {
    supabase
      .from('torneos')
      .select('id, titulo')
      .eq('activo', true)
      .order('id', { ascending: false })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setTorneos(data as TorneoRow[]);
          setActiveTorneo((data[0] as TorneoRow).id);
        }
      });
  }, []);

  // Load categories for selected torneo
  useEffect(() => {
    if (!activeTorneo) return;
    supabase
      .from('torneo_estado')
      .select('categoria')
      .eq('torneo_id', activeTorneo)
      .then(({ data }) => {
        const unique = [...new Set((data ?? []).map((r: { categoria: string }) => r.categoria))];
        setCategorias(unique);
        setActiveCategoria(unique[0] ?? '');
      });
  }, [activeTorneo]);

  const loadDisputas = useCallback(async () => {
    setLoadingData(true);
    const { data, error } = await supabase
      .from('v_admin_disputas_activas' as 'partidos')
      .select('*')
      .order('horas_pendiente', { ascending: false });
    if (error) console.error('[AdminPanel] loadDisputas error:', error);
    setDisputas((data ?? []) as unknown as DisputaRow[]);
    setLoadingData(false);
  }, []);

  const loadGrupos = useCallback(async () => {
    if (!activeTorneo) return;
    setLoadingData(true);
    const { data, error } = await supabase
      .from('v_admin_grupos_posiciones' as 'partidos')
      .select('*')
      .eq('torneo_id', activeTorneo);
    if (error) console.error('[AdminPanel] loadGrupos error:', error);
    setGrupos((data ?? []) as unknown as GrupoRow[]);
    setLoadingData(false);
  }, [activeTorneo]);

  const loadServicioClicks = useCallback(async () => {
    setLoadingData(true);
    const { data, error } = await supabase
      .from('servicio_clicks' as 'marketplace_servicios')
      .select('*')
      .order('clicked_at', { ascending: false })
      .limit(200);
    if (error) console.error('[AdminPanel] loadServicioClicks error:', error);
    setServicioClicks((data ?? []) as unknown as ServicioClickRow[]);
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (perfil?.rol !== 'admin') return;
    if (tab === 'Disputas') loadDisputas();
    if (tab === 'Grupos') loadGrupos();
    if (tab === 'Servicios') loadServicioClicks();
  }, [tab, perfil, loadDisputas, loadGrupos, loadServicioClicks]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleForzar = async (disputa: DisputaRow) => {
    if (!forceForm.ganador_id) { setActionMsg({ id: disputa.propuesta_id, msg: 'Seleccioná un ganador.', ok: false }); return; }
    setActionLoading(true);
    setActionMsg(null);
    const setsFiltered = forceForm.sets.filter(s => s.p1 > 0 || s.p2 > 0);
    const { data, error } = await supabase.rpc('admin_forzar_resultado_partido', {
      p_partido_id: disputa.partido_id,
      p_ganador_id: forceForm.ganador_id,
      p_sets_json: setsFiltered,
      p_motivo: forceForm.motivo || null,
    });
    setActionLoading(false);
    if (error) {
      setActionMsg({ id: disputa.propuesta_id, msg: error.message, ok: false });
    } else {
      setActionMsg({ id: disputa.propuesta_id, msg: String(data), ok: true });
      setForceOpen(null);
      loadDisputas();
    }
  };

  const handleResetear = async (disputa: DisputaRow) => {
    if (!window.confirm(`¿Resetear la disputa de ${disputa.jugador1_nombre} vs ${disputa.jugador2_nombre}?`)) return;
    setActionLoading(true);
    const { data, error } = await supabase.rpc('admin_resetear_disputa', {
      p_partido_id: disputa.partido_id,
      p_motivo: 'Reset manual desde panel admin',
    });
    setActionLoading(false);
    setActionMsg({
      id: disputa.propuesta_id,
      msg: error ? error.message : String(data),
      ok: !error,
    });
    if (!error) loadDisputas();
  };

  const updateSet = (idx: number, side: 'p1' | 'p2', val: string) => {
    setForceForm(f => {
      const sets = [...f.sets];
      sets[idx] = { ...sets[idx], [side]: parseInt(val) || 0 };
      return { ...f, sets };
    });
  };

  // ── Tabs ───────────────────────────────────────────────────────────────────

  const renderDisputas = () => (
    <div className="space-y-3">
      {loadingData && <p className="text-sm text-slate-500 text-center py-6">Cargando...</p>}
      {!loadingData && disputas.length === 0 && (
        <div className="text-center py-10 text-slate-400 text-sm">
          Sin disputas activas. Todo en orden.
        </div>
      )}
      {disputas.map(d => (
        <div key={d.propuesta_id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full mr-2 ${d.estado === 'discrepancia' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {d.estado === 'discrepancia' ? 'Discrepancia' : 'Pendiente'}
              </span>
              <span className="text-xs text-slate-400">{d.horas_pendiente}h</span>
            </div>
            <span className="text-xs text-slate-400">{d.torneo_titulo} · {d.categoria}{d.stage_name ? ` · ${d.stage_name}` : ''}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="font-semibold text-slate-800">{d.jugador1_nombre ?? 'Jugador 1'}</p>
              <p className="text-slate-500 text-xs">{setsLabel(d.sets_json_j1)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="font-semibold text-slate-800">{d.jugador2_nombre ?? 'Jugador 2'}</p>
              <p className="text-slate-500 text-xs">{setsLabel(d.sets_json_j2)}</p>
            </div>
          </div>

          {/* Action feedback */}
          {actionMsg?.id === d.propuesta_id && (
            <p className={`text-xs px-2 py-1 rounded ${actionMsg.ok ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
              {actionMsg.msg}
            </p>
          )}

          {/* Force form */}
          {forceOpen === d.propuesta_id ? (
            <div className="border-t border-slate-100 pt-3 space-y-3">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Forzar resultado</p>
              <div className="flex gap-3">
                {[{ id: d.jugador1_id, name: d.jugador1_nombre }, { id: d.jugador2_id, name: d.jugador2_nombre }].map(p => (
                  <label key={p.id} className={`flex-1 flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm ${forceForm.ganador_id === p.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                    <input
                      type="radio"
                      name={`ganador-${d.propuesta_id}`}
                      value={p.id}
                      checked={forceForm.ganador_id === p.id}
                      onChange={() => setForceForm(f => ({ ...f, ganador_id: p.id }))}
                      className="accent-emerald-600"
                    />
                    <span className="font-medium">{p.name ?? p.id.slice(0, 8)}</span>
                  </label>
                ))}
              </div>
              <div className="space-y-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-slate-400 w-10">Set {i + 1}</span>
                    <input
                      type="number" min={0} max={9}
                      value={forceForm.sets[i].p1}
                      onChange={e => updateSet(i, 'p1', e.target.value)}
                      className="w-14 border border-slate-200 rounded-lg px-2 py-1 text-center"
                    />
                    <span className="text-slate-400">–</span>
                    <input
                      type="number" min={0} max={9}
                      value={forceForm.sets[i].p2}
                      onChange={e => updateSet(i, 'p2', e.target.value)}
                      className="w-14 border border-slate-200 rounded-lg px-2 py-1 text-center"
                    />
                  </div>
                ))}
              </div>
              <input
                type="text"
                placeholder="Motivo (opcional)"
                value={forceForm.motivo}
                onChange={e => setForceForm(f => ({ ...f, motivo: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleForzar(d)}
                  disabled={actionLoading}
                  className="flex-1 bg-emerald-600 text-white rounded-lg py-2 text-sm font-bold disabled:opacity-50"
                >
                  {actionLoading ? 'Guardando...' : 'Confirmar resultado'}
                </button>
                <button
                  onClick={() => setForceOpen(null)}
                  className="px-4 border border-slate-200 rounded-lg text-sm text-slate-600"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  setForceOpen(d.propuesta_id);
                  setForceForm({ ganador_id: '', sets: [{ p1: 0, p2: 0 }, { p1: 0, p2: 0 }, { p1: 0, p2: 0 }], motivo: '' });
                  setActionMsg(null);
                }}
                className="flex-1 bg-emerald-600 text-white rounded-lg py-2 text-xs font-bold"
              >
                Forzar resultado
              </button>
              {d.estado === 'discrepancia' && (
                <button
                  onClick={() => handleResetear(d)}
                  disabled={actionLoading}
                  className="flex-1 border border-slate-300 text-slate-700 rounded-lg py-2 text-xs font-bold disabled:opacity-50"
                >
                  Resetear disputa
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderGrupos = () => {
    const grupos_unicos = [...new Set(grupos.map(r => r.grupo))].sort();
    return (
      <div className="space-y-4">
        {loadingData && <p className="text-sm text-slate-500 text-center py-6">Cargando...</p>}
        {grupos_unicos.map(g => {
          const filas = grupos.filter(r => r.grupo === g).sort((a, b) => a.posicion - b.posicion);
          const primeraFila = filas[0];
          return (
            <div key={g} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <span className="font-bold text-slate-700 text-sm">{g}</span>
                {primeraFila?.estado_grupo && (
                  <span className="text-xs text-slate-400 uppercase tracking-wide">{primeraFila.estado_grupo}</span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400 uppercase tracking-wide">
                      <th className="text-left px-3 py-2">#</th>
                      <th className="text-left px-3 py-2">Jugador</th>
                      <th className="text-center px-2 py-2">PJ</th>
                      <th className="text-center px-2 py-2">Pts</th>
                      <th className="text-center px-2 py-2">Dif.S</th>
                      <th className="text-center px-2 py-2">S.G</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((r, i) => (
                      <tr key={r.perfil_id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="px-3 py-2 text-slate-400">{r.posicion}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">{r.jugador_nombre}</td>
                        <td className="px-2 py-2 text-center text-slate-600">{r.pj}</td>
                        <td className="px-2 py-2 text-center font-bold text-slate-900">{r.puntos}</td>
                        <td className={`px-2 py-2 text-center font-semibold ${r.dif_sets > 0 ? 'text-emerald-600' : r.dif_sets < 0 ? 'text-red-500' : 'text-slate-500'}`}>
                          {r.dif_sets > 0 ? `+${r.dif_sets}` : r.dif_sets}
                        </td>
                        <td className="px-2 py-2 text-center text-slate-600">{r.sg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {!loadingData && grupos.length === 0 && (
          <p className="text-center py-10 text-slate-400 text-sm">Sin datos de grupos para este torneo.</p>
        )}
      </div>
    );
  };

  const renderLlaves = () => {
    if (!activeTorneo || !activeCategoria) {
      return <p className="text-center py-10 text-slate-400 text-sm">Seleccioná torneo y categoría.</p>;
    }
    return (
      <BracketTab
        torneo_id={activeTorneo}
        categoria={activeCategoria}
      />
    );
  };

  const renderAcciones = () => {
    if (!activeTorneo) return null;
    return (
      <AccionesTab torneo_id={activeTorneo} categoria={activeCategoria} />
    );
  };

  const renderServicios = () => {
    const resumen: Record<string, { titulo: string; vistas: number; whatsapp: number }> = {};
    for (const c of servicioClicks) {
      if (!resumen[c.servicio_id]) {
        resumen[c.servicio_id] = { titulo: c.servicio_titulo, vistas: 0, whatsapp: 0 };
      }
      if (c.tipo_evento === 'profile_view') resumen[c.servicio_id].vistas++;
      else resumen[c.servicio_id].whatsapp++;
    }
    const resumenList = Object.entries(resumen).sort((a, b) => (b[1].vistas + b[1].whatsapp) - (a[1].vistas + a[1].whatsapp));

    return (
      <div className="space-y-4">
        {loadingData && <p className="text-sm text-slate-500 text-center py-6">Cargando...</p>}

        {/* Resumen por prestador */}
        {resumenList.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
              <span className="font-bold text-slate-700 text-sm">Resumen por prestador</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th className="text-left px-3 py-2">Prestador</th>
                    <th className="text-center px-3 py-2">Vistas</th>
                    <th className="text-center px-3 py-2">WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  {resumenList.map(([id, r], i) => (
                    <tr key={id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="px-3 py-2 font-medium text-slate-800">{r.titulo}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{r.vistas}</td>
                      <td className="px-3 py-2 text-center font-bold text-[#25D366]">{r.whatsapp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Log de eventos */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="font-bold text-slate-700 text-sm">Últimos eventos</span>
            <span className="text-xs text-slate-400">{servicioClicks.length} registros</span>
          </div>
          {!loadingData && servicioClicks.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-sm">Sin eventos registrados todavía.</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              {servicioClicks.length > 0 && (
                <thead>
                  <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th className="text-left px-3 py-2">Fecha</th>
                    <th className="text-left px-3 py-2">Prestador</th>
                    <th className="text-center px-3 py-2">Evento</th>
                    <th className="text-left px-3 py-2">Usuario</th>
                  </tr>
                </thead>
              )}
              <tbody>
                {servicioClicks.map((c, i) => {
                  const fecha = new Date(c.clicked_at);
                  const fechaStr = fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
                  const horaStr = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fechaStr} {horaStr}</td>
                      <td className="px-3 py-2 text-slate-800 font-medium">{c.servicio_titulo}</td>
                      <td className="px-3 py-2 text-center">
                        {c.tipo_evento === 'whatsapp_click' ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-[#25D366]/10 text-[#1a9e4e]">WhatsApp</span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500">Vista</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{c.user_nombre ?? <span className="italic text-slate-300">Anónimo</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  if (userLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-slate-400 text-sm">Verificando permisos...</p>
      </div>
    );
  }

  if (perfil?.rol !== 'admin') return null;

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-500 hover:text-slate-800 text-xl leading-none"
        >
          ‹
        </button>
        <h1 className="font-black text-slate-900 text-base uppercase tracking-wide">Panel Admin</h1>
        <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Admin</span>
      </div>

      {/* Selectors */}
      <div className="bg-white border-b border-slate-100 px-4 py-2 flex flex-wrap gap-2">
        <select
          value={activeTorneo ?? ''}
          onChange={e => setActiveTorneo(Number(e.target.value))}
          className="flex-1 min-w-[140px] border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          {torneos.map(t => (
            <option key={t.id} value={t.id}>{t.titulo}</option>
          ))}
        </select>
        {categorias.length > 1 && (
          <select
            value={activeCategoria}
            onChange={e => setActiveCategoria(e.target.value)}
            className="flex-1 min-w-[120px] border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            {categorias.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-4 flex gap-0 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${tab === t ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t}
            {t === 'Disputas' && disputas.length > 0 && (
              <span className="ml-1.5 bg-red-100 text-red-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{disputas.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 p-4 max-w-2xl w-full mx-auto">
        {tab === 'Disputas' && renderDisputas()}
        {tab === 'Grupos' && renderGrupos()}
        {tab === 'Llaves' && renderLlaves()}
        {tab === 'Acciones' && renderAcciones()}
        {tab === 'Servicios' && renderServicios()}
      </div>
    </div>
  );
};

// ─── Acciones Tab (extracted to keep AdminPanel readable) ─────────────────────

interface AccionesTabProps {
  torneo_id: number;
  categoria: string;
}

const AccionesTab: React.FC<AccionesTabProps> = ({ torneo_id, categoria }) => {
  const [loading, setLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const run = async (label: string, rpc: string, params: Record<string, unknown>) => {
    setLoading(label);
    setMsg(null);
    const { data, error } = await supabase.rpc(rpc, params);
    setLoading(null);
    setMsg({ text: error ? error.message : String(data ?? 'OK'), ok: !error });
  };

  const grupoBase = `TORNEO_${torneo_id}`;

  const actions = [
    {
      label: 'Sortear Grupos y Fixture',
      rpc: 'sortear_grupos_y_fixture_torneo',
      params: { p_torneo_id: torneo_id, p_categoria: categoria, p_grupo_base: grupoBase },
      color: 'bg-blue-600',
    },
    {
      label: 'Iniciar Torneo (En Curso)',
      rpc: 'iniciar_torneo_en_curso',
      params: { p_torneo_id: torneo_id, p_categoria: categoria, p_grupo_base: grupoBase },
      color: 'bg-emerald-600',
    },
    {
      label: 'Generar Cruces Playoffs',
      rpc: 'generar_playoffs_eliminacion_directa_torneo',
      params: { p_torneo_id: torneo_id, p_categoria: categoria, p_grupo_base: grupoBase },
      color: 'bg-violet-600',
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold px-1">Acciones de torneo</p>
      {msg && (
        <p className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.text}
        </p>
      )}
      {actions.map(a => (
        <button
          key={a.label}
          onClick={() => run(a.label, a.rpc, a.params)}
          disabled={loading !== null}
          className={`w-full ${a.color} text-white rounded-xl py-3 px-4 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {loading === a.label ? 'Procesando...' : a.label}
        </button>
      ))}
      <p className="text-xs text-slate-400 text-center pt-2">
        Torneo ID: {torneo_id} · Categoría: {categoria || '—'}
      </p>
    </div>
  );
};

export default AdminPanel;
