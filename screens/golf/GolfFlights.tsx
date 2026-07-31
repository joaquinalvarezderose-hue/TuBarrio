import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { Skeleton } from '../../components/Skeleton';

type FlightRow = {
  id: string;
  jugador_id: string;
  nombre_completo: string;
  flight_numero: number | null;
  estado: string;
};

const GolfFlights: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const tournament = location.state?.tournament;

  const [cantidadRondas, setCantidadRondas] = useState(1);
  const [numeroRonda, setNumeroRonda] = useState(1);
  const [aprobadosCount, setAprobadosCount] = useState(0);
  const [flights, setFlights] = useState<FlightRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    if (!tournament?.id) return;
    setLoadingData(true);

    const [{ data: config }, { count }, { data: rondas }] = await Promise.all([
      supabase.from('torneo_golf_config').select('cantidad_rondas').eq('torneo_id', tournament.id).maybeSingle(),
      supabase
        .from('inscripciones_torneo')
        .select('perfil_id', { count: 'exact', head: true })
        .eq('torneo_id', tournament.id)
        .eq('estado', 'pagado_aprobado'),
      supabase
        .from('rondas_golf')
        .select('id, jugador_id, flight_numero, estado, perfiles:jugador_id(nombre_completo)')
        .eq('torneo_id', tournament.id)
        .eq('numero_ronda', numeroRonda)
        .order('flight_numero', { ascending: true }),
    ]);

    setCantidadRondas(Number((config as any)?.cantidad_rondas ?? 1));
    setAprobadosCount(count ?? 0);
    setFlights(
      (rondas || []).map((r: any) => ({
        id: r.id,
        jugador_id: r.jugador_id,
        nombre_completo: (Array.isArray(r.perfiles) ? r.perfiles[0] : r.perfiles)?.nombre_completo || 'Jugador',
        flight_numero: r.flight_numero,
        estado: r.estado,
      }))
    );
    setLoadingData(false);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id, numeroRonda]);

  const flightsAgrupados = useMemo(() => {
    const groups: Record<string, FlightRow[]> = {};
    flights.forEach((f) => {
      const key = String(f.flight_numero ?? 0);
      groups[key] = groups[key] || [];
      groups[key].push(f);
    });
    return Object.entries(groups).sort(([a], [b]) => Number(a) - Number(b));
  }, [flights]);

  const handleSortear = async () => {
    setErrorMsg(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('sortear_flights_golf', {
        p_torneo_id: tournament.id,
        p_numero_ronda: numeroRonda,
      });
      if (error) throw error;
      const resultado = Array.isArray(data) ? data[0] : data;
      setMessage(`Se sortearon ${resultado?.flights_creados ?? 0} flight(s) con ${resultado?.jugadores_sorteados ?? 0} jugador(es).`);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo sortear los flights.');
    } finally {
      setSubmitting(false);
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
    <div className="bg-background-light min-h-screen font-display pb-16">
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 p-1 rounded-full hover:bg-slate-100">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="font-black text-slate-900 text-lg">Flights — {tournament.title}</h1>
      </div>

      <div className="max-w-2xl mx-auto w-full p-4 space-y-5">
        {loadingData ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (
          <>
            {errorMsg && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{errorMsg}</div>}
            {message && <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-2">{message}</div>}

            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h2 className="font-bold text-slate-800">Sortear flights</h2>
              <p className="text-sm text-slate-500">
                {aprobadosCount} inscripto(s) con pago aprobado. El sorteo los agrupa al azar en flights; el horario de salida lo coordinan los jugadores entre ellos.
              </p>

              {cantidadRondas > 1 && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Ronda</label>
                  <select
                    value={numeroRonda}
                    onChange={(e) => setNumeroRonda(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
                  >
                    {Array.from({ length: cantidadRondas }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>Ronda {n}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={handleSortear}
                disabled={submitting || aprobadosCount < 1}
                className="w-full bg-[#4a9c40] hover:bg-[#3d8b33] disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition"
              >
                {submitting ? 'Sorteando...' : flights.length > 0 ? 'Re-sortear flights' : 'Sortear flights'}
              </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="font-bold text-slate-800 mb-3">Flights de la ronda {numeroRonda}</h2>
              {flightsAgrupados.length === 0 ? (
                <p className="text-sm text-slate-500">Todavia no se sortearon flights para esta ronda.</p>
              ) : (
                <div className="space-y-3">
                  {flightsAgrupados.map(([flightNum, rows]) => (
                    <div key={flightNum} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <p className="text-sm font-bold text-slate-800">Flight {flightNum}</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {rows.map((r) => (
                          <span key={r.id} className="text-xs bg-white border border-slate-200 rounded-full px-2.5 py-1 text-slate-700">
                            {r.nombre_completo}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default GolfFlights;
