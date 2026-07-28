import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { Skeleton } from '../../components/Skeleton';

type Hoyo = {
  id: number;
  numero_hoyo: number;
  par: number;
  yardas: number | null;
  indice_dificultad: number;
  mapa_url: string | null;
};

const GolfHoleInfo: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const tournament = location.state?.tournament;

  const [loading, setLoading] = useState(true);
  const [hoyos, setHoyos] = useState<Hoyo[]>([]);
  const [holeIdx, setHoleIdx] = useState(0);
  const [canchaNombre, setCanchaNombre] = useState<string | null>(null);

  useEffect(() => {
    if (!tournament?.id) return;
    (async () => {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) {
        setLoading(false);
        return;
      }

      const { data: ronda } = await supabase
        .from('rondas_golf')
        .select('cancha_id, canchas(nombre)')
        .eq('torneo_id', tournament.id)
        .eq('jugador_id', userId)
        .maybeSingle();

      if (!ronda) {
        setLoading(false);
        return;
      }

      const canchaRaw = (ronda as any).canchas;
      setCanchaNombre(Array.isArray(canchaRaw) ? canchaRaw[0]?.nombre ?? null : canchaRaw?.nombre ?? null);

      const { data: hoyosData } = await supabase
        .from('hoyos')
        .select('id, numero_hoyo, par, yardas, indice_dificultad, mapa_url')
        .eq('cancha_id', ronda.cancha_id)
        .order('numero_hoyo', { ascending: true });

      const listaHoyos = (hoyosData || []) as Hoyo[];
      setHoyos(listaHoyos);

      // Buscar el primer hoyo sin score confirmado, para arrancar ahi.
      const { data: scorecardData } = await supabase
        .from('scorecard')
        .select('hoyo_id, estado')
        .in('hoyo_id', listaHoyos.map((h) => h.id));

      const confirmados = new Set((scorecardData || []).filter((s: any) => s.estado === 'confirmado').map((s: any) => s.hoyo_id));
      const idxSiguiente = listaHoyos.findIndex((h) => !confirmados.has(h.id));
      setHoleIdx(idxSiguiente >= 0 ? idxSiguiente : 0);

      setLoading(false);
    })();
  }, [tournament?.id]);

  const hoyo = hoyos[holeIdx];

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
        <h1 className="font-black text-slate-900 text-lg">Info del Hoyo</h1>
      </div>

      <div className="p-4">
        {loading ? (
          <Skeleton className="h-72 w-full rounded-2xl" />
        ) : !hoyo ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500">
            Todavia no tenes un tee time asignado en este torneo.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {hoyo.mapa_url ? (
              <div className="h-56 w-full bg-slate-100 bg-cover bg-center" style={{ backgroundImage: `url("${hoyo.mapa_url}")` }} />
            ) : (
              <div className="h-40 w-full bg-[#4a9c40]/10 flex flex-col items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[#4a9c40] text-5xl">golf_course</span>
                <p className="text-xs text-slate-500">Sin imagen del hoyo disponible</p>
              </div>
            )}

            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setHoleIdx((i) => Math.max(0, i - 1))}
                  disabled={holeIdx === 0}
                  className="p-2 rounded-full bg-slate-100 disabled:opacity-40"
                >
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <div className="text-center">
                  <p className="text-3xl font-black text-[#111813]">Hoyo {hoyo.numero_hoyo}</p>
                  {canchaNombre && <p className="text-xs text-slate-500">{canchaNombre}</p>}
                </div>
                <button
                  onClick={() => setHoleIdx((i) => Math.min(hoyos.length - 1, i + 1))}
                  disabled={holeIdx === hoyos.length - 1}
                  className="p-2 rounded-full bg-slate-100 disabled:opacity-40"
                >
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-xs font-bold text-slate-400 uppercase">Par</p>
                  <p className="text-2xl font-black text-slate-900">{hoyo.par}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-xs font-bold text-slate-400 uppercase">Yardas</p>
                  <p className="text-2xl font-black text-slate-900">{hoyo.yardas ?? '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-xs font-bold text-slate-400 uppercase">Indice</p>
                  <p className="text-2xl font-black text-slate-900">{hoyo.indice_dificultad}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GolfHoleInfo;
