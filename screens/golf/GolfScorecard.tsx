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

type PendienteRow = ScorecardRow & {
  numero_hoyo: number;
  ronda_jugador_nombre: string;
  cargado_por_nombre: string;
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
  const [hoyos, setHoyos] = useState<Hoyo[]>([]);
  const [rondaOptions, setRondaOptions] = useState<RondaOption[]>([]);
  const [selectedRondaId, setSelectedRondaId] = useState<string>('');
  const [scorecardByHoyo, setScorecardByHoyo] = useState<Record<number, ScorecardRow>>({});
  const [pendientes, setPendientes] = useState<PendienteRow[]>([]);
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

    const { data: misRondas } = await supabase
      .from('rondas_golf')
      .select('id, cancha_id, fecha, hora_salida')
      .eq('torneo_id', tournament.id)
      .eq('jugador_id', currentUserId)
      .maybeSingle();

    if (!misRondas) {
      setRondaOptions([]);
      setHoyos([]);
      setLoading(false);
      return;
    }

    const [{ data: flightRondas }, { data: hoyosData }] = await Promise.all([
      supabase
        .from('rondas_golf')
        .select('id, jugador_id, perfiles:jugador_id(nombre_completo, handicap)')
        .eq('torneo_id', tournament.id)
        .eq('cancha_id', misRondas.cancha_id)
        .eq('fecha', misRondas.fecha)
        .eq('hora_salida', misRondas.hora_salida),
      supabase
        .from('hoyos')
        .select('id, numero_hoyo, par, yardas, indice_dificultad')
        .eq('cancha_id', misRondas.cancha_id)
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
    setSelectedRondaId((prev) => prev || String(misRondas.id));

    const rondaIds = options.map((o) => o.id);
    const { data: pendientesData } = await supabase
      .from('scorecard')
      .select('id, hoyo_id, golpes_brutos, golpes_netos, estado, cargado_por, ronda_id, rondas_golf:ronda_id(jugador_id, perfiles:jugador_id(nombre_completo)), hoyos:hoyo_id(numero_hoyo)')
      .in('ronda_id', rondaIds.length ? rondaIds : ['00000000-0000-0000-0000-000000000000'])
      .eq('estado', 'pendiente')
      .not('cargado_por', 'is', null)
      .neq('cargado_por', currentUserId);

    const cargadorIds = Array.from(new Set((pendientesData || []).map((r: any) => r.cargado_por).filter(Boolean)));
    let cargadorNombres: Record<string, string> = {};
    if (cargadorIds.length) {
      const { data: perfilesData } = await supabase.from('perfiles').select('id, nombre_completo').in('id', cargadorIds);
      cargadorNombres = Object.fromEntries((perfilesData || []).map((p: any) => [p.id, p.nombre_completo]));
    }

    setPendientes(
      (pendientesData || []).map((r: any) => {
        const rondaJugadorPerfil = Array.isArray(r.rondas_golf?.perfiles) ? r.rondas_golf.perfiles[0] : r.rondas_golf?.perfiles;
        return {
          id: r.id,
          hoyo_id: r.hoyo_id,
          golpes_brutos: r.golpes_brutos,
          golpes_netos: r.golpes_netos,
          estado: r.estado,
          cargado_por: r.cargado_por,
          numero_hoyo: r.hoyos?.numero_hoyo ?? 0,
          ronda_jugador_nombre: rondaJugadorPerfil?.nombre_completo || 'Jugador',
          cargado_por_nombre: cargadorNombres[r.cargado_por] || 'Companero',
        };
      })
    );

    setLoading(false);
  }, [tournament?.id, currentUserId]);

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
      setMessage(`Hoyo ${hoyoActual.numero_hoyo} cargado. Esperando confirmacion de un companero.`);
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

  const handleConfirmar = async (scorecardId: string, accion: 'confirmar' | 'rechazar') => {
    setErrorMsg(null);
    setMessage(null);
    try {
      const { error } = await supabase.rpc('confirmar_hoyo_scorecard', {
        p_scorecard_id: scorecardId,
        p_accion: accion,
      });
      if (error) throw error;
      setMessage(accion === 'confirmar' ? 'Hoyo confirmado.' : 'Hoyo rechazado, debera cargarse de nuevo.');
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
        ) : rondaOptions.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500">
            Todavia no tenes un tee time asignado en este torneo.
          </div>
        ) : (
          <>
            {errorMsg && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{errorMsg}</div>}
            {message && <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-2">{message}</div>}

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
                      {r.id === rondaOptions.find((x) => x.jugador_id === currentUserId)?.id ? `${r.nombre_completo} (vos)` : r.nombre_completo}
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
                        Cargado, esperando confirmacion de un companero de flight.
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
                <h2 className="text-sm font-bold uppercase text-slate-500 mb-3">Pendientes de tu confirmacion</h2>
                <div className="space-y-2">
                  {pendientes.map((p) => (
                    <div key={p.id} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <p className="text-sm font-semibold text-slate-800">
                        Hoyo {p.numero_hoyo} · {p.ronda_jugador_nombre} · {p.golpes_brutos} golpes ({p.golpes_netos} netos)
                      </p>
                      <p className="text-xs text-slate-500 mb-2">Cargado por {p.cargado_por_nombre}</p>
                      <div className="flex gap-2">
                        <button onClick={() => handleConfirmar(p.id, 'confirmar')} className="flex-1 bg-[#4a9c40] hover:bg-[#3d8b33] text-white text-sm font-bold py-2 rounded-lg transition">
                          Confirmar
                        </button>
                        <button onClick={() => handleConfirmar(p.id, 'rechazar')} className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-bold py-2 rounded-lg transition">
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
