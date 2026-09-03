import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { supabase } from '../services/supabaseClient';
import { useCategoriaGrupoOptions } from '../hooks/useCategoriaGrupoOptions';
import { useRankingCategorias, rankingBucketKey } from '../hooks/useRankingCategorias';
import { TournamentPreviewScope } from '../types/tournamentPreview';
import { Skeleton } from '../components/Skeleton';
import { WhatsAppE164Schema, COUNTRY_CODES, normalizeWhatsApp } from '../lib/schemas';

type TorneoOption = { id: number; titulo: string };
type GrupoOption = { torneo_id: number; categoria: string; grupo: string };
const getGrupoCategoria = (g: GrupoOption) => g.categoria;
const getGrupoGrupo = (g: GrupoOption) => g.grupo;
type UnpairedPlayer = { perfil_id: string; nombre: string; whatsapp: string | null; esPlaceholder: boolean };
type EquipoRow = {
  id: string;
  nombre1: string;
  nombre2: string;
  grupo: string | null;
  jugador1Id: string;
  jugador2Id: string;
  esPlaceholder1: boolean;
  esPlaceholder2: boolean;
};

const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const { perfil, loading, authUser } = useCurrentUser();

  const [torneos, setTorneos] = useState<TorneoOption[]>([]);
  const [gruposPosiciones, setGruposPosiciones] = useState<GrupoOption[]>([]);
  const [activeTorneo, setActiveTorneo] = useState<number | null>(null);
  const [activeCategoria, setActiveCategoria] = useState<string>('');
  const [previewGrupo, setPreviewGrupo] = useState<string>('');

  // Armado de parejas de dobles
  const [activeTorneoModalidad, setActiveTorneoModalidad] = useState<string>('singles');
  const [pairingCategorias, setPairingCategorias] = useState<string[]>([]);
  const [pairingCategoria, setPairingCategoria] = useState<string>('');
  const [unpairedPlayers, setUnpairedPlayers] = useState<UnpairedPlayer[]>([]);
  const [pairedTeams, setPairedTeams] = useState<EquipoRow[]>([]);
  const [selectedPlayer1, setSelectedPlayer1] = useState<string>('');
  const [selectedPlayer2, setSelectedPlayer2] = useState<string>('');
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingMessage, setPairingMessage] = useState<string | null>(null);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingRefreshKey, setPairingRefreshKey] = useState(0);
  const [placeholderNombre, setPlaceholderNombre] = useState('');
  const [placeholderWaDialCode, setPlaceholderWaDialCode] = useState('+549');
  const [placeholderWaLocal, setPlaceholderWaLocal] = useState('');
  const [replacementSelections, setReplacementSelections] = useState<Record<string, string>>({});

  // Gestion de organizadores (asignar/revocar el rol organizador)
  const [orgSearch, setOrgSearch] = useState('');
  const [orgResults, setOrgResults] = useState<{ id: string; nombre_completo: string | null; email: string | null; rol: string | null }[]>([]);
  const [orgSearching, setOrgSearching] = useState(false);
  const [orgFeedback, setOrgFeedback] = useState<string | null>(null);
  const [orgBusyId, setOrgBusyId] = useState<string | null>(null);

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

  // Resuelve la modalidad del torneo seleccionado, para mostrar (o no) el armado de parejas
  useEffect(() => {
    if (perfil?.rol !== 'admin' || !activeTorneo) {
      setActiveTorneoModalidad('singles');
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('torneo_configuracion')
        .select('modalidad')
        .eq('torneo_id', activeTorneo)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error('[AdminPanel] load modalidad error:', error);
        setActiveTorneoModalidad('singles');
        return;
      }
      setActiveTorneoModalidad(data?.modalidad === 'dobles' ? 'dobles' : 'singles');
    })();
    return () => { cancelled = true; };
  }, [perfil, activeTorneo]);

  // Categorias con inscriptos aprobados para el torneo (armado de parejas ocurre antes del sorteo,
  // por eso se lee de inscripciones_torneo y no de v_admin_grupos_posiciones)
  useEffect(() => {
    if (perfil?.rol !== 'admin' || !activeTorneo || activeTorneoModalidad !== 'dobles') {
      setPairingCategorias([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('inscripciones_torneo')
        .select('categoria')
        .eq('torneo_id', activeTorneo)
        .eq('estado', 'pagado_aprobado');
      if (cancelled) return;
      if (error) {
        console.error('[AdminPanel] load categorias inscriptos error:', error);
        return;
      }
      const cats = Array.from(new Set((data ?? []).map((r: any) => String(r.categoria || '').trim()).filter(Boolean))).sort();
      setPairingCategorias(cats);
      setPairingCategoria((prev) => (prev && cats.includes(prev) ? prev : cats[0] ?? ''));
    })();
    return () => { cancelled = true; };
  }, [perfil, activeTorneo, activeTorneoModalidad]);

  // Inscriptos sin pareja + parejas ya formadas, para la categoria seleccionada
  useEffect(() => {
    if (perfil?.rol !== 'admin' || !activeTorneo || activeTorneoModalidad !== 'dobles' || !pairingCategoria) {
      setUnpairedPlayers([]);
      setPairedTeams([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data: inscriptos, error: inscriptosError }, { data: equipos, error: equiposError }] = await Promise.all([
        supabase
          .from('inscripciones_torneo')
          .select('perfil_id')
          .eq('torneo_id', activeTorneo)
          .eq('categoria', pairingCategoria)
          .eq('estado', 'pagado_aprobado'),
        supabase
          .from('torneo_equipos')
          .select('id, jugador1_id, jugador2_id, grupo')
          .eq('torneo_id', activeTorneo)
          .eq('categoria', pairingCategoria),
      ]);
      if (cancelled) return;
      if (inscriptosError || equiposError) {
        console.error('[AdminPanel] load pairing data error:', inscriptosError || equiposError);
        return;
      }

      const equiposRows = equipos ?? [];
      const teamedIds = new Set<string>(equiposRows.flatMap((e: any) => [e.jugador1_id, e.jugador2_id]));
      const inscriptoIds = Array.from(new Set((inscriptos ?? []).map((r: any) => String(r.perfil_id))));
      const allNeededIds = Array.from(new Set([
        ...inscriptoIds,
        ...equiposRows.flatMap((e: any) => [e.jugador1_id, e.jugador2_id]),
      ]));

      let perfiles: any[] = [];
      if (allNeededIds.length > 0) {
        const { data: perfilesData, error: perfilesError } = await supabase
          .from('perfiles')
          .select('id, nombre_completo, whatsapp, es_placeholder')
          .in('id', allNeededIds);
        if (perfilesError) {
          console.error('[AdminPanel] load perfiles pairing error:', perfilesError);
        }
        perfiles = perfilesData ?? [];
      }
      const nameById = Object.fromEntries(perfiles.map((p: any) => [p.id, p.nombre_completo || 'Jugador']));
      const whatsappById = Object.fromEntries(perfiles.map((p: any) => [p.id, p.whatsapp ? String(p.whatsapp) : null]));
      const placeholderById = Object.fromEntries(perfiles.map((p: any) => [p.id, Boolean(p.es_placeholder)]));

      if (cancelled) return;
      setUnpairedPlayers(
        inscriptoIds
          .filter((id) => !teamedIds.has(id))
          .map((id) => ({ perfil_id: id, nombre: nameById[id] || 'Jugador', whatsapp: whatsappById[id] || null, esPlaceholder: Boolean(placeholderById[id]) }))
      );
      setPairedTeams(
        equiposRows.map((e: any) => ({
          id: String(e.id),
          nombre1: nameById[e.jugador1_id] || 'Jugador',
          nombre2: nameById[e.jugador2_id] || 'Jugador',
          grupo: e.grupo ? String(e.grupo) : null,
          jugador1Id: String(e.jugador1_id),
          jugador2Id: String(e.jugador2_id),
          esPlaceholder1: Boolean(placeholderById[e.jugador1_id]),
          esPlaceholder2: Boolean(placeholderById[e.jugador2_id]),
        }))
      );
    })();
    return () => { cancelled = true; };
  }, [perfil, activeTorneo, activeTorneoModalidad, pairingCategoria, pairingRefreshKey]);

  const handleCreateEquipo = async () => {
    if (!activeTorneo || !pairingCategoria || !selectedPlayer1 || !selectedPlayer2) return;
    if (selectedPlayer1 === selectedPlayer2) {
      setPairingError('Elegi dos jugadores distintos.');
      return;
    }
    setPairingLoading(true);
    setPairingError(null);
    setPairingMessage(null);
    try {
      const { error } = await supabase.rpc('crear_equipo_dobles', {
        p_torneo_id: activeTorneo,
        p_categoria: pairingCategoria,
        p_jugador1_id: selectedPlayer1,
        p_jugador2_id: selectedPlayer2,
      });
      if (error) throw error;
      setPairingMessage('Pareja creada correctamente.');
      setSelectedPlayer1('');
      setSelectedPlayer2('');
      setPairingRefreshKey((v) => v + 1);
    } catch (error: any) {
      setPairingError(error?.message || 'No se pudo crear la pareja.');
    } finally {
      setPairingLoading(false);
    }
  };

  const handleDeleteEquipo = async (equipoId: string) => {
    setPairingLoading(true);
    setPairingError(null);
    setPairingMessage(null);
    try {
      const { data, error } = await supabase.rpc('eliminar_equipo_dobles', { p_equipo_id: equipoId });
      if (error) throw error;
      if (data !== 'OK') {
        setPairingError(String(data) || 'No se pudo deshacer la pareja.');
        return;
      }
      setPairingMessage('Pareja deshecha.');
      setPairingRefreshKey((v) => v + 1);
    } catch (error: any) {
      setPairingError(error?.message || 'No se pudo deshacer la pareja.');
    } finally {
      setPairingLoading(false);
    }
  };

  const handleCrearPlaceholder = async () => {
    if (!activeTorneo || !pairingCategoria || !placeholderNombre.trim()) return;
    setPairingError(null);
    setPairingMessage(null);
    const combinedWa = normalizeWhatsApp(placeholderWaDialCode, placeholderWaLocal);
    if (combinedWa) {
      const parsed = WhatsAppE164Schema.safeParse(combinedWa);
      if (!parsed.success) {
        setPairingError(parsed.error.issues[0]?.message ?? 'WhatsApp inválido');
        return;
      }
    }
    setPairingLoading(true);
    try {
      const { error } = await supabase.rpc('admin_crear_jugador_placeholder', {
        p_torneo_id: activeTorneo,
        p_categoria: pairingCategoria,
        p_nombre: placeholderNombre.trim(),
        p_whatsapp: combinedWa || null,
      });
      if (error) throw error;
      setPairingMessage(`"${placeholderNombre.trim()}" agregado sin cuenta. Ya podes emparejarlo.`);
      setPlaceholderNombre('');
      setPlaceholderWaLocal('');
      setPairingRefreshKey((v) => v + 1);
    } catch (error: any) {
      setPairingError(error?.message || 'No se pudo agregar el jugador sin cuenta.');
    } finally {
      setPairingLoading(false);
    }
  };

  const handleReemplazarPlaceholder = async (placeholderPerfilId: string) => {
    const realPerfilId = replacementSelections[placeholderPerfilId];
    if (!realPerfilId) return;
    setPairingLoading(true);
    setPairingError(null);
    setPairingMessage(null);
    try {
      const { data, error } = await supabase.rpc('admin_reemplazar_jugador_placeholder', {
        p_placeholder_perfil_id: placeholderPerfilId,
        p_real_perfil_id: realPerfilId,
      });
      if (error) throw error;
      if (data !== 'OK') {
        setPairingError(String(data) || 'No se pudo reemplazar el jugador.');
        return;
      }
      setPairingMessage('Jugador reemplazado por su cuenta real.');
      setReplacementSelections((prev) => {
        const next = { ...prev };
        delete next[placeholderPerfilId];
        return next;
      });
      setPairingRefreshKey((v) => v + 1);
    } catch (error: any) {
      setPairingError(error?.message || 'No se pudo reemplazar el jugador.');
    } finally {
      setPairingLoading(false);
    }
  };

  // Ranking global cross-torneo por categoria (independiente del selector de preview de arriba).
  const {
    rows: rankingRows,
    buckets: rankingBuckets,
    categoriaActiva: rankingCategoriaActiva,
    setCategoriaActiva: setRankingCategoriaActiva,
    loading: rankingLoading,
  } = useRankingCategorias({ enabled: perfil?.rol === 'admin' });

  const rankingRowsActivos = useMemo(
    () => rankingRows.filter((r) => rankingBucketKey(r) === rankingCategoriaActiva),
    [rankingRows, rankingCategoriaActiva]
  );

  const { categorias, gruposDeCategoria } = useCategoriaGrupoOptions(
    gruposPosiciones,
    getGrupoCategoria,
    getGrupoGrupo,
    activeCategoria
  );

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

  const buscarUsuarios = async () => {
    const term = orgSearch.trim();
    if (!term) {
      setOrgResults([]);
      return;
    }
    setOrgSearching(true);
    setOrgFeedback(null);
    const { data, error } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, email, rol')
      .or(`nombre_completo.ilike.%${term}%,email.ilike.%${term}%`)
      .limit(10);
    setOrgSearching(false);
    if (error) {
      console.error('[AdminPanel] buscarUsuarios error:', error);
      setOrgFeedback('No se pudo buscar usuarios.');
      return;
    }
    setOrgResults((data ?? []) as typeof orgResults);
  };

  const toggleOrganizador = async (perfilId: string, activar: boolean) => {
    setOrgBusyId(perfilId);
    setOrgFeedback(null);
    const { error } = await supabase.rpc('asignar_rol_organizador', {
      p_perfil_id: perfilId,
      p_activar: activar,
    });
    setOrgBusyId(null);
    if (error) {
      setOrgFeedback(`Error: ${error.message}`);
      return;
    }
    setOrgFeedback(activar ? 'Rol organizador asignado.' : 'Rol organizador revocado.');
    setOrgResults((prev) => prev.map((u) => (
      u.id === perfilId ? { ...u, rol: activar ? 'organizador' : 'jugador' } : u
    )));
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
            <button
              onClick={() => navigate('/organizador')}
              className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              Mis Torneos (crear / administrar)
            </button>
            <button
              onClick={() => navigate('/golf/canchas')}
              className="w-full mt-2 bg-[#4a9c40] hover:bg-[#3d8b33] text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              Canchas de Golf (alta de hoyos)
            </button>
          </div>

          {/* Gestion de organizadores */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-600 uppercase mb-1">Organizadores</h3>
            <p className="text-xs text-slate-500 mb-3">
              Un organizador puede crear y administrar sus propios torneos (partidos, sorteos, inscripciones),
              pero no puede designar otros administradores ni tocar torneos ajenos.
            </p>

            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscarUsuarios()}
                placeholder="Buscar por nombre o email"
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={buscarUsuarios}
                disabled={orgSearching}
                className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold px-4 rounded-lg disabled:opacity-50"
              >
                Buscar
              </button>
            </div>

            {orgFeedback && (
              <p className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2 mb-3">
                {orgFeedback}
              </p>
            )}

            {orgResults.length > 0 && (
              <div className="space-y-2">
                {orgResults.map((u) => (
                  <div key={u.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm truncate">{u.nombre_completo || 'Sin nombre'}</p>
                      <p className="text-xs text-slate-500 truncate">{u.email} · rol: {u.rol || 'jugador'}</p>
                    </div>
                    {u.rol === 'admin' ? (
                      <span className="text-xs text-slate-400 shrink-0">admin</span>
                    ) : u.rol === 'organizador' ? (
                      <button
                        onClick={() => toggleOrganizador(u.id, false)}
                        disabled={orgBusyId === u.id}
                        className="shrink-0 text-xs font-bold text-red-600 border border-red-200 rounded-lg px-3 py-2 disabled:opacity-50"
                      >
                        Quitar organizador
                      </button>
                    ) : (
                      <button
                        onClick={() => toggleOrganizador(u.id, true)}
                        disabled={orgBusyId === u.id}
                        className="shrink-0 text-xs font-bold text-white bg-emerald-600 rounded-lg px-3 py-2 disabled:opacity-50"
                      >
                        Hacer organizador
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
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

          {/* Armar Parejas de Dobles */}
          {activeTorneoModalidad === 'dobles' && (
            <div className="mt-6 pt-6 border-t border-slate-200">
              <h3 className="text-sm font-semibold text-slate-600 uppercase mb-3">Armar Parejas de Dobles</h3>

              {pairingCategorias.length === 0 ? (
                <p className="text-sm text-slate-400">No hay inscriptos aprobados todavia para este torneo.</p>
              ) : (
                <div className="space-y-4">
                  <select
                    value={pairingCategoria}
                    onChange={(e) => setPairingCategoria(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    {pairingCategorias.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  {pairingMessage && <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-sm font-medium text-emerald-700">{pairingMessage}</div>}
                  {pairingError && <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm font-medium text-red-700">{pairingError}</div>}

                  <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Agregar jugador sin cuenta
                    </p>
                    <p className="text-xs text-slate-400">
                      Para alguien que no va a crear cuenta propia (o todavia no se registro). Despues se puede reemplazar por su cuenta real.
                    </p>
                    <input
                      type="text"
                      value={placeholderNombre}
                      onChange={(e) => setPlaceholderNombre(e.target.value)}
                      placeholder="Nombre y apellido"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                    />
                    <div className="flex gap-2">
                      <select
                        value={placeholderWaDialCode}
                        onChange={(e) => setPlaceholderWaDialCode(e.target.value)}
                        className="border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white"
                      >
                        {COUNTRY_CODES.map((c) => (
                          <option key={c.code} value={c.code}>{c.label}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={placeholderWaLocal}
                        onChange={(e) => setPlaceholderWaLocal(e.target.value)}
                        placeholder={`WhatsApp opcional, ej: ${COUNTRY_CODES.find((c) => c.code === placeholderWaDialCode)?.placeholder || ''}`}
                        className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                      />
                    </div>
                    <button
                      onClick={handleCrearPlaceholder}
                      disabled={pairingLoading || !placeholderNombre.trim()}
                      className="w-full bg-slate-700 hover:bg-slate-800 text-white font-bold py-2 px-4 rounded-lg transition disabled:opacity-50"
                    >
                      {pairingLoading ? 'Procesando...' : 'Agregar jugador sin cuenta'}
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Crear pareja ({unpairedPlayers.length} sin pareja)
                    </p>
                    <select
                      value={selectedPlayer1}
                      onChange={(e) => setSelectedPlayer1(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      <option value="">Jugador 1...</option>
                      {unpairedPlayers.map((p) => (
                        <option key={p.perfil_id} value={p.perfil_id} disabled={p.perfil_id === selectedPlayer2}>
                          {p.nombre}{p.esPlaceholder ? ' (sin cuenta)' : ''}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedPlayer2}
                      onChange={(e) => setSelectedPlayer2(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      <option value="">Jugador 2...</option>
                      {unpairedPlayers.map((p) => (
                        <option key={p.perfil_id} value={p.perfil_id} disabled={p.perfil_id === selectedPlayer1}>
                          {p.nombre}{p.esPlaceholder ? ' (sin cuenta)' : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleCreateEquipo}
                      disabled={pairingLoading || !selectedPlayer1 || !selectedPlayer2}
                      className="w-full bg-[#4a9c40] hover:bg-[#3d8b33] text-white font-bold py-2 px-4 rounded-lg transition disabled:opacity-50"
                    >
                      {pairingLoading ? 'Procesando...' : 'Crear Pareja'}
                    </button>
                  </div>

                  {pairedTeams.length > 0 && (
                    <div className="border border-slate-200 rounded-lg p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                        Parejas formadas ({pairedTeams.length})
                      </p>
                      <div className="space-y-2">
                        {pairedTeams.map((t) => {
                          const placeholders = [
                            t.esPlaceholder1 ? { id: t.jugador1Id, nombre: t.nombre1 } : null,
                            t.esPlaceholder2 ? { id: t.jugador2Id, nombre: t.nombre2 } : null,
                          ].filter((x): x is { id: string; nombre: string } => x !== null);
                          const realOptions = unpairedPlayers.filter((p) => !p.esPlaceholder);
                          return (
                            <div key={t.id} className="border-b border-slate-100 last:border-0 pb-2 last:pb-0 space-y-2">
                              <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="font-medium text-slate-900">
                                  {t.nombre1}{t.esPlaceholder1 ? ' (sin cuenta)' : ''} / {t.nombre2}{t.esPlaceholder2 ? ' (sin cuenta)' : ''}
                                </span>
                                <button
                                  onClick={() => handleDeleteEquipo(t.id)}
                                  disabled={pairingLoading || Boolean(t.grupo)}
                                  title={t.grupo ? 'Ya paso por el sorteo, no se puede deshacer' : 'Deshacer pareja'}
                                  className="text-xs font-bold text-red-600 hover:text-red-800 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  Deshacer
                                </button>
                              </div>
                              {placeholders.map((ph) => (
                                <div key={ph.id} className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                  <select
                                    value={replacementSelections[ph.id] || ''}
                                    onChange={(e) =>
                                      setReplacementSelections((prev) => ({ ...prev, [ph.id]: e.target.value }))
                                    }
                                    className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                                  >
                                    <option value="">Reemplazar "{ph.nombre}" por...</option>
                                    {realOptions.map((p) => (
                                      <option key={p.perfil_id} value={p.perfil_id}>{p.nombre}</option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => handleReemplazarPlaceholder(ph.id)}
                                    disabled={pairingLoading || !replacementSelections[ph.id]}
                                    className="text-xs font-bold text-amber-700 hover:text-amber-900 disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    Confirmar
                                  </button>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Rankings por Categoría */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-600 uppercase mb-3">Rankings por Categoría</h3>

            {rankingLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : rankingBuckets.length === 0 ? (
              <p className="text-sm text-slate-400">Todavía no hay partidos registrados.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {rankingBuckets.map((b) => (
                    <button
                      key={b.key}
                      onClick={() => setRankingCategoriaActiva(b.key)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors text-left leading-tight ${
                        rankingCategoriaActiva === b.key
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="block">{b.categoria}</span>
                      <span className="block text-[9px] font-semibold opacity-70">{b.generoLabel} · {b.modalidadLabel}</span>
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
                        <div className="flex flex-col items-center justify-center gap-0.5">
                          <span className="text-center text-xs font-bold text-slate-500">{row.posicion}</span>
                          {row.tiebreakerReason && (
                            <span className="text-[8px] font-bold px-1 py-px rounded bg-amber-100 text-amber-700 leading-none whitespace-nowrap">
                              {row.tiebreakerReason}
                            </span>
                          )}
                        </div>
                        <span className="font-medium text-slate-900 truncate pr-2">{row.nombre_completo ?? 'Jugador'}</span>
                        <span className="text-center text-slate-600">{row.partidos_jugados}</span>
                        <span className="text-center text-slate-600">{row.victorias}</span>
                        <span className="text-center text-slate-600">{row.derrotas}</span>
                        <span className="text-center font-bold text-emerald-700">{row.puntos}</span>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Desempate en caso de igualdad de puntos: dif. de sets → sets ganados → resultado directo (H2H) → dif. de games. Mismo criterio que la Tabla de Posiciones.
                </p>
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
