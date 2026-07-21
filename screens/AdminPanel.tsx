import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { supabase } from '../services/supabaseClient';
import { TournamentPreviewScope } from '../types/tournamentPreview';
import { Skeleton } from '../components/Skeleton';

type TorneoOption = { id: number; titulo: string };
type GrupoOption = { torneo_id: number; categoria: string; grupo: string };
type RankingRow = {
  categoria: string;
  perfil_id: string;
  nombre_completo: string | null;
  partidos_jugados: number;
  victorias: number;
  derrotas: number;
  puntos: number;
  posicion: number;
};

const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const { perfil, loading, authUser } = useCurrentUser();

  const [torneos, setTorneos] = useState<TorneoOption[]>([]);
  const [gruposPosiciones, setGruposPosiciones] = useState<GrupoOption[]>([]);
  const [activeTorneo, setActiveTorneo] = useState<number | null>(null);
  const [activeCategoria, setActiveCategoria] = useState<string>('');
  const [previewGrupo, setPreviewGrupo] = useState<string>('');

  const [rankingRows, setRankingRows] = useState<RankingRow[]>([]);
  const [rankingLoading, setRankingLoading] = useState(true);
  const [rankingCategoriaActiva, setRankingCategoriaActiva] = useState<string>('');

  // Redirect to login once we know for sure there's no server-verified session
  useEffect(() => {
    if (!loading && !authUser) {
      navigate('/login', { replace: true });
    }
  }, [loading, authUser, navigate]);

  // Redirect non-admins away once the profile is known
  useEffect(() => {
    if (!loading && perfil && perfil.rol !== 'admin') {
      navigate('/tournaments', { replace: true });
    }
  }, [loading, perfil, navigate]);

  // Load tournaments for the preview selector
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
        console.error('[AdminPanel] load torneos error:', error);
        return;
      }
      const rows = (data ?? []) as TorneoOption[];
      setTorneos(rows);
      setActiveTorneo((prev) => prev ?? rows[0]?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, [perfil]);

  // Load groups/categories for the selected tournament from the pre-flattened admin view
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
        console.error('[AdminPanel] load grupos error:', error);
        return;
      }
      setGruposPosiciones((data ?? []) as GrupoOption[]);
    })();
    return () => { cancelled = true; };
  }, [perfil, activeTorneo]);

  // Load the global cross-tournament ranking by category (once, independent of the preview selector above)
  useEffect(() => {
    if (perfil?.rol !== 'admin') return;
    let cancelled = false;
    (async () => {
      setRankingLoading(true);
      const { data, error } = await supabase
        .from('ranking_categorias_view')
        .select('*')
        .order('categoria', { ascending: true })
        .order('posicion', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('[AdminPanel] load ranking error:', error);
        setRankingLoading(false);
        return;
      }
      const rows = (data ?? []) as RankingRow[];
      setRankingRows(rows);
      const cats = Array.from(new Set(rows.map((r) => r.categoria))).filter(Boolean);
      setRankingCategoriaActiva((prev) => (prev && cats.includes(prev) ? prev : cats[0] ?? ''));
      setRankingLoading(false);
    })();
    return () => { cancelled = true; };
  }, [perfil]);

  const rankingCategorias = [...new Set(rankingRows.map((r) => r.categoria))].sort();
  const rankingRowsActivos = rankingRows.filter((r) => r.categoria === rankingCategoriaActiva);

  const categorias = [...new Set(gruposPosiciones.map((g) => g.categoria))].sort();
  const gruposDeCategoria = [...new Set(
    gruposPosiciones.filter((g) => g.categoria === activeCategoria).map((g) => g.grupo)
  )].sort();

  // Keep categoria/grupo selects pointed at a valid option as the data loads/changes
  useEffect(() => {
    if (perfil?.rol !== 'admin') return;
    if (categorias.length > 0 && !categorias.includes(activeCategoria)) {
      setActiveCategoria(categorias[0]);
    }
  }, [perfil, categorias, activeCategoria]);

  useEffect(() => {
    if (perfil?.rol !== 'admin') return;
    if (gruposDeCategoria.length > 0 && !gruposDeCategoria.includes(previewGrupo)) {
      setPreviewGrupo(gruposDeCategoria[0]);
    }
  }, [perfil, gruposDeCategoria, previewGrupo]);

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-100">
        <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-6 w-16 rounded-full ml-auto" />
        </div>
        <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <Skeleton className="h-6 w-56 mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-4 space-y-2">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3.5 w-1/2" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return null;
  }

  if (!perfil) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <p className="text-slate-600 font-semibold mb-2">Error: Perfil no encontrado</p>
          <p className="text-xs text-slate-400">No se pudo cargar tu perfil</p>
        </div>
      </div>
    );
  }

  if (perfil.rol !== 'admin') {
    return null;
  }

  const handlePreviewNavigate = (destino: '/tournament-panel' | '/fixture' | '/standings') => {
    if (!activeTorneo || !previewGrupo) return;
    const torneoTitulo = torneos.find((t) => t.id === activeTorneo)?.titulo || '';
    const tournament = {
      id: activeTorneo,
      title: torneoTitulo,
      subtitle: activeCategoria,
      image: '/images/tournament-default.jpg',
    };
    const previewScope: TournamentPreviewScope = {
      previewMode: true,
      categoria: activeCategoria,
      grupo: previewGrupo,
      adminReturnTo: '/admin',
    };
    navigate(destino, { state: { tournament, previewScope } });
  };

  // ADMIN PANEL - User is admin
  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-500 hover:text-slate-800 text-2xl leading-none"
        >
          ‹
        </button>
        <h1 className="font-black text-slate-900 text-lg uppercase tracking-wide">Panel Admin</h1>
        <span className="ml-auto text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700">
          Admin
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Bienvenido, {perfil.nombre_completo}</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* User Info Card */}
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-600 uppercase mb-3">Tu Información</h3>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-slate-500">Email:</span>{' '}
                  <span className="font-medium text-slate-900">{perfil.email}</span>
                </p>
                <p>
                  <span className="text-slate-500">Rol:</span>{' '}
                  <span className="font-medium text-emerald-700">Admin</span>
                </p>
                <p>
                  <span className="text-slate-500">WhatsApp:</span>{' '}
                  <span className="font-medium text-slate-900">{perfil.whatsapp || '—'}</span>
                </p>
              </div>
            </div>

            {/* System Info Card */}
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-600 uppercase mb-3">Estado del Sistema</h3>
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                  <span>Autenticado</span>
                </p>
                <p className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                  <span>Perfil cargado</span>
                </p>
                <p className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                  <span>Permisos de admin</span>
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-600 uppercase mb-3">Acciones</h3>
            <button
              onClick={() => navigate('/tournaments')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              Ir a Torneos
            </button>
            <button
              onClick={() => navigate('/admin/partidos')}
              className="w-full mt-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              Gestionar Partidos (W.O.)
            </button>
          </div>

          {/* Vista Previa */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-600 uppercase mb-3">Vista Previa</h3>
            <p className="text-xs text-slate-500 mb-3">
              Elegí torneo, categoría y grupo para ver esas pantallas tal como las ve un jugador real (modo lectura).
            </p>

            {torneos.length === 0 ? (
              <p className="text-sm text-slate-400">No hay torneos cargados.</p>
            ) : (
              <div className="space-y-3">
                <select
                  value={activeTorneo ?? ''}
                  onChange={(e) => {
                    setActiveTorneo(Number(e.target.value));
                    setActiveCategoria('');
                    setPreviewGrupo('');
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
                    setPreviewGrupo('');
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
                  value={previewGrupo}
                  onChange={(e) => setPreviewGrupo(e.target.value)}
                  disabled={gruposDeCategoria.length === 0}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-50"
                >
                  {gruposDeCategoria.length === 0 && <option value="">Sin grupos</option>}
                  {gruposDeCategoria.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>

                <div className="space-y-2 pt-1">
                  <button
                    onClick={() => handlePreviewNavigate('/tournament-panel')}
                    disabled={!previewGrupo}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-bold disabled:opacity-50 transition"
                  >
                    Ver Panel del Torneo
                  </button>
                  <button
                    onClick={() => handlePreviewNavigate('/fixture')}
                    disabled={!previewGrupo}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2 text-sm font-bold disabled:opacity-50 transition"
                  >
                    Ver Fixture
                  </button>
                  <button
                    onClick={() => handlePreviewNavigate('/standings')}
                    disabled={!previewGrupo}
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-lg py-2 text-sm font-bold disabled:opacity-50 transition"
                  >
                    Ver Tabla de Posiciones
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Rankings por Categoría */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-600 uppercase mb-3">Rankings por Categoría</h3>

            {rankingLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : rankingCategorias.length === 0 ? (
              <p className="text-sm text-slate-400">Todavía no hay partidos registrados.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {rankingCategorias.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setRankingCategoriaActiva(cat)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                        rankingCategoriaActiva === cat
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[2rem_1fr_2.5rem_2.5rem_2.5rem_3rem] items-center px-3 py-2 bg-slate-50 border-b border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 text-center">#</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Jugador</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 text-center">PJ</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 text-center">V</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 text-center">D</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 text-center">Pts</span>
                  </div>

                  {rankingRowsActivos.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">Sin datos en esta categoría.</p>
                  ) : (
                    rankingRowsActivos.map((row, idx) => (
                      <div
                        key={row.perfil_id}
                        className={`grid grid-cols-[2rem_1fr_2.5rem_2.5rem_2.5rem_3rem] items-center px-3 py-2 text-sm ${
                          idx !== rankingRowsActivos.length - 1 ? 'border-b border-slate-100' : ''
                        }`}
                      >
                        <span className="text-center text-xs font-bold text-slate-500">{row.posicion}</span>
                        <span className="font-medium text-slate-900 truncate pr-2">{row.nombre_completo ?? 'Jugador'}</span>
                        <span className="text-center text-slate-600">{row.partidos_jugados}</span>
                        <span className="text-center text-slate-600">{row.victorias}</span>
                        <span className="text-center text-slate-600">{row.derrotas}</span>
                        <span className="text-center font-bold text-emerald-700">{row.puntos}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Developer Info */}
        <div className="mt-6 bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-600">
          <p className="font-semibold mb-2">🔧 Info para desarrolladores:</p>
          <p>Perfil ID: {perfil.id}</p>
          <p>Auth User ID: {authUser?.id}</p>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
