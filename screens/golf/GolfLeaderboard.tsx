import React, { useCallback, useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!tournament?.id) return;
    const channel = supabase
      .channel(`golf-leaderboard-${tournament.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scorecard' }, () => load())
      .subscribe();

    const interval = setInterval(load, 45000);

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
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 p-1 rounded-full hover:bg-slate-100">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="font-black text-slate-900 text-lg">Tabla de Posiciones</h1>
      </div>

      <div className="p-4">
        {errorMsg && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 mb-4">{errorMsg}</div>}

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
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
