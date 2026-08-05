import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { SkeletonTableRow } from '../../components/Skeleton';

type LeaderRow = {
  jugador_id: string;
  nombre_completo: string;
  handicap: number | null;
  hoyos_confirmados: number;
  golpes_brutos_total: number;
  golpes_netos_total: number;
  posicion: number | null;
};

const GolfLeaderboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const tournament = location.state?.tournament;

  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tournament?.id) return;
    const { data, error } = await supabase.rpc('obtener_leaderboard_golf', { p_torneo_id: tournament.id });
    if (error) {
      setErrorMsg(error.message);
    } else {
      setErrorMsg(null);
      setRows((data || []) as LeaderRow[]);
    }
    setLoading(false);
  }, [tournament?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // El polling de 45s es un fallback por si Realtime no esta disponible/conectado.
  // channelStatusRef trackea el estado real del canal para evitar el doble fetch
  // (evento realtime + poll) mientras esta confirmado SUBSCRIBED.
  const channelStatusRef = useRef<string>('CLOSED');

  useEffect(() => {
    if (!tournament?.id) return;
    channelStatusRef.current = 'CLOSED';
    const channel = supabase
      .channel(`golf-leaderboard-${tournament.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scorecard' }, () => load())
      .subscribe((status) => {
        channelStatusRef.current = status;
      });

    const interval = setInterval(() => {
      if (channelStatusRef.current !== 'SUBSCRIBED') load();
    }, 45000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [tournament?.id, load]);

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
        <h1 className="text-lg font-bold text-[#111813]">Tabla de Posiciones</h1>
      </header>

      <div className="p-4">
        {errorMsg && <div className="rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm px-3 py-2 mb-4 font-medium">{errorMsg}</div>}

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase">
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Jugador</th>
                <th className="px-3 py-2 text-center">Thru</th>
                <th className="px-3 py-2 text-center">Bruto</th>
                <th className="px-3 py-2 text-center">Neto</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => <SkeletonTableRow key={i} columns={5} />)
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Todavia no hay jugadores en este torneo.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.jugador_id} className="border-t border-slate-100">
                    <td className="px-3 py-2.5 font-bold text-slate-700">{r.posicion ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-slate-900">{r.nombre_completo}</p>
                      <p className="text-xs text-slate-400">Hcp {r.handicap ?? '—'}</p>
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-600">{r.hoyos_confirmados}/18</td>
                    <td className="px-3 py-2.5 text-center text-slate-600">{r.hoyos_confirmados > 0 ? r.golpes_brutos_total : '—'}</td>
                    <td className="px-3 py-2.5 text-center font-bold text-[#4a9c40]">{r.hoyos_confirmados > 0 ? r.golpes_netos_total : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default GolfLeaderboard;
