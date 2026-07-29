import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useRequireRole } from '../../hooks/useRequireRole';
import { Skeleton } from '../../components/Skeleton';

type CanchaOption = { id: number; nombre: string };

const GolfTorneoForm: React.FC = () => {
  const navigate = useNavigate();
  const { hasAccess, loading } = useRequireRole(['admin', 'organizador']);

  const [canchas, setCanchas] = useState<CanchaOption[]>([]);
  const [loadingCanchas, setLoadingCanchas] = useState(true);

  const [titulo, setTitulo] = useState('');
  const [subtitulo, setSubtitulo] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [imagenUrl, setImagenUrl] = useState('');
  const [aliasPago, setAliasPago] = useState('');
  const [whatsappPago, setWhatsappPago] = useState('');
  const [canchaId, setCanchaId] = useState<string>('');
  const [sistemaHandicap, setSistemaHandicap] = useState('Course Handicap (stroke index por hoyo)');
  const [criterioDesempate, setCriterioDesempate] = useState('Menor score neto total. En caso de empate, countback de los ultimos 9 hoyos.');
  const [reglasTexto, setReglasTexto] = useState('');
  const [cantidadRondas, setCantidadRondas] = useState('1');
  const [tamanoFlight, setTamanoFlight] = useState('4');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!hasAccess) return;
    let cancelled = false;
    (async () => {
      setLoadingCanchas(true);
      const { data, error } = await supabase.from('canchas').select('id, nombre').order('nombre');
      if (cancelled) return;
      if (!error) {
        const rows = (data ?? []) as CanchaOption[];
        setCanchas(rows);
        setCanchaId((prev) => prev || String(rows[0]?.id ?? ''));
      }
      setLoadingCanchas(false);
    })();
    return () => { cancelled = true; };
  }, [hasAccess]);

  const handleSubmit = async () => {
    setErrorMsg(null);
    const v_titulo = titulo.trim();
    if (!v_titulo) {
      setErrorMsg('El titulo es obligatorio.');
      return;
    }
    if (!canchaId) {
      setErrorMsg('Debe seleccionar una cancha.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('crear_torneo_golf', {
        p_titulo: v_titulo,
        p_subtitulo: subtitulo.trim() || null,
        p_fecha_inicio: fechaInicio || null,
        p_fecha_fin: fechaFin || null,
        p_imagen_url: imagenUrl.trim() || null,
        p_alias_pago: aliasPago.trim() || null,
        p_whatsapp_pago: whatsappPago.trim() || null,
        p_cancha_id: Number(canchaId),
        p_sistema_handicap: sistemaHandicap.trim() || null,
        p_criterio_desempate: criterioDesempate.trim() || null,
        p_reglas_texto: reglasTexto.trim() || null,
        p_cantidad_rondas: Number(cantidadRondas) || 1,
        p_tamano_flight: Number(tamanoFlight) || 4,
      });

      if (error) throw error;

      navigate('/organizador', { state: { golfTorneoId: data } });
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo crear el torneo de golf.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-100 p-6 max-w-2xl mx-auto w-full gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (!hasAccess) return null;

  return (
    <div className="bg-background-light min-h-screen font-display pb-24">
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 p-1 rounded-full hover:bg-slate-100">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="font-black text-slate-900 text-lg">Nuevo Torneo de Golf</h1>
      </div>

      <div className="max-w-2xl mx-auto w-full p-4 space-y-4">
        {errorMsg && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{errorMsg}</div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Titulo</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" placeholder="Ej: Abierto de Golf TuBarrio" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Subtitulo</label>
            <input value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" placeholder="Ej: Stroke Play - Categoria Libre" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Fecha inicio</label>
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Fecha fin</label>
              <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Imagen (URL, opcional)</label>
            <input value={imagenUrl} onChange={(e) => setImagenUrl(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" placeholder="/images/tournament-default.jpg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Alias de pago</label>
              <input value={aliasPago} onChange={(e) => setAliasPago(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">WhatsApp de pago</label>
              <input value={whatsappPago} onChange={(e) => setWhatsappPago(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" placeholder="549..." />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Cancha</label>
            {loadingCanchas ? (
              <Skeleton className="h-10 w-full mt-1" />
            ) : (
              <select value={canchaId} onChange={(e) => setCanchaId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1">
                {canchas.length === 0 && <option value="">No hay canchas cargadas</option>}
                {canchas.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h2 className="font-bold text-slate-800">Formato del torneo</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Cantidad de rondas</label>
              <input
                type="number"
                min={1}
                max={10}
                value={cantidadRondas}
                onChange={(e) => setCantidadRondas(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Jugadores por flight</label>
              <input
                type="number"
                min={2}
                max={6}
                value={tamanoFlight}
                onChange={(e) => setTamanoFlight(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">Los flights se sortean al azar entre los inscriptos aprobados; los jugadores coordinan el horario de salida entre ellos.</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h2 className="font-bold text-slate-800">Reglas del torneo</h2>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Sistema de handicap</label>
            <input value={sistemaHandicap} onChange={(e) => setSistemaHandicap(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Criterio de desempate</label>
            <input value={criterioDesempate} onChange={(e) => setCriterioDesempate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Reglamento (texto libre)</label>
            <textarea value={reglasTexto} onChange={(e) => setReglasTexto(e.target.value)} rows={5} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" placeholder="Ej: Se juega stroke play a 18 hoyos. El handicap se toma del perfil de cada jugador..." />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-[#4a9c40] hover:bg-[#3d8b33] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition"
        >
          {submitting ? 'Creando...' : 'Crear torneo de golf'}
        </button>
      </div>
    </div>
  );
};

export default GolfTorneoForm;
