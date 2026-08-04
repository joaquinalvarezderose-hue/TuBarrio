import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { Skeleton } from '../../components/Skeleton';
import { useGolfMapaUrl } from '../../hooks/useGolfMapaUrl';
import { useBurstLocation } from '../../hooks/useBurstLocation';
import HoleMap from '../../components/golf/HoleMap';

type Hoyo = {
  id: number;
  numero_hoyo: number;
  par: number;
  yardas: number | null;
  indice_dificultad: number;
  mapa_url: string | null;
  tee_lat: number | null;
  tee_lng: number | null;
  green_lat: number | null;
  green_lng: number | null;
  categoria_dificultad: string | null;
  estrategia_sugerida: string | null;
};

const CATEGORIA_STYLES: Record<string, string> = {
  OPORTUNIDAD: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  INTERMEDIO: 'bg-amber-50 text-amber-700 border-amber-200',
  EXIGENTE: 'bg-orange-50 text-orange-700 border-orange-200',
  'MUY EXIGENTE': 'bg-red-50 text-red-700 border-red-200',
};

const CATEGORIA_ICONS: Record<string, string> = {
  OPORTUNIDAD: 'check_circle',
  INTERMEDIO: 'warning',
  EXIGENTE: 'warning',
  'MUY EXIGENTE': 'error',
};

type MiRonda = {
  id: string;
  numero_ronda: number;
  flight_numero: number | null;
  cancha_id: number;
  estado: string;
};

type RondaOption = {
  id: string;
  jugador_id: string;
  nombre_completo: string;
  handicap: number | null;
};

type ScorecardRow = {
  id: string;
  hoyo_id: number;
  golpes_brutos: number | null;
  golpes_netos: number | null;
  estado: string;
  cargado_por: string | null;
};

type TarjetaPendiente = {
  ronda_id: string;
  nombre_completo: string;
  hoyos_cargados: number;
  golpes_brutos_total: number;
  golpes_netos_total: number;
};

const calcularNetosPreview = (brutos: number, handicap: number | null, indice: number): number => {
  const hcp = Math.round(handicap || 0);
  const base = Math.floor(hcp / 18);
  const extra = indice <= hcp - base * 18 ? 1 : 0;
  return brutos - (base + extra);
};

const GolfScorecard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const tournament = location.state?.tournament;

  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [misRondas, setMisRondas] = useState<MiRonda[]>([]);
  const [numeroRondaSel, setNumeroRondaSel] = useState<number | null>(null);
  const [hoyos, setHoyos] = useState<Hoyo[]>([]);
  const [rondaOptions, setRondaOptions] = useState<RondaOption[]>([]);
  const [selectedRondaId, setSelectedRondaId] = useState<string>('');
  const [scorecardByHoyo, setScorecardByHoyo] = useState<Record<number, ScorecardRow>>({});
  const [pendientes, setPendientes] = useState<TarjetaPendiente[]>([]);
  const [holeIdx, setHoleIdx] = useState(0);
  const [golpesInput, setGolpesInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mapaFullscreen, setMapaFullscreen] = useState(false);
  const burstLocation = useBurstLocation();

  useEffect(() => {
    (async () => {
      let { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.user) authData = { user: refreshed.user } as typeof authData;
      }
      setCurrentUserId(authData?.user?.id || '');
    })();
  }, []);

  const loadAll = useCallback(async () => {
    if (!tournament?.id || !currentUserId) return;
    setLoading(true);

    const { data: misRondasData } = await supabase
      .from('rondas_golf')
      .select('id, numero_ronda, flight_numero, cancha_id, estado')
      .eq('torneo_id', tournament.id)
      .eq('jugador_id', currentUserId)
      .order('numero_ronda', { ascending: true });

    const rondas = (misRondasData || []) as MiRonda[];
    setMisRondas(rondas);

    if (rondas.length === 0) {
      setRondaOptions([]);
      setHoyos([]);
      setPendientes([]);
      setLoading(false);
      return;
    }

    const rondaActiva = rondas.find((r) => r.numero_ronda === numeroRondaSel) || rondas[rondas.length - 1];
    if (numeroRondaSel === null) setNumeroRondaSel(rondaActiva.numero_ronda);

    const [{ data: flightRondas }, { data: hoyosData }] = await Promise.all([
      rondaActiva.flight_numero != null
        ? supabase
            .from('rondas_golf')
            .select('id, jugador_id, perfiles:jugador_id(nombre_completo, handicap)')
            .eq('torneo_id', tournament.id)
            .eq('numero_ronda', rondaActiva.numero_ronda)
            .eq('flight_numero', rondaActiva.flight_numero)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from('hoyos')
        .select('id, numero_hoyo, par, yardas, indice_dificultad, mapa_url, tee_lat, tee_lng, green_lat, green_lng, categoria_dificultad, estrategia_sugerida')
        .eq('cancha_id', rondaActiva.cancha_id)
        .order('numero_hoyo', { ascending: true }),
    ]);

    const options: RondaOption[] = (flightRondas || []).map((r: any) => {
      const perfil = Array.isArray(r.perfiles) ? r.perfiles[0] : r.perfiles;
      return {
        id: r.id,
        jugador_id: r.jugador_id,
        nombre_completo: perfil?.nombre_completo || 'Jugador',
        handicap: perfil?.handicap ?? null,
      };
    });

    setRondaOptions(options);
    setHoyos((hoyosData || []) as Hoyo[]);
    setSelectedRondaId((prev) => (options.some((o) => o.id === prev) ? prev : rondaActiva.id));

    const totalHoyos = (hoyosData || []).length;
    const companerosIds = options.filter((o) => o.jugador_id !== currentUserId).map((o) => o.id);

    if (companerosIds.length > 0) {
      const { data: scorecardData } = await supabase
        .from('scorecard')
        .select('ronda_id, golpes_brutos, golpes_netos')
        .in('ronda_id', companerosIds);

      const porRonda: Record<string, { cargados: number; brutos: number; netos: number }> = {};
      (scorecardData || []).forEach((s: any) => {
        const acc = porRonda[s.ronda_id] || { cargados: 0, brutos: 0, netos: 0 };
        if (s.golpes_brutos != null) {
          acc.cargados += 1;
          acc.brutos += s.golpes_brutos;
          acc.netos += s.golpes_netos ?? 0;
        }
        porRonda[s.ronda_id] = acc;
      });

      setPendientes(
        options
          .filter((o) => o.jugador_id !== currentUserId)
          .map((o) => ({
            ronda_id: o.id,
            nombre_completo: o.nombre_completo,
            hoyos_cargados: porRonda[o.id]?.cargados || 0,
            golpes_brutos_total: porRonda[o.id]?.brutos || 0,
            golpes_netos_total: porRonda[o.id]?.netos || 0,
          }))
          .filter((p) => totalHoyos > 0 && p.hoyos_cargados >= totalHoyos)
      );
    } else {
      setPendientes([]);
    }

    setLoading(false);
  }, [tournament?.id, currentUserId, numeroRondaSel]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!selectedRondaId) return;
    (async () => {
      const { data } = await supabase
        .from('scorecard')
        .select('id, hoyo_id, golpes_brutos, golpes_netos, estado, cargado_por')
        .eq('ronda_id', selectedRondaId);
      const map: Record<number, ScorecardRow> = {};
      (data || []).forEach((r: any) => { map[r.hoyo_id] = r; });
      setScorecardByHoyo(map);
    })();
  }, [selectedRondaId]);

  const rondaActiva = misRondas.find((r) => r.numero_ronda === numeroRondaSel);
  const selectedRonda = rondaOptions.find((r) => r.id === selectedRondaId);
  const hoyoActual = hoyos[holeIdx];
  const scorecardActual = hoyoActual ? scorecardByHoyo[hoyoActual.id] : undefined;
  const { url: mapaUrl } = useGolfMapaUrl(hoyoActual?.mapa_url);
  const tieneCoordsMapa =
    hoyoActual?.tee_lat != null && hoyoActual?.tee_lng != null && hoyoActual?.green_lat != null && hoyoActual?.green_lng != null;

  useEffect(() => {
    setGolpesInput(scorecardActual?.golpes_brutos ? String(scorecardActual.golpes_brutos) : '');
  }, [holeIdx, selectedRondaId, scorecardActual?.golpes_brutos]);

  useEffect(() => {
    burstLocation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holeIdx]);

  // Solo mientras el mapa a pantalla completa esta abierto (que es donde
  // vive el boton "Actualizar mi posición") mantenemos el chip GPS
  // "precalentado" en segundo plano, para que el primer burst arranque de
  // un fix ya afinado en vez de un cold start. Atarlo a esta ventana en vez
  // de a toda la vista del hoyo evita tener el GPS de alta precision
  // prendido durante la ronda entera (consume bateria en serio).
  useEffect(() => {
    if (!mapaFullscreen || !tieneCoordsMapa) return;

    // No confiamos en que el browser suspenda el watch solo por su cuenta
    // al bloquear pantalla (el comportamiento varia entre iOS/Android y no
    // esta garantizado): cortamos el GPS a mano cuando la pagina deja de
    // estar visible y lo retomamos si vuelve a estar visible con el mapa
    // todavia abierto.
    const syncWarmupToVisibility = () => {
      if (document.visibilityState === 'visible') burstLocation.startWarmup();
      else burstLocation.stopWarmup();
    };

    syncWarmupToVisibility();
    document.addEventListener('visibilitychange', syncWarmupToVisibility);
    return () => {
      document.removeEventListener('visibilitychange', syncWarmupToVisibility);
      burstLocation.stopWarmup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapaFullscreen, tieneCoordsMapa]);

  const netoPreview = useMemo(() => {
    if (!hoyoActual || !golpesInput) return null;
    const brutos = Number(golpesInput);
    if (!Number.isFinite(brutos) || brutos <= 0) return null;
    return calcularNetosPreview(brutos, selectedRonda?.handicap ?? null, hoyoActual.indice_dificultad);
  }, [golpesInput, hoyoActual, selectedRonda]);

  const incrementarGolpes = () => setGolpesInput((prev) => String((Number(prev) || 0) + 1));
  const decrementarGolpes = () =>
    setGolpesInput((prev) => {
      const v = Number(prev) || 0;
      return v > 1 ? String(v - 1) : prev;
    });

  const handleSubmitHoyo = async () => {
    if (!hoyoActual || !selectedRondaId) return;
    const brutos = Number(golpesInput);
    if (!Number.isFinite(brutos) || brutos <= 0) {
      setErrorMsg('Ingresa un numero de golpes valido.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setMessage(null);
    try {
      const { error } = await supabase.rpc('cargar_hoyo_scorecard', {
        p_ronda_id: selectedRondaId,
        p_hoyo_id: hoyoActual.id,
        p_golpes_brutos: brutos,
      });
      if (error) throw error;
      setMessage(`Hoyo ${hoyoActual.numero_hoyo} cargado.`);
      const { data } = await supabase
        .from('scorecard')
        .select('id, hoyo_id, golpes_brutos, golpes_netos, estado, cargado_por')
        .eq('ronda_id', selectedRondaId);
      const map: Record<number, ScorecardRow> = {};
      (data || []).forEach((r: any) => { map[r.hoyo_id] = r; });
      setScorecardByHoyo(map);
      await loadAll();
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo cargar el hoyo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmarTarjeta = async (rondaId: string, accion: 'confirmar' | 'rechazar') => {
    setErrorMsg(null);
    setMessage(null);
    try {
      const { error } = await supabase.rpc('confirmar_scorecard_ronda', {
        p_ronda_id: rondaId,
        p_accion: accion,
      });
      if (error) throw error;
      setMessage(accion === 'confirmar' ? 'Tarjeta confirmada.' : 'Tarjeta rechazada, debera cargarse de nuevo.');
      await loadAll();
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo procesar la confirmacion.');
    }
  };

  if (!tournament) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background-light p-6 text-center">
        <p className="text-slate-500">No encontramos el torneo seleccionado.</p>
        <button onClick={() => navigate('/tournaments')} className="mt-4 text-[#4a9c40] font-bold">Volver</button>
      </div>
    );
  }

  return (
    <div className="bg-background-light min-h-screen font-display pb-16 max-w-md mx-auto">
      <header className="sticky top-0 z-50 bg-background-light/80 backdrop-blur-md border-b border-gray-200 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center rounded-full hover:bg-black/5 text-[#111813] transition-colors">
          <span className="material-symbols-outlined">arrow_back_ios</span>
        </button>
        <h1 className="text-lg font-bold text-[#111813] flex-1">Scorecard</h1>
        <button
          onClick={() => navigate('/golf/tarjeta-completa', { state: { tournament } })}
          className="size-10 flex items-center justify-center rounded-full hover:bg-black/5 text-[#111813] transition-colors"
          aria-label="Ver tarjeta completa"
        >
          <span className="material-symbols-outlined">table_chart</span>
        </button>
      </header>

      <div className="p-4 space-y-5">
        {loading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : misRondas.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-center text-sm text-slate-500">
            Todavia no fuiste sorteado en ningun flight de este torneo.
          </div>
        ) : (
          <>
            {errorMsg && <div className="rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm px-3 py-2 font-medium">{errorMsg}</div>}
            {message && <div className="rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm px-3 py-2 font-medium">{message}</div>}

            {misRondas.length > 1 && (
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Ronda</label>
                <select
                  value={numeroRondaSel ?? ''}
                  onChange={(e) => setNumeroRondaSel(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
                >
                  {misRondas.map((r) => (
                    <option key={r.numero_ronda} value={r.numero_ronda}>Ronda {r.numero_ronda}</option>
                  ))}
                </select>
              </div>
            )}

            {rondaActiva?.estado === 'finalizada' && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-2">
                Tu tarjeta de esta ronda ya fue confirmada.
              </div>
            )}

            {rondaOptions.length > 1 && (
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Cargando la tarjeta de</label>
                <select
                  value={selectedRondaId}
                  onChange={(e) => setSelectedRondaId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
                >
                  {rondaOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.jugador_id === currentUserId ? `${r.nombre_completo} (vos)` : r.nombre_completo}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {hoyoActual && (
              <div className="space-y-4">
                {/* Titulo del hoyo + badge de dificultad */}
                <div>
                  <h2 className="font-display text-4xl font-extrabold text-[#111813] leading-tight">Hoyo {hoyoActual.numero_hoyo}</h2>
                  {hoyoActual.categoria_dificultad && (
                    <span
                      className={`inline-flex items-center gap-1 mt-2 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wide ${
                        CATEGORIA_STYLES[hoyoActual.categoria_dificultad] || 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {CATEGORIA_ICONS[hoyoActual.categoria_dificultad] || 'flag'}
                      </span>
                      Dificultad: {hoyoActual.categoria_dificultad}
                    </span>
                  )}
                </div>

                {/* Par / Indice / Yardas */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Par</p>
                    <p className="text-2xl font-extrabold text-[#111813] tabular-nums">{hoyoActual.par}</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Indice</p>
                    <p className="text-2xl font-extrabold text-[#111813] tabular-nums">{hoyoActual.indice_dificultad}</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Yardas</p>
                    <p className="text-2xl font-extrabold text-[#111813] tabular-nums">{hoyoActual.yardas ?? '—'}</p>
                  </div>
                </div>

                {/* Estrategia sugerida */}
                {hoyoActual.estrategia_sugerida && (
                  <div className="bg-[#4a9c40]/5 border border-[#4a9c40]/20 rounded-2xl p-4 flex gap-3">
                    <span className="material-symbols-outlined text-[#4a9c40] mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>
                      tips_and_updates
                    </span>
                    <div>
                      <p className="font-display font-bold text-[#111813] mb-1">Estrategia</p>
                      <p className="text-sm text-slate-600 leading-relaxed">{hoyoActual.estrategia_sugerida}</p>
                    </div>
                  </div>
                )}

                {/* Carga de golpes */}
                {scorecardActual?.estado === 'confirmado' ? (
                  <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 text-center">
                    <span className="material-symbols-outlined text-emerald-600 mb-1 text-2xl">check_circle</span>
                    <p className="font-bold text-emerald-800">Confirmado</p>
                    <p className="text-sm text-emerald-700">{scorecardActual.golpes_brutos} brutos · {scorecardActual.golpes_netos} netos</p>
                  </div>
                ) : (
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                    {scorecardActual?.estado === 'pendiente' && (
                      <p className="text-xs text-center text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mb-4">
                        Cargado. Falta confirmar la tarjeta completa.
                      </p>
                    )}
                    <label className="block text-center text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-5">Ingresar golpes</label>
                    <div className="flex items-center justify-center gap-6 mb-6">
                      <button
                        onClick={decrementarGolpes}
                        className="w-14 h-14 shrink-0 rounded-full border-2 border-slate-200 flex items-center justify-center hover:bg-slate-50 active:scale-90 transition-all"
                        aria-label="Restar golpe"
                      >
                        <span className="material-symbols-outlined text-2xl">remove</span>
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={golpesInput}
                        onChange={(e) => setGolpesInput(e.target.value)}
                        placeholder="—"
                        className="w-24 text-center text-5xl font-black border-none focus:ring-0 text-[#111813] placeholder-slate-200 tabular-nums bg-transparent"
                      />
                      <button
                        onClick={incrementarGolpes}
                        className="w-14 h-14 shrink-0 rounded-full border-2 border-slate-200 flex items-center justify-center hover:bg-slate-50 active:scale-90 transition-all"
                        aria-label="Sumar golpe"
                      >
                        <span className="material-symbols-outlined text-2xl">add</span>
                      </button>
                    </div>
                    {netoPreview !== null && (
                      <p className="text-center text-xs text-slate-500 mb-4">Neto estimado: <span className="font-bold text-slate-800">{netoPreview}</span></p>
                    )}
                    <button
                      onClick={handleSubmitHoyo}
                      disabled={submitting}
                      className="w-full py-4 bg-[#4a9c40] hover:bg-[#3d8b33] disabled:opacity-50 text-white font-display font-bold rounded-2xl shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined">save</span>
                      Guardar
                    </button>
                  </div>
                )}

                {/* Mapa del hoyo */}
                <div className="relative rounded-3xl overflow-hidden border border-slate-100 shadow-sm bg-slate-100 aspect-[390/506]">
                  {tieneCoordsMapa ? (
                    <>
                      {/* Mientras esta abierta la pantalla completa no se monta este mapa:
                          Leaflet no soporta 2 instancias vivas superpuestas sin pisarse
                          (paneles con z-index propio compitiendo entre las dos). */}
                      {!mapaFullscreen && (
                        <HoleMap
                          teeLat={hoyoActual.tee_lat as number}
                          teeLng={hoyoActual.tee_lng as number}
                          greenLat={hoyoActual.green_lat as number}
                          greenLng={hoyoActual.green_lng as number}
                          par={hoyoActual.par}
                          yardas={hoyoActual.yardas}
                          indice={hoyoActual.indice_dificultad}
                          userPosition={burstLocation.position}
                          className="h-full w-full"
                          compact
                        />
                      )}
                      <div className="absolute top-3 left-3 z-20 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-2 shadow-sm pointer-events-none">
                        <span className="w-2 h-2 rounded-full bg-[#4a9c40]" />
                        <span className="text-[10px] font-bold uppercase tracking-wide text-[#111813]">Vista del hoyo</span>
                      </div>
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-32px)] flex items-center gap-2">
                        <button
                          onClick={() => burstLocation.request()}
                          disabled={burstLocation.status === 'loading'}
                          className="flex-1 py-3 bg-white/90 backdrop-blur-md shadow-sm text-[#111813] rounded-xl font-display font-semibold text-sm hover:bg-white transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                        >
                          <span className={`material-symbols-outlined text-lg ${burstLocation.status === 'loading' ? 'animate-spin' : ''}`}>
                            {burstLocation.status === 'loading' ? 'sync' : 'my_location'}
                          </span>
                          {burstLocation.status === 'loading' ? 'Ubicando...' : 'Actualizar mi posición'}
                        </button>
                        <button
                          onClick={() => setMapaFullscreen(true)}
                          aria-label="Pantalla completa"
                          className="flex-none p-3 bg-white/90 backdrop-blur-md shadow-sm text-[#111813] rounded-xl hover:bg-white transition-all flex items-center justify-center"
                        >
                          <span className="material-symbols-outlined text-lg">fullscreen</span>
                        </button>
                      </div>
                    </>
                  ) : hoyoActual.mapa_url ? (
                    <>
                      <img
                        src={mapaUrl ?? hoyoActual.mapa_url}
                        alt={`Mapa del hoyo ${hoyoActual.numero_hoyo}`}
                        className="h-full w-full object-contain"
                      />
                      <div className="absolute top-3 right-3 flex flex-col gap-2 pointer-events-none">
                        <div className="flex flex-col items-center bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 shadow-sm">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Par</p>
                          <p className="text-lg font-extrabold tabular-nums text-[#111813]">{hoyoActual.par}</p>
                        </div>
                        <div className="flex flex-col items-center bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 shadow-sm">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Índice</p>
                          <p className="text-lg font-extrabold tabular-nums text-[#111813]">{hoyoActual.indice_dificultad}</p>
                        </div>
                        <div className="flex flex-col items-center bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 shadow-sm">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Yardas</p>
                          <p className="text-lg font-extrabold tabular-nums text-[#111813]">{hoyoActual.yardas ?? '—'}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setMapaFullscreen(true)}
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-32px)] py-3 bg-white/90 backdrop-blur-md shadow-sm text-[#111813] rounded-xl font-display font-semibold text-sm hover:bg-white transition-all flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-lg">fullscreen</span>
                        Pantalla completa
                      </button>
                    </>
                  ) : (
                    <div className="h-full w-full flex flex-col items-center justify-center gap-1.5 p-3 text-center">
                      <span className="material-symbols-outlined text-[#4a9c40] text-4xl">golf_course</span>
                      <p className="text-xs text-slate-500">Sin mapa disponible</p>
                    </div>
                  )}
                </div>

                {/* Navegacion entre hoyos */}
                <div className="sticky bottom-20 z-30 bg-white rounded-2xl border border-slate-100 shadow-lg px-3 py-2.5 flex items-center justify-between">
                  <button
                    onClick={() => setHoleIdx((i) => Math.max(0, i - 1))}
                    disabled={holeIdx === 0}
                    className="flex flex-col items-center gap-0.5 group disabled:opacity-30"
                    aria-label="Hoyo anterior"
                  >
                    <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-slate-100 group-hover:bg-slate-200 transition-colors">
                      <span className="material-symbols-outlined text-slate-600">chevron_left</span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-tight text-slate-500">Anterior</span>
                  </button>

                  <div className="flex flex-col items-center gap-1.5 px-2">
                    <span className="font-display font-bold text-[#111813] text-sm whitespace-nowrap">Hoyo {holeIdx + 1} de {hoyos.length}</span>
                    <div className="w-24 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full bg-[#4a9c40] rounded-full transition-all"
                        style={{ width: `${((holeIdx + 1) / hoyos.length) * 100}%` }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => setHoleIdx((i) => Math.min(hoyos.length - 1, i + 1))}
                    disabled={holeIdx === hoyos.length - 1}
                    className="flex flex-col items-center gap-0.5 group disabled:opacity-30"
                    aria-label="Hoyo siguiente"
                  >
                    <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-[#4a9c40] text-white group-hover:bg-[#3d8b33] transition-colors">
                      <span className="material-symbols-outlined">chevron_right</span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-tight text-[#4a9c40]">Siguiente</span>
                  </button>
                </div>
              </div>
            )}

            {pendientes.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h2 className="text-sm font-bold uppercase text-slate-500 mb-3">Tarjetas completas de tu flight, pendientes de confirmacion</h2>
                <div className="space-y-2">
                  {pendientes.map((p) => (
                    <div key={p.ronda_id} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <p className="text-sm font-semibold text-slate-800">
                        {p.nombre_completo} · {p.golpes_brutos_total} golpes ({p.golpes_netos_total} netos)
                      </p>
                      <p className="text-xs text-slate-500 mb-2">{p.hoyos_cargados} de {hoyos.length} hoyos cargados</p>
                      <div className="flex gap-2">
                        <button onClick={() => handleConfirmarTarjeta(p.ronda_id, 'confirmar')} className="flex-1 bg-[#4a9c40] hover:bg-[#3d8b33] text-white text-sm font-bold py-2 rounded-lg transition">
                          Confirmar tarjeta
                        </button>
                        <button onClick={() => handleConfirmarTarjeta(p.ronda_id, 'rechazar')} className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-bold py-2 rounded-lg transition">
                          Rechazar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {mapaFullscreen && hoyoActual && (tieneCoordsMapa || mapaUrl) && (
        <div
          className="fixed inset-0 z-[2000] bg-black flex flex-col"
          onClick={() => setMapaFullscreen(false)}
        >
          <button
            onClick={() => setMapaFullscreen(false)}
            className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur-md shadow-sm text-[#111813] rounded-full p-2 hover:bg-white"
            aria-label="Cerrar mapa"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
          {!tieneCoordsMapa && (
            <div
              className="absolute top-16 right-4 z-[1000] flex flex-col gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 shadow-sm">
                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Par</p>
                <p className="text-lg font-extrabold tabular-nums text-[#111813]">{hoyoActual.par}</p>
              </div>
              <div className="flex flex-col items-center bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 shadow-sm">
                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Índice</p>
                <p className="text-lg font-extrabold tabular-nums text-[#111813]">{hoyoActual.indice_dificultad}</p>
              </div>
              <div className="flex flex-col items-center bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 shadow-sm">
                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Yardas</p>
                <p className="text-lg font-extrabold tabular-nums text-[#111813]">{hoyoActual.yardas ?? '—'}</p>
              </div>
            </div>
          )}
          <div className="flex-1 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {tieneCoordsMapa ? (
              <HoleMap
                teeLat={hoyoActual.tee_lat as number}
                teeLng={hoyoActual.tee_lng as number}
                greenLat={hoyoActual.green_lat as number}
                greenLng={hoyoActual.green_lng as number}
                par={hoyoActual.par}
                yardas={hoyoActual.yardas}
                indice={hoyoActual.indice_dificultad}
                userPosition={burstLocation.position}
                className="w-full h-full"
                interactive
              />
            ) : mapaUrl ? (
              <img
                src={mapaUrl}
                alt={`Mapa del hoyo ${hoyoActual.numero_hoyo}`}
                className="max-h-full max-w-full object-contain"
              />
            ) : null}
          </div>

          {tieneCoordsMapa && (
            <div
              className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-2 w-[calc(100%-32px)]"
              onClick={(e) => e.stopPropagation()}
            >
              {burstLocation.status === 'error' && (
                <p className="text-xs font-semibold text-white bg-red-500/90 backdrop-blur-md px-3 py-1.5 rounded-full text-center">
                  {burstLocation.error === 'denied' && 'Permiso de ubicación denegado. Habilitalo en la configuración del navegador.'}
                  {burstLocation.error === 'timeout' && 'No se pudo obtener tu ubicación. Probá de nuevo.'}
                  {burstLocation.error === 'unsupported' && 'Tu navegador no soporta geolocalización.'}
                </p>
              )}
              {burstLocation.status === 'success' && burstLocation.weakSignal && (
                <p className="text-xs font-semibold text-white bg-amber-500/90 backdrop-blur-md px-3 py-1.5 rounded-full text-center">
                  Señal GPS débil, la distancia puede no ser precisa.
                </p>
              )}
              <button
                onClick={() => burstLocation.request()}
                disabled={burstLocation.status === 'loading'}
                className="w-full py-3 bg-white/90 backdrop-blur-md shadow-sm text-[#111813] rounded-xl font-display font-semibold text-sm hover:bg-white transition-all flex items-center justify-center gap-2 disabled:opacity-70"
              >
                <span className={`material-symbols-outlined text-lg ${burstLocation.status === 'loading' ? 'animate-spin' : ''}`}>
                  {burstLocation.status === 'loading' ? 'sync' : 'my_location'}
                </span>
                {burstLocation.status === 'loading' ? 'Ubicando...' : 'Actualizar mi posición'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GolfScorecard;
