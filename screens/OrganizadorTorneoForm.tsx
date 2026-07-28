import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRequireRole } from '../hooks/useRequireRole';
import { supabase } from '../services/supabaseClient';
import { Skeleton } from '../components/Skeleton';

interface FormState {
  titulo: string;
  subtitulo: string;
  fecha_inicio: string;
  fecha_fin: string;
  imagen_url: string;
  modalidad: 'singles' | 'dobles';
  max_participantes_por_grupo: string;
  min_participantes_por_grupo: string;
  numero_grupos: string;
  max_participantes_total: string;
  clasificados_por_grupo: string;
  crear_playoffs_eliminacion_directa: boolean;
  incluir_mejores_terceros: boolean;
  cantidad_mejores_terceros: string;
  precio_expensas: string;
  precio_transferencia: string;
}

const emptyForm: FormState = {
  titulo: '',
  subtitulo: '',
  fecha_inicio: '',
  fecha_fin: '',
  imagen_url: '',
  modalidad: 'singles',
  max_participantes_por_grupo: '4',
  min_participantes_por_grupo: '2',
  numero_grupos: '',
  max_participantes_total: '',
  clasificados_por_grupo: '2',
  crear_playoffs_eliminacion_directa: false,
  incluir_mejores_terceros: false,
  cantidad_mejores_terceros: '',
  precio_expensas: '5000',
  precio_transferencia: '45000',
};

const toIntOrNull = (v: string): number | null => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const toNumberOrNull = (v: string): number | null => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const OrganizadorTorneoForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEditing = !!id && id !== 'nuevo';
  const { perfil, loading, hasAccess } = useRequireRole(['admin', 'organizador']);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [loadingTorneo, setLoadingTorneo] = useState(isEditing);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasAccess || !isEditing || !id) return;
    let cancelled = false;
    (async () => {
      setLoadingTorneo(true);
      const [{ data: torneo, error: tErr }, { data: config, error: cErr }] = await Promise.all([
        supabase.from('torneos').select('*').eq('id', Number(id)).maybeSingle(),
        supabase.from('torneo_configuracion').select('*').eq('torneo_id', Number(id)).maybeSingle(),
      ]);
      if (cancelled) return;
      setLoadingTorneo(false);
      if (tErr || cErr || !torneo) {
        setError('No se pudo cargar el torneo (o no tenes permiso sobre el).');
        return;
      }
      setForm({
        titulo: torneo.titulo ?? '',
        subtitulo: torneo.subtitulo ?? '',
        fecha_inicio: torneo.fecha_inicio ?? '',
        fecha_fin: torneo.fecha_fin ?? '',
        imagen_url: torneo.imagen_url ?? '',
        modalidad: config?.modalidad === 'dobles' ? 'dobles' : 'singles',
        max_participantes_por_grupo: String(config?.max_participantes_por_grupo ?? 4),
        min_participantes_por_grupo: String(config?.min_participantes_por_grupo ?? 2),
        numero_grupos: config?.numero_grupos != null ? String(config.numero_grupos) : '',
        max_participantes_total: config?.max_participantes_total != null ? String(config.max_participantes_total) : '',
        clasificados_por_grupo: String(config?.clasificados_por_grupo ?? 2),
        crear_playoffs_eliminacion_directa: !!config?.crear_playoffs_eliminacion_directa,
        incluir_mejores_terceros: !!config?.incluir_mejores_terceros,
        cantidad_mejores_terceros: config?.cantidad_mejores_terceros != null ? String(config.cantidad_mejores_terceros) : '',
        precio_expensas: torneo.precio_expensas != null ? String(torneo.precio_expensas) : '5000',
        precio_transferencia: torneo.precio_transferencia != null ? String(torneo.precio_transferencia) : '45000',
      });
    })();
    return () => { cancelled = true; };
  }, [hasAccess, isEditing, id]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titulo.trim()) {
      setError('El titulo es obligatorio.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const configParams = {
      p_max_participantes_por_grupo: toIntOrNull(form.max_participantes_por_grupo),
      p_min_participantes_por_grupo: toIntOrNull(form.min_participantes_por_grupo),
      p_numero_grupos: toIntOrNull(form.numero_grupos),
      p_max_participantes_total: toIntOrNull(form.max_participantes_total),
      p_clasificados_por_grupo: toIntOrNull(form.clasificados_por_grupo),
      p_crear_playoffs_eliminacion_directa: form.crear_playoffs_eliminacion_directa,
      p_incluir_mejores_terceros: form.incluir_mejores_terceros,
      p_cantidad_mejores_terceros: toIntOrNull(form.cantidad_mejores_terceros),
      p_precio_expensas: toNumberOrNull(form.precio_expensas),
      p_precio_transferencia: toNumberOrNull(form.precio_transferencia),
    };

    if (isEditing && id) {
      const { error: rpcError } = await supabase.rpc('actualizar_configuracion_torneo', {
        p_torneo_id: Number(id),
        p_titulo: form.titulo,
        p_subtitulo: form.subtitulo,
        p_fecha_inicio: form.fecha_inicio || null,
        p_fecha_fin: form.fecha_fin || null,
        p_imagen_url: form.imagen_url || null,
        ...configParams,
      });
      setSubmitting(false);
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      navigate(`/organizador/torneos/${id}`);
      return;
    }

    const { data: newId, error: rpcError } = await supabase.rpc('crear_torneo', {
      p_titulo: form.titulo,
      p_subtitulo: form.subtitulo || null,
      p_fecha_inicio: form.fecha_inicio || null,
      p_fecha_fin: form.fecha_fin || null,
      p_imagen_url: form.imagen_url || null,
      p_modalidad: form.modalidad,
      ...configParams,
    });
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    navigate(`/organizador/torneos/${newId}`);
  };

  if (loading || loadingTorneo) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-100">
        <div className="bg-white border-b border-slate-200 px-4 py-4">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex-1 p-6 max-w-2xl mx-auto w-full space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }
  if (!hasAccess || !perfil) return null;

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 text-2xl leading-none">‹</button>
        <h1 className="font-black text-slate-900 text-lg uppercase tracking-wide">
          {isEditing ? 'Editar torneo' : 'Crear torneo'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 p-6 max-w-2xl mx-auto w-full space-y-6">
        {error && (
          <div className="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-600 uppercase">Datos generales</h3>

          <div>
            <label className="text-xs font-semibold text-slate-500">Titulo *</label>
            <input
              type="text"
              value={form.titulo}
              onChange={(e) => update('titulo', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500">Subtitulo / categoria</label>
            <input
              type="text"
              value={form.subtitulo}
              onChange={(e) => update('subtitulo', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">Fecha inicio</label>
              <input
                type="date"
                value={form.fecha_inicio}
                onChange={(e) => update('fecha_inicio', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Fecha fin</label>
              <input
                type="date"
                value={form.fecha_fin}
                onChange={(e) => update('fecha_fin', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500">Imagen (URL)</label>
            <input
              type="text"
              value={form.imagen_url}
              onChange={(e) => update('imagen_url', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
            />
          </div>

          {!isEditing && (
            <div>
              <label className="text-xs font-semibold text-slate-500">Modalidad</label>
              <select
                value={form.modalidad}
                onChange={(e) => update('modalidad', e.target.value as 'singles' | 'dobles')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white"
              >
                <option value="singles">Singles</option>
                <option value="dobles">Dobles</option>
              </select>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-600 uppercase">Pago de inscripcion</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">Precio expensas ($)</label>
              <input
                type="number" min={0} step="0.01"
                value={form.precio_expensas}
                onChange={(e) => update('precio_expensas', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Precio a transferir ($)</label>
              <input
                type="number" min={0} step="0.01"
                value={form.precio_transferencia}
                onChange={(e) => update('precio_transferencia', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Costo total de inscripcion: ${(
              (toNumberOrNull(form.precio_expensas) ?? 0) + (toNumberOrNull(form.precio_transferencia) ?? 0)
            ).toLocaleString('es-AR')}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-600 uppercase">Configuracion de grupos</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">Max. por grupo</label>
              <input
                type="number" min={2}
                value={form.max_participantes_por_grupo}
                onChange={(e) => update('max_participantes_por_grupo', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Min. por grupo</label>
              <input
                type="number" min={2}
                value={form.min_participantes_por_grupo}
                onChange={(e) => update('min_participantes_por_grupo', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Numero de grupos (opcional)</label>
              <input
                type="number" min={1}
                value={form.numero_grupos}
                onChange={(e) => update('numero_grupos', e.target.value)}
                placeholder="Auto"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Cupo total (opcional)</label>
              <input
                type="number" min={2}
                value={form.max_participantes_total}
                onChange={(e) => update('max_participantes_total', e.target.value)}
                placeholder="Sin limite"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-600 uppercase">Clasificacion y playoffs</h3>

          <div>
            <label className="text-xs font-semibold text-slate-500">Clasificados por grupo</label>
            <input
              type="number" min={1}
              value={form.clasificados_por_grupo}
              onChange={(e) => update('clasificados_por_grupo', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.crear_playoffs_eliminacion_directa}
              onChange={(e) => update('crear_playoffs_eliminacion_directa', e.target.checked)}
            />
            Habilitar playoffs por eliminacion directa
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.incluir_mejores_terceros}
              onChange={(e) => update('incluir_mejores_terceros', e.target.checked)}
            />
            Incluir mejores terceros en playoffs
          </label>

          {form.incluir_mejores_terceros && (
            <div>
              <label className="text-xs font-semibold text-slate-500">Cantidad de mejores terceros</label>
              <input
                type="number" min={1}
                value={form.cantidad_mejores_terceros}
                onChange={(e) => update('cantidad_mejores_terceros', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-primary hover:opacity-90 text-white font-bold py-3 rounded-lg text-sm disabled:opacity-50 transition"
        >
          {submitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear torneo'}
        </button>
      </form>
    </div>
  );
};

export default OrganizadorTorneoForm;
