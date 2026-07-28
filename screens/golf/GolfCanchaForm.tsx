import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useRequireRole } from '../../hooks/useRequireRole';
import { Skeleton } from '../../components/Skeleton';

type HoyoInput = {
  numero_hoyo: number;
  par: number;
  yardas: string;
  indice_dificultad: string;
  mapa_url: string;
};

type CanchaRow = {
  id: number;
  nombre: string;
  ubicacion: string | null;
  cantidad_hoyos: number;
};

const emptyHoyos = (cantidad: number): HoyoInput[] =>
  Array.from({ length: cantidad }, (_, i) => ({
    numero_hoyo: i + 1,
    par: 4,
    yardas: '',
    indice_dificultad: '',
    mapa_url: '',
  }));

const GolfCanchaForm: React.FC = () => {
  const navigate = useNavigate();
  const { hasAccess, loading } = useRequireRole(['admin']);

  const [canchas, setCanchas] = useState<CanchaRow[]>([]);
  const [loadingCanchas, setLoadingCanchas] = useState(true);

  const [nombre, setNombre] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [cantidadHoyos, setCantidadHoyos] = useState(18);
  const [hoyos, setHoyos] = useState<HoyoInput[]>(emptyHoyos(18));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!hasAccess) return;
    let cancelled = false;
    (async () => {
      setLoadingCanchas(true);
      const { data, error } = await supabase
        .from('canchas')
        .select('id, nombre, ubicacion, cantidad_hoyos')
        .order('nombre', { ascending: true });
      if (cancelled) return;
      if (!error) setCanchas((data ?? []) as CanchaRow[]);
      setLoadingCanchas(false);
    })();
    return () => { cancelled = true; };
  }, [hasAccess]);

  const updateCantidad = (n: number) => {
    const cantidad = Math.max(1, Math.min(18, n));
    setCantidadHoyos(cantidad);
    setHoyos((prev) => {
      if (cantidad > prev.length) {
        return [...prev, ...emptyHoyos(cantidad - prev.length).map((h, i) => ({ ...h, numero_hoyo: prev.length + i + 1 }))];
      }
      return prev.slice(0, cantidad);
    });
  };

  const updateHoyo = (idx: number, field: keyof HoyoInput, value: string) => {
    setHoyos((prev) => prev.map((h, i) => (i === idx ? { ...h, [field]: field === 'par' ? Number(value) : value } : h)));
  };

  const handleSubmit = async () => {
    setMessage(null);
    setErrorMsg(null);

    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) {
      setErrorMsg('El nombre de la cancha es obligatorio.');
      return;
    }
    for (const h of hoyos) {
      if (!h.indice_dificultad || Number(h.indice_dificultad) < 1 || Number(h.indice_dificultad) > 18) {
        setErrorMsg(`Falta el indice de dificultad del hoyo ${h.numero_hoyo} (debe ser 1-18, unico por cancha).`);
        return;
      }
    }
    const indices = hoyos.map((h) => Number(h.indice_dificultad));
    if (new Set(indices).size !== indices.length) {
      setErrorMsg('Los indices de dificultad no pueden repetirse dentro de la misma cancha.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = hoyos.map((h) => ({
        numero_hoyo: h.numero_hoyo,
        par: h.par,
        yardas: h.yardas ? Number(h.yardas) : null,
        indice_dificultad: Number(h.indice_dificultad),
        mapa_url: h.mapa_url.trim() || null,
      }));

      const { error } = await supabase.rpc('crear_cancha_con_hoyos', {
        p_nombre: nombreLimpio,
        p_ubicacion: ubicacion.trim() || null,
        p_hoyos: payload,
      });

      if (error) throw error;

      setMessage(`Cancha "${nombreLimpio}" creada con ${hoyos.length} hoyos.`);
      setNombre('');
      setUbicacion('');
      updateCantidad(18);
      const { data } = await supabase
        .from('canchas')
        .select('id, nombre, ubicacion, cantidad_hoyos')
        .order('nombre', { ascending: true });
      setCanchas((data ?? []) as CanchaRow[]);
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo crear la cancha.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-100 p-6 max-w-3xl mx-auto w-full gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }
  if (!hasAccess) return null;

  return (
    <div className="bg-background-light min-h-screen font-display pb-16">
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 p-1 rounded-full hover:bg-slate-100">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="font-black text-slate-900 text-lg">Canchas de Golf</h1>
      </div>

      <div className="max-w-3xl mx-auto w-full p-4 space-y-6">
        {/* Canchas existentes */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-bold text-slate-800 mb-3">Canchas cargadas</h2>
          {loadingCanchas ? (
            <Skeleton className="h-16 w-full" />
          ) : canchas.length === 0 ? (
            <p className="text-sm text-slate-500">Todavia no hay canchas cargadas.</p>
          ) : (
            <div className="space-y-2">
              {canchas.map((c) => (
                <div key={c.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{c.nombre}</p>
                    <p className="text-xs text-slate-500">{c.ubicacion || 'Sin ubicacion'} · {c.cantidad_hoyos} hoyos</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alta de cancha */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-bold text-slate-800 mb-3">Nueva cancha</h2>

          {message && (
            <div className="mb-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-2">{message}</div>
          )}
          {errorMsg && (
            <div className="mb-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{errorMsg}</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Nombre</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: El Canton Golf"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Ubicacion</label>
              <input
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
                placeholder="Ej: Belen de Escobar, Buenos Aires"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Cantidad de hoyos</label>
              <input
                type="number"
                min={1}
                max={18}
                value={cantidadHoyos}
                onChange={(e) => updateCantidad(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
          </div>

          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs font-bold text-slate-500 uppercase">
                  <th className="py-2 pr-2">Hoyo</th>
                  <th className="py-2 pr-2">Par</th>
                  <th className="py-2 pr-2">Yardas</th>
                  <th className="py-2 pr-2">Indice</th>
                  <th className="py-2 pr-2">Mapa (URL, opcional)</th>
                </tr>
              </thead>
              <tbody>
                {hoyos.map((h, idx) => (
                  <tr key={h.numero_hoyo} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2 font-semibold text-slate-700">{h.numero_hoyo}</td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        min={3}
                        max={6}
                        value={h.par}
                        onChange={(e) => updateHoyo(idx, 'par', e.target.value)}
                        className="w-16 border border-slate-200 rounded-md px-2 py-1"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        value={h.yardas}
                        onChange={(e) => updateHoyo(idx, 'yardas', e.target.value)}
                        className="w-20 border border-slate-200 rounded-md px-2 py-1"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        min={1}
                        max={18}
                        value={h.indice_dificultad}
                        onChange={(e) => updateHoyo(idx, 'indice_dificultad', e.target.value)}
                        className="w-16 border border-slate-200 rounded-md px-2 py-1"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        value={h.mapa_url}
                        onChange={(e) => updateHoyo(idx, 'mapa_url', e.target.value)}
                        placeholder="https://..."
                        className="w-full min-w-[10rem] border border-slate-200 rounded-md px-2 py-1"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="mt-4 w-full bg-[#4a9c40] hover:bg-[#3d8b33] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition"
          >
            {submitting ? 'Guardando...' : 'Crear cancha'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GolfCanchaForm;
