import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useRequireRole } from '../../hooks/useRequireRole';
import { Skeleton } from '../../components/Skeleton';
import { useGolfMapaUrl } from '../../hooks/useGolfMapaUrl';

type HoyoInput = {
  numero_hoyo: number;
  par: number;
  yardas: string;
  indice_dificultad: string;
  categoria_dificultad: string;
  estrategia_sugerida: string;
};

const CATEGORIAS_DIFICULTAD = ['', 'OPORTUNIDAD', 'INTERMEDIO', 'EXIGENTE', 'MUY EXIGENTE'] as const;

type CanchaRow = {
  id: number;
  nombre: string;
  ubicacion: string | null;
  cantidad_hoyos: number;
};

type HoyoMapaRow = {
  id: number;
  numero_hoyo: number;
  par: number;
  mapa_url: string | null;
  tee_lat: number | null;
  tee_lng: number | null;
  green_lat: number | null;
  green_lng: number | null;
  green_front_lat: number | null;
  green_front_lng: number | null;
  green_back_lat: number | null;
  green_back_lng: number | null;
  categoria_dificultad: string | null;
  estrategia_sugerida: string | null;
};

type CoordsSaved = Pick<
  HoyoMapaRow,
  'tee_lat' | 'tee_lng' | 'green_lat' | 'green_lng' | 'green_front_lat' | 'green_front_lng' | 'green_back_lat' | 'green_back_lng'
>;

const ALLOWED_MIME_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg'];
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB, igual al limite del bucket

const emptyHoyos = (cantidad: number): HoyoInput[] =>
  Array.from({ length: cantidad }, (_, i) => ({
    numero_hoyo: i + 1,
    par: 4,
    yardas: '',
    indice_dificultad: '',
    categoria_dificultad: '',
    estrategia_sugerida: '',
  }));

const CoordsField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
}> = ({ label, value, onChange }) => (
  <div>
    <label className="text-[10px] font-bold text-slate-400 uppercase">{label}</label>
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-slate-200 rounded-md px-2 py-1 text-sm mt-0.5"
    />
  </div>
);

const HoyoMapaFila: React.FC<{
  hoyo: HoyoMapaRow;
  canchaId: number;
  onUploaded: (hoyoId: number, path: string) => void;
  onCoordsSaved: (hoyoId: number, coords: CoordsSaved) => void;
  onGuiaSaved: (hoyoId: number, categoria: string | null, estrategia: string | null) => void;
}> = ({ hoyo, canchaId, onUploaded, onCoordsSaved, onGuiaSaved }) => {
  const { url: previewUrl, loading: previewLoading } = useGolfMapaUrl(hoyo.mapa_url);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [guiaAbierta, setGuiaAbierta] = useState(false);
  const [categoria, setCategoria] = useState(hoyo.categoria_dificultad || '');
  const [estrategia, setEstrategia] = useState(hoyo.estrategia_sugerida || '');
  const [savingGuia, setSavingGuia] = useState(false);
  const [guiaError, setGuiaError] = useState<string | null>(null);
  const [guiaMessage, setGuiaMessage] = useState<string | null>(null);

  const handleSaveGuia = async () => {
    setGuiaError(null);
    setGuiaMessage(null);
    setSavingGuia(true);
    try {
      const { error: updateError } = await supabase
        .from('hoyos')
        .update({ categoria_dificultad: categoria || null, estrategia_sugerida: estrategia.trim() || null })
        .eq('id', hoyo.id);
      if (updateError) throw updateError;
      onGuiaSaved(hoyo.id, categoria || null, estrategia.trim() || null);
      setGuiaMessage('Guia del hoyo guardada.');
    } catch (err: any) {
      setGuiaError(err?.message || 'No se pudo guardar la guia del hoyo.');
    } finally {
      setSavingGuia(false);
    }
  };

  const [coordsAbierto, setCoordsAbierto] = useState(false);
  const [teeLat, setTeeLat] = useState(hoyo.tee_lat != null ? String(hoyo.tee_lat) : '');
  const [teeLng, setTeeLng] = useState(hoyo.tee_lng != null ? String(hoyo.tee_lng) : '');
  const [greenLat, setGreenLat] = useState(hoyo.green_lat != null ? String(hoyo.green_lat) : '');
  const [greenLng, setGreenLng] = useState(hoyo.green_lng != null ? String(hoyo.green_lng) : '');
  const [greenFrontLat, setGreenFrontLat] = useState(hoyo.green_front_lat != null ? String(hoyo.green_front_lat) : '');
  const [greenFrontLng, setGreenFrontLng] = useState(hoyo.green_front_lng != null ? String(hoyo.green_front_lng) : '');
  const [greenBackLat, setGreenBackLat] = useState(hoyo.green_back_lat != null ? String(hoyo.green_back_lat) : '');
  const [greenBackLng, setGreenBackLng] = useState(hoyo.green_back_lng != null ? String(hoyo.green_back_lng) : '');
  const [savingCoords, setSavingCoords] = useState(false);
  const [coordsError, setCoordsError] = useState<string | null>(null);
  const [coordsMessage, setCoordsMessage] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError('Formato no soportado. Usa SVG, PNG o JPG.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('El archivo supera los 2 MB permitidos.');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'svg';
      const path = `${canchaId}/${hoyo.id}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('golf-mapas')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('hoyos')
        .update({ mapa_url: path })
        .eq('id', hoyo.id);
      if (updateError) throw updateError;

      onUploaded(hoyo.id, path);
    } catch (err: any) {
      setError(err?.message || 'No se pudo subir el mapa.');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveCoords = async () => {
    setCoordsError(null);
    setCoordsMessage(null);
    const parsed: CoordsSaved = {
      tee_lat: teeLat.trim() === '' ? null : Number(teeLat),
      tee_lng: teeLng.trim() === '' ? null : Number(teeLng),
      green_lat: greenLat.trim() === '' ? null : Number(greenLat),
      green_lng: greenLng.trim() === '' ? null : Number(greenLng),
      green_front_lat: greenFrontLat.trim() === '' ? null : Number(greenFrontLat),
      green_front_lng: greenFrontLng.trim() === '' ? null : Number(greenFrontLng),
      green_back_lat: greenBackLat.trim() === '' ? null : Number(greenBackLat),
      green_back_lng: greenBackLng.trim() === '' ? null : Number(greenBackLng),
    };
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== null && Number.isNaN(value)) {
        setCoordsError(`Coordenada invalida en "${key}".`);
        return;
      }
    }

    setSavingCoords(true);
    try {
      const { error: updateError } = await supabase.from('hoyos').update(parsed).eq('id', hoyo.id);
      if (updateError) throw updateError;
      onCoordsSaved(hoyo.id, parsed);
      setCoordsMessage('Coordenadas guardadas.');
    } catch (err: any) {
      setCoordsError(err?.message || 'No se pudieron guardar las coordenadas.');
    } finally {
      setSavingCoords(false);
    }
  };

  return (
    <div className="bg-slate-50 rounded-lg border border-slate-100">
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="w-14 h-14 rounded-md bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
          {previewLoading ? (
            <Skeleton className="w-full h-full" />
          ) : previewUrl ? (
            <img src={previewUrl} alt={`Mapa hoyo ${hoyo.numero_hoyo}`} className="w-full h-full object-contain" />
          ) : (
            <span className="material-symbols-outlined text-slate-300">image</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 text-sm">Hoyo {hoyo.numero_hoyo} · Par {hoyo.par}</p>
          <label className="mt-1 inline-block text-xs font-bold text-[#4a9c40] cursor-pointer">
            {uploading ? 'Subiendo...' : hoyo.mapa_url ? 'Reemplazar mapa' : 'Subir mapa'}
            <input
              type="file"
              accept=".svg,.png,.jpg,.jpeg,image/svg+xml,image/png,image/jpeg"
              className="hidden"
              disabled={uploading}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
        <button
          onClick={() => setGuiaAbierta((v) => !v)}
          className="text-xs font-bold text-slate-600 px-2 py-1 rounded-md hover:bg-slate-200 shrink-0"
        >
          {guiaAbierta ? 'Cerrar' : 'Guia del hoyo'}
        </button>
        <button
          onClick={() => setCoordsAbierto((v) => !v)}
          className="text-xs font-bold text-slate-600 px-2 py-1 rounded-md hover:bg-slate-200 shrink-0"
        >
          {coordsAbierto ? 'Cerrar' : 'Coordenadas'}
        </button>
      </div>

      {guiaAbierta && (
        <div className="px-3 pb-3 border-t border-slate-200 pt-3 space-y-2">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase">Categoria de dificultad</label>
            <select
              value={categoria}
              onChange={(e) => { setCategoria(e.target.value); setGuiaMessage(null); }}
              className="w-full border border-slate-200 rounded-md px-2 py-1 text-sm mt-0.5"
            >
              {CATEGORIAS_DIFICULTAD.map((c) => (
                <option key={c} value={c}>{c || 'Sin categoria'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase">Estrategia sugerida</label>
            <textarea
              value={estrategia}
              onChange={(e) => { setEstrategia(e.target.value); setGuiaMessage(null); }}
              rows={3}
              placeholder="Ej: Par 4 largo y exigente. Priorizá una salida al centro de la calle..."
              className="w-full border border-slate-200 rounded-md px-2 py-1 text-sm mt-0.5"
            />
          </div>
          {guiaError && <p className="text-xs text-red-600">{guiaError}</p>}
          {guiaMessage && <p className="text-xs text-emerald-700">{guiaMessage}</p>}
          <button
            onClick={handleSaveGuia}
            disabled={savingGuia}
            className="w-full bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-sm transition"
          >
            {savingGuia ? 'Guardando...' : 'Guardar guia'}
          </button>
        </div>
      )}

      {coordsAbierto && (
        <div className="px-3 pb-3 border-t border-slate-200 pt-3">
          <p className="text-xs text-slate-500 mb-2">
            Latitud/longitud reales del tee y el green (ej. sacadas de Google Maps). Tee + Green (centro) habilitan el
            mapa satelital interactivo del hoyo; si se dejan vacias, se muestra el mapa estatico subido arriba. Frente
            y fondo del green son opcionales: si se cargan, el jugador ve las 3 distancias (frente/centro/fondo) en
            vez de una sola.
          </p>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <p className="col-span-2 text-[11px] font-bold text-slate-400 uppercase">Tee</p>
            <CoordsField label="Latitud" value={teeLat} onChange={setTeeLat} />
            <CoordsField label="Longitud" value={teeLng} onChange={setTeeLng} />

            <p className="col-span-2 text-[11px] font-bold text-slate-400 uppercase mt-1">Green (centro)</p>
            <CoordsField label="Latitud" value={greenLat} onChange={setGreenLat} />
            <CoordsField label="Longitud" value={greenLng} onChange={setGreenLng} />

            <p className="col-span-2 text-[11px] font-bold text-slate-400 uppercase mt-1">Green (frente) · opcional</p>
            <CoordsField label="Latitud" value={greenFrontLat} onChange={setGreenFrontLat} />
            <CoordsField label="Longitud" value={greenFrontLng} onChange={setGreenFrontLng} />

            <p className="col-span-2 text-[11px] font-bold text-slate-400 uppercase mt-1">Green (fondo) · opcional</p>
            <CoordsField label="Latitud" value={greenBackLat} onChange={setGreenBackLat} />
            <CoordsField label="Longitud" value={greenBackLng} onChange={setGreenBackLng} />
          </div>

          {coordsError && <p className="text-xs text-red-600 mb-2">{coordsError}</p>}
          {coordsMessage && <p className="text-xs text-emerald-700 mb-2">{coordsMessage}</p>}

          <button
            onClick={handleSaveCoords}
            disabled={savingCoords}
            className="w-full bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-sm transition"
          >
            {savingCoords ? 'Guardando...' : 'Guardar coordenadas'}
          </button>
        </div>
      )}
    </div>
  );
};

const GolfCanchaForm: React.FC = () => {
  const navigate = useNavigate();
  const { hasAccess, loading } = useRequireRole(['admin']);

  const [canchas, setCanchas] = useState<CanchaRow[]>([]);
  const [loadingCanchas, setLoadingCanchas] = useState(true);

  const [selectedCanchaId, setSelectedCanchaId] = useState<number | null>(null);
  const [hoyosMapas, setHoyosMapas] = useState<HoyoMapaRow[]>([]);
  const [loadingHoyosMapas, setLoadingHoyosMapas] = useState(false);

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

  const toggleSelectCancha = (canchaId: number) => {
    setSelectedCanchaId((prev) => (prev === canchaId ? null : canchaId));
  };

  useEffect(() => {
    if (!selectedCanchaId) {
      setHoyosMapas([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingHoyosMapas(true);
      const { data, error } = await supabase
        .from('hoyos')
        .select('id, numero_hoyo, par, mapa_url, tee_lat, tee_lng, green_lat, green_lng, green_front_lat, green_front_lng, green_back_lat, green_back_lng, categoria_dificultad, estrategia_sugerida')
        .eq('cancha_id', selectedCanchaId)
        .order('numero_hoyo', { ascending: true });
      if (cancelled) return;
      if (!error) setHoyosMapas((data ?? []) as HoyoMapaRow[]);
      setLoadingHoyosMapas(false);
    })();
    return () => { cancelled = true; };
  }, [selectedCanchaId]);

  const handleHoyoMapaUploaded = (hoyoId: number, path: string) => {
    setHoyosMapas((prev) => prev.map((h) => (h.id === hoyoId ? { ...h, mapa_url: path } : h)));
  };

  const handleHoyoCoordsSaved = (hoyoId: number, coords: CoordsSaved) => {
    setHoyosMapas((prev) => prev.map((h) => (h.id === hoyoId ? { ...h, ...coords } : h)));
  };

  const handleHoyoGuiaSaved = (hoyoId: number, categoria: string | null, estrategia: string | null) => {
    setHoyosMapas((prev) =>
      prev.map((h) => (h.id === hoyoId ? { ...h, categoria_dificultad: categoria, estrategia_sugerida: estrategia } : h))
    );
  };

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
        categoria_dificultad: h.categoria_dificultad || null,
        estrategia_sugerida: h.estrategia_sugerida.trim() || null,
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
                <div key={c.id} className="bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex items-center justify-between px-3 py-2">
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{c.nombre}</p>
                      <p className="text-xs text-slate-500">{c.ubicacion || 'Sin ubicacion'} · {c.cantidad_hoyos} hoyos</p>
                    </div>
                    <button
                      onClick={() => toggleSelectCancha(c.id)}
                      className="text-xs font-bold text-[#4a9c40] px-2 py-1 rounded-md hover:bg-emerald-50"
                    >
                      {selectedCanchaId === c.id ? 'Cerrar' : 'Mapas de hoyo'}
                    </button>
                  </div>

                  {selectedCanchaId === c.id && (
                    <div className="px-3 pb-3 space-y-2">
                      {loadingHoyosMapas ? (
                        <Skeleton className="h-12 w-full" />
                      ) : (
                        hoyosMapas.map((h) => (
                          <HoyoMapaFila
                            key={h.id}
                            hoyo={h}
                            canchaId={c.id}
                            onUploaded={handleHoyoMapaUploaded}
                            onCoordsSaved={handleHoyoCoordsSaved}
                            onGuiaSaved={handleHoyoGuiaSaved}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alta de cancha */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-bold text-slate-800 mb-1">Nueva cancha</h2>
          <p className="text-xs text-slate-500 mb-3">
            Los mapas de cada hoyo se suben despues de crear la cancha, desde "Mapas de hoyo" en la lista de arriba.
          </p>

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
                  <th className="py-2 pr-2">Categoria</th>
                  <th className="py-2 pr-2">Estrategia sugerida</th>
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
                      <select
                        value={h.categoria_dificultad}
                        onChange={(e) => updateHoyo(idx, 'categoria_dificultad', e.target.value)}
                        className="border border-slate-200 rounded-md px-2 py-1"
                      >
                        {CATEGORIAS_DIFICULTAD.map((c) => (
                          <option key={c} value={c}>{c || 'Sin categoria'}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="text"
                        value={h.estrategia_sugerida}
                        onChange={(e) => updateHoyo(idx, 'estrategia_sugerida', e.target.value)}
                        placeholder="Opcional"
                        className="w-56 border border-slate-200 rounded-md px-2 py-1"
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
