import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { Skeleton } from '../../components/Skeleton';

type AprobadoRow = {
  perfil_id: string;
  nombre_completo: string;
};

type FlightRow = {
  id: string;
  jugador_id: string;
  nombre_completo: string;
  cancha_id: number;
  fecha: string;
  hora_salida: string;
  estado: string;
};

const GolfTeeTimes: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const tournament = location.state?.tournament;

  const [canchaId, setCanchaId] = useState<number | null>(null);
  const [aprobados, setAprobados] = useState<AprobadoRow[]>([]);
  const [flights, setFlights] = useState<FlightRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [fecha, setFecha] = useState('');
  const [horaSalida, setHoraSalida] = useState('');
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    if (!tournament?.id) return;
    setLoadingData(true);

    const [{ data: config }, { data: inscripciones }, { data: rondas }] = await Promise.all([
      supabase.from('torneo_golf_config').select('cancha_id').eq('torneo_id', tournament.id).maybeSingle(),
      supabase
        .from('inscripciones_torneo')
        .select('perfil_id, perfiles:perfil_id(nombre_completo)')
        .eq('torneo_id', tournament.id)
        .eq('estado', 'pagado_aprobado'),
      supabase
        .from('rondas_golf')
        .select('id, jugador_id, cancha_id, fecha, hora_salida, estado, perfiles:jugador_id(nombre_completo)')
        .eq('torneo_id', tournament.id)
        .order('fecha', { ascending: true })
        .order('hora_salida', { ascending: true }),
    ]);

    setCanchaId((config as any)?.cancha_id ?? null);
    setAprobados(
      (inscripciones || []).map((r: any) => ({
        perfil_id: r.perfil_id,
        nombre_completo: (Array.isArray(r.perfiles) ? r.perfiles[0] : r.perfiles)?.nombre_completo || 'Jugador',
      }))
    );
    setFlights(
      (rondas || []).map((r: any) => ({
        id: r.id,
        jugador_id: r.jugador_id,
        nombre_completo: (Array.isArray(r.perfiles) ? r.perfiles[0] : r.perfiles)?.nombre_completo || 'Jugador',
        cancha_id: r.cancha_id,
        fecha: r.fecha,
        hora_salida: r.hora_salida,
        estado: r.estado,
      }))
    );
    setLoadingData(false);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id]);

  const asignadosIds = useMemo(() => new Set(flights.map((f) => f.jugador_id)), [flights]);
  const disponibles = aprobados.filter((a) => !seleccionados.includes(a.perfil_id));

  const toggleSeleccionado = (id: string) => {
    setSeleccionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const flightsAgrupados = useMemo(() => {
    const groups: Record<string, FlightRow[]> = {};
    flights.forEach((f) => {
      const key = `${f.fecha}__${f.hora_salida}`;
      groups[key] = groups[key] || [];
      groups[key].push(f);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [flights]);

  const handleSubmit = async () => {
    setErrorMsg(null);
    setMessage(null);

    if (!canchaId) {
      setErrorMsg('Este torneo no tiene una cancha configurada.');
      return;
    }
    if (!fecha || !horaSalida) {
      setErrorMsg('Indica fecha y hora de salida.');
      return;
    }
    if (seleccionados.length === 0) {
      setErrorMsg('Selecciona al menos un jugador.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('asignar_tee_time', {
        p_torneo_id: tournament.id,
        p_cancha_id: canchaId,
        p_fecha: fecha,
        p_hora_salida: horaSalida,
        p_jugador_ids: seleccionados,
      });
      if (error) throw error;
      setMessage(`Tee time asignado a ${seleccionados.length} jugador(es).`);
      setSeleccionados([]);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo asignar el tee time.');
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
        <h1 className="font-black text-slate-900 text-lg">Tee Times — {tournament.title}</h1>
      </div>

      <div className="max-w-2xl mx-auto w-full p-4 space-y-5">
        {loadingData ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (
          <>
            {errorMsg && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{errorMsg}</div>}
            {message && <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-2">{message}</div>}

            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h2 className="font-bold text-slate-800">Nueva salida</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Fecha</label>
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Hora</label>
                  <input type="time" value={horaSalida} onChange={(e) => setHoraSalida(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Jugadores aprobados</label>
                {aprobados.length === 0 ? (
                  <p className="text-sm text-slate-500 mt-1">Todavia no hay inscriptos con pago aprobado.</p>
                ) : (
                  <div className="mt-1 space-y-1 max-h-64 overflow-y-auto">
                    {aprobados.map((a) => (
                      <label key={a.perfil_id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={seleccionados.includes(a.perfil_id)}
                          onChange={() => toggleSeleccionado(a.perfil_id)}
                        />
                        <span className="text-sm font-medium text-slate-800 flex-1">{a.nombre_completo}</span>
                        {asignadosIds.has(a.perfil_id) && (
                          <span className="text-[10px] font-bold uppercase text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Reasignar</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-[#4a9c40] hover:bg-[#3d8b33] disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition"
              >
                {submitting ? 'Asignando...' : 'Asignar tee time'}
              </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="font-bold text-slate-800 mb-3">Salidas programadas</h2>
              {flightsAgrupados.length === 0 ? (
                <p className="text-sm text-slate-500">Todavia no hay tee times asignados.</p>
              ) : (
                <div className="space-y-3">
                  {flightsAgrupados.map(([key, rows]) => (
                    <div key={key} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <p className="text-sm font-bold text-slate-800">{rows[0].fecha} · {rows[0].hora_salida.slice(0, 5)} hs</p>
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

export default GolfTeeTimes;
