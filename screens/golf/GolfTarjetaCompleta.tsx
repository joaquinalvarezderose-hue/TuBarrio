import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { Skeleton } from '../../components/Skeleton';

type MiRonda = {
  id: string;
  numero_ronda: number;
  flight_numero: number | null;
  cancha_id: number;
  estado: string;
};

type Hoyo = {
  id: number;
  numero_hoyo: number;
  par: number;
  indice_dificultad: number;
};

type RondaOption = {
  id: string;
  jugador_id: string;
  nombre_completo: string;
  handicap: number | null;
};

type ScorecardRow = {
  hoyo_id: number;
  golpes_brutos: number | null;
  golpes_netos: number | null;
  estado: string;
};

const ESTADO_CELDA_STYLES: Record<string, string> = {
  confirmado: 'bg-emerald-50 text-emerald-800',
  pendiente: 'bg-amber-50 text-amber-800',
};

const GolfTarjetaCompleta: React.FC = () => {
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
        .select('id, numero_hoyo, par, indice_dificultad')
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
        .select('hoyo_id, golpes_brutos, golpes_netos, estado')
        .eq('ronda_id', selectedRondaId);
      const map: Record<number, ScorecardRow> = {};
      (data || []).forEach((r: any) => { map[r.hoyo_id] = r; });
      setScorecardByHoyo(map);
    })();
  }, [selectedRondaId]);

  const selectedRonda = rondaOptions.find((r) => r.id === selectedRondaId);

  const { hoyosCargados, sumaPar, sumaBrutos, sumaNetos } = useMemo(() => {
    let cargados = 0;
    let par = 0;
    let brutos = 0;
    let netos = 0;
    hoyos.forEach((h) => {
      par += h.par;
      const sc = scorecardByHoyo[h.id];
      if (sc?.golpes_brutos != null) {
        cargados += 1;
        brutos += sc.golpes_brutos;
        netos += sc.golpes_netos ?? 0;
      }
    });
    return { hoyosCargados: cargados, sumaPar: par, sumaBrutos: brutos, sumaNetos: netos };
  }, [hoyos, scorecardByHoyo]);

  if (!tournament) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background-light p-6 text-center">
        <p className="text-slate-500">No encontramos el torneo seleccionado.</p>
        <button onClick={() => navigate('/tournaments')} className="mt-4 text-[#4a9c40] font-bold">Volver</button>
      </div>
    );
  }

  return (
    <div className="bg-background-light min-h-screen font-display pb-16 max-w-2xl mx-auto">
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 p-1 rounded-full hover:bg-slate-100">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="font-black text-slate-900 text-lg">Tarjeta completa</h1>
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : misRondas.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500">
            Todavia no fuiste sorteado en ningun flight de este torneo.
          </div>
        ) : (
          <>
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

            {rondaOptions.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {rondaOptions.map((r) => {
                  const activo = r.id === selectedRondaId;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRondaId(r.id)}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-bold border transition ${
                        activo
                          ? 'bg-[#4a9c40] border-[#4a9c40] text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {r.jugador_id === currentUserId ? `${r.nombre_completo} (vos)` : r.nombre_completo}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-bold text-[#111813]">{selectedRonda?.nombre_completo || 'Jugador'}</p>
                  <p className="text-xs text-slate-500">Hcp {selectedRonda?.handicap ?? '—'}</p>
                </div>
                <p className="text-xs font-bold text-slate-500">{hoyosCargados}/{hoyos.length || 18} hoyos cargados</p>
              </div>

              {hoyos.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">Esta cancha todavia no tiene hoyos cargados.</p>
              ) : (
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="border-collapse text-sm">
                    <tbody>
                      <tr>
                        <th className="sticky left-0 z-10 bg-white text-left text-xs font-bold text-slate-500 uppercase pr-3 py-1.5 whitespace-nowrap">Hoyo</th>
                        {hoyos.map((h) => (
                          <td key={h.id} className="px-2 py-1.5 text-center font-bold text-slate-700 w-11">{h.numero_hoyo}</td>
                        ))}
                        <td className="px-2 py-1.5 text-center font-black text-slate-800 w-14 bg-slate-50">Total</td>
                      </tr>
                      <tr className="border-t border-slate-100">
                        <th className="sticky left-0 z-10 bg-white text-left text-xs font-bold text-slate-500 uppercase pr-3 py-1.5 whitespace-nowrap">Par</th>
                        {hoyos.map((h) => (
                          <td key={h.id} className="px-2 py-1.5 text-center text-slate-600">{h.par}</td>
                        ))}
                        <td className="px-2 py-1.5 text-center font-bold text-slate-700 bg-slate-50">{sumaPar}</td>
                      </tr>
                      <tr className="border-t border-slate-100">
                        <th className="sticky left-0 z-10 bg-white text-left text-xs font-bold text-slate-500 uppercase pr-3 py-1.5 whitespace-nowrap">Hcp</th>
                        {hoyos.map((h) => (
                          <td key={h.id} className="px-2 py-1.5 text-center text-slate-600">{h.indice_dificultad}</td>
                        ))}
                        <td className="px-2 py-1.5 text-center bg-slate-50">—</td>
                      </tr>
                      <tr className="border-t border-slate-100">
                        <th className="sticky left-0 z-10 bg-white text-left text-xs font-bold text-slate-500 uppercase pr-3 py-1.5 whitespace-nowrap">Golpes</th>
                        {hoyos.map((h) => {
                          const sc = scorecardByHoyo[h.id];
                          return (
                            <td
                              key={h.id}
                              className={`px-2 py-1.5 text-center font-bold ${sc ? ESTADO_CELDA_STYLES[sc.estado] || '' : 'text-slate-300'}`}
                            >
                              {sc?.golpes_brutos ?? '–'}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-center font-black text-slate-800 bg-slate-50">{sumaBrutos || '–'}</td>
                      </tr>
                      <tr className="border-t border-slate-100">
                        <th className="sticky left-0 z-10 bg-white text-left text-xs font-bold text-slate-500 uppercase pr-3 py-1.5 whitespace-nowrap">Netos</th>
                        {hoyos.map((h) => {
                          const sc = scorecardByHoyo[h.id];
                          return (
                            <td
                              key={h.id}
                              className={`px-2 py-1.5 text-center font-bold ${sc ? ESTADO_CELDA_STYLES[sc.estado] || '' : 'text-slate-300'}`}
                            >
                              {sc?.golpes_brutos != null ? sc.golpes_netos : '–'}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-center font-black text-[#4a9c40] bg-slate-50">{sumaBrutos ? sumaNetos : '–'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Confirmado</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Pendiente</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-200" /> Sin cargar</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default GolfTarjetaCompleta;
