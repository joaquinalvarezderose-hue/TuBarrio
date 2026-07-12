import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useCurrentUser } from '../hooks/useCurrentUser';

// ─── Types ────────────────────────────────────────────────────────────────────

type TorneoRow = { id: number; titulo: string; activo: boolean };
type PartidoRow = {
  id: string;
  torneo_id: number;
  categoria: string;
  grupo: string | null;
  jugador1_id: string | null;
  jugador2_id: string | null;
  estado: string;
  created_at: string;
};
type GrupoRow = { id: string; torneo_id: number; nombre: string };
type ServicioClickRow = {
  id: string;
  servicio_id: string;
  user_id: string | null;
  tipo_evento: string;
  clicked_at: string;
};

const TABS = ['Torneos', 'Partidos', 'Grupos', 'Servicios'] as const;
type Tab = typeof TABS[number];

// ─── Component ────────────────────────────────────────────────────────────────

const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const { perfil, loading: userLoading } = useCurrentUser();

  const [tab, setTab] = useState<Tab>('Torneos');
  const [torneos, setTorneos] = useState<TorneoRow[]>([]);
  const [partidos, setPartidos] = useState<PartidoRow[]>([]);
  const [grupos, setGrupos] = useState<GrupoRow[]>([]);
  const [servicioClicks, setServicioClicks] = useState<ServicioClickRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Admin guard
  useEffect(() => {
    if (userLoading) return;
    if (perfil?.rol !== 'admin') {
      navigate('/tournaments', { replace: true });
    }
  }, [userLoading, perfil, navigate]);

  // Load torneos
  const loadTorneos = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('torneos')
        .select('*')
        .order('id', { ascending: false });
      if (error) console.error('[AdminPanel] loadTorneos error:', error);
      setTorneos((data ?? []) as TorneoRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load partidos
  const loadPartidos = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('partidos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) console.error('[AdminPanel] loadPartidos error:', error);
      setPartidos((data ?? []) as PartidoRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load grupos
  const loadGrupos = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('torneo_grupos')
        .select('*')
        .order('torneo_id', { ascending: false });
      if (error) console.error('[AdminPanel] loadGrupos error:', error);
      setGrupos((data ?? []) as GrupoRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load servicio clicks
  const loadServicioClicks = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('servicio_clicks')
        .select('*')
        .order('clicked_at', { ascending: false })
        .limit(100);
      if (error) console.error('[AdminPanel] loadServicioClicks error:', error);
      setServicioClicks((data ?? []) as ServicioClickRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (perfil?.rol !== 'admin') return;
    if (tab === 'Torneos') loadTorneos();
    if (tab === 'Partidos') loadPartidos();
    if (tab === 'Grupos') loadGrupos();
    if (tab === 'Servicios') loadServicioClicks();
  }, [tab, perfil, loadTorneos, loadPartidos, loadGrupos, loadServicioClicks]);

  // Render helpers
  const renderTorneos = () => (
    <div className="space-y-3">
      {loading && <p className="text-sm text-slate-500 text-center py-6">Cargando...</p>}
      {!loading && torneos.length === 0 && (
        <p className="text-center py-10 text-slate-400 text-sm">Sin torneos.</p>
      )}
      {torneos.map(t => (
        <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">{t.titulo}</h3>
              <p className="text-xs text-slate-500">ID: {t.id}</p>
            </div>
            <span className={`px-2 py-1 rounded text-xs font-bold ${t.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
              {t.activo ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );

  const renderPartidos = () => (
    <div className="space-y-3">
      {loading && <p className="text-sm text-slate-500 text-center py-6">Cargando...</p>}
      {!loading && partidos.length === 0 && (
        <p className="text-center py-10 text-slate-400 text-sm">Sin partidos.</p>
      )}
      {partidos.map(p => (
        <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-medium text-slate-900">{p.categoria}</p>
              <p className="text-xs text-slate-500">{p.grupo ? `Grupo: ${p.grupo}` : 'Sin grupo'}</p>
            </div>
            <span className={`px-2 py-1 rounded text-xs font-bold ${p.estado === 'completado' ? 'bg-emerald-100 text-emerald-700' : p.estado === 'pendiente' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-700'}`}>
              {p.estado}
            </span>
          </div>
        </div>
      ))}
    </div>
  );

  const renderGrupos = () => (
    <div className="space-y-3">
      {loading && <p className="text-sm text-slate-500 text-center py-6">Cargando...</p>}
      {!loading && grupos.length === 0 && (
        <p className="text-center py-10 text-slate-400 text-sm">Sin grupos.</p>
      )}
      {grupos.map(g => (
        <div key={g.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <p className="text-sm font-bold text-slate-900">{g.nombre}</p>
            <p className="text-xs text-slate-500">Torneo {g.torneo_id}</p>
          </div>
        </div>
      ))}
    </div>
  );

  const renderServicios = () => (
    <div className="space-y-3">
      {loading && <p className="text-sm text-slate-500 text-center py-6">Cargando...</p>}
      {!loading && servicioClicks.length === 0 && (
        <p className="text-center py-10 text-slate-400 text-sm">Sin eventos.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-200">
              <th className="text-left px-3 py-2">Fecha</th>
              <th className="text-left px-3 py-2">Tipo</th>
              <th className="text-left px-3 py-2">Usuario</th>
            </tr>
          </thead>
          <tbody>
            {servicioClicks.map((c, i) => {
              const fecha = new Date(c.clicked_at);
              const fechaStr = fecha.toLocaleDateString('es-AR');
              const horaStr = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
              return (
                <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="px-3 py-2 text-slate-500 text-xs">{fechaStr} {horaStr}</td>
                  <td className="px-3 py-2 text-slate-800 text-xs">{c.tipo_evento}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{c.user_id?.slice(0, 8) || 'Anónimo'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

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

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-4 flex gap-0 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${tab === t ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 p-4 max-w-2xl w-full mx-auto">
        {tab === 'Torneos' && renderTorneos()}
        {tab === 'Partidos' && renderPartidos()}
        {tab === 'Grupos' && renderGrupos()}
        {tab === 'Servicios' && renderServicios()}
      </div>
    </div>
  );
};

export default AdminPanel;
