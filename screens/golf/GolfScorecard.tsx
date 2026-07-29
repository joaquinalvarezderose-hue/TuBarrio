import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { Skeleton } from '../../components/Skeleton';

type Hoyo = {
  id: number;
  numero_hoyo: number;
  par: number;
  yardas: number | null;
  indice_dificultad: number;
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
        .select('id, numero_hoyo, par, yardas, indice_dificultad')
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

  useEffect(() => {
    setGolpesInput(scorecardActual?.golpes_brutos ? String(scorecardActual.golpes_brutos) : '');
  }, [holeIdx, selectedRondaId, scorecardActual?.golpes_brutos]);

  const netoPreview = useMemo(() => {
    if (!hoyoActual || !golpesInput) return null;
    const brutos = Number(golpesInput);
    if (!Number.isFinite(brutos) || brutos <= 0) return null;
    return calcularNetosPreview(brutos, selectedRonda?.handicap ?? null, hoyoActual.indice_dificultad);
  }, [golpesInput, hoyoActual, selectedRonda]);

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
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 p-1 rounded-full hover:bg-slate-100">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="font-black text-slate-900 text-lg">Scorecard</h1>
      </div>

      <div className="p-4 space-y-5">
        {loading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : misRondas.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500">
            Todavia no fuiste sorteado en ningun flight de este torneo.
          </div>
        ) : (
          <>
            {errorMsg && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{errorMsg}</div>}
            {message && <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-2">{message}</div>}

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
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => setHoleIdx((i) => Math.max(0, i - 1))}
                    disabled={holeIdx === 0}
                    className="p-2 rounded-full bg-slate-100 disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined">chevron_left</span>
                  </button>
                  <div className="text-center">
                    <p className="text-3xl font-black text-[#111813]">Hoyo {hoyoActual.numero_hoyo}</p>
                    <p className="text-xs text-slate-500">Par {hoyoActual.par} · Indice {hoyoActual.indice_dificultad}{hoyoActual.yardas ? ` · ${hoyoActual.yardas} yd` : ''}</p>
                  </div>
                  <button
                    onClick={() => setHoleIdx((i) => Math.min(hoyos.length - 1, i + 1))}
                    disabled={holeIdx === hoyos.length - 1}
                    className="p-2 rounded-full bg-slate-100 disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined">chevron_right</span>
                  </button>
                </div>

                {scorecardActual?.estado === 'confirmado' ? (
                  <div className="text-center bg-emerald-50 border border-emerald-200 rounded-xl py-4">
                    <span className="material-symbols-outlined text-emerald-600 mb-1">check_circle</span>
                    <p className="font-bold text-emerald-800">Confirmado</p>
                    <p className="text-sm text-emerald-700">{scorecardActual.golpes_brutos} golpes brutos · {scorecardActual.golpes_netos} netos</p>
                  </div>
                ) : (
                  <>
                    {scorecardActual?.estado === 'pendiente' && (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                        Cargado. Cuando esten los 18 hoyos, un companero de flight confirma la tarjeta completa.
                      </p>
                    )}
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={1}
                        value={golpesInput}
                        onChange={(e) => setGolpesInput(e.target.value)}
                        placeholder="Golpes brutos"
                        className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-lg font-bold text-center"
                      />
                      <button
                        onClick={handleSubmitHoyo}
                        disabled={submitting}
                        className="bg-[#4a9c40] hover:bg-[#3d8b33] disabled:opacity-50 text-white font-bold px-5 py-3 rounded-xl transition"
                      >
                        Guardar
                      </button>
                    </div>
                    {netoPreview !== null && (
                      <p className="text-center text-sm text-slate-500 mt-2">Neto estimado: <span className="font-bold text-slate-800">{netoPreview}</span></p>
                    )}
                  </>
                )}
              </div>
            )}

            {pendientes.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
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
    </div>
  );
};

export default GolfScorecard;
