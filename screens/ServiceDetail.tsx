import React, { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useServicioDetalle, Valoracion } from '../hooks/useServicioDetalle';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatFecha(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const ahora = new Date();
  const diffMs = ahora.getTime() - d.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDias === 0) return 'hoy';
  if (diffDias === 1) return 'ayer';
  if (diffDias < 7) return `hace ${diffDias} días`;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function abrirWhatsApp(whatsapp: string, nombre: string) {
  const numero = whatsapp.replace(/\D/g, '');
  const texto = encodeURIComponent(`Hola ${nombre}, te contacto desde TuBarrio`);
  window.open(`https://wa.me/${numero}?text=${texto}`, '_blank');
}

// ─── Componentes internos ─────────────────────────────────────────────────────

function AvatarLetra({ nombre, size = 'md' }: { nombre: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'size-8 text-xs' : 'size-10 text-sm';
  return (
    <div className={`flex-shrink-0 flex items-center justify-center rounded-full bg-secondary text-white font-black ${cls}`}>
      {nombre.charAt(0).toUpperCase()}
    </div>
  );
}

function Estrellas({
  valor,
  interactivo = false,
  onChange,
}: {
  valor: number;
  interactivo?: boolean;
  onChange?: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => {
        const filled = s <= (hover || valor);
        return (
          <button
            key={s}
            type="button"
            disabled={!interactivo}
            onClick={() => onChange?.(s)}
            onMouseEnter={() => interactivo && setHover(s)}
            onMouseLeave={() => interactivo && setHover(0)}
            className={`${interactivo ? 'cursor-pointer' : 'cursor-default'} p-0 leading-none disabled:cursor-default`}
            style={{ minWidth: interactivo ? 44 : undefined, minHeight: interactivo ? 44 : undefined }}
          >
            <span
              className={`material-symbols-outlined ${interactivo ? 'text-3xl' : 'text-sm'} transition-colors ${
                filled ? 'filled text-primary' : 'text-gray-200'
              }`}
            >
              star
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BarraRating({ total, distribucion }: { total: number; distribucion: Record<1 | 2 | 3 | 4 | 5, number> }) {
  return (
    <div className="space-y-1.5">
      {([5, 4, 3, 2, 1] as const).map((n) => {
        const cant = distribucion[n] ?? 0;
        const pct = total > 0 ? (cant / total) * 100 : 0;
        return (
          <div key={n} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-3 text-right">{n}</span>
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-400 w-4">{cant}</span>
          </div>
        );
      })}
    </div>
  );
}

function SkeletonDetalle() {
  return (
    <div className="animate-pulse">
      <div className="h-52 bg-gray-100 w-full" />
      <div className="px-4 pt-4 space-y-3">
        <div className="h-8 bg-gray-100 rounded w-1/3" />
        <div className="h-4 bg-gray-100 rounded w-full" />
        <div className="h-4 bg-gray-100 rounded w-3/4" />
        <div className="h-14 bg-gray-100 rounded-2xl mt-4" />
      </div>
    </div>
  );
}

function ReviewItem({ v }: { v: Valoracion }) {
  const nombre = v.perfiles?.nombre_completo ?? 'Vecino';
  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      <div className="flex items-start gap-3">
        <AvatarLetra nombre={nombre} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-secondary truncate">{nombre}</span>
            <span className="text-[10px] text-gray-400 flex-shrink-0">{formatFecha(v.created_at)}</span>
          </div>
          <Estrellas valor={v.puntuacion} />
          {v.comentario && (
            <p className="text-sm text-gray-600 mt-1 leading-relaxed">{v.comentario}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

const ServiceDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const {
    servicio,
    valoraciones,
    miValoracion,
    distribucion,
    loading,
    error,
    submitValoracion,
    deleteValoracion,
  } = useServicioDetalle(id ?? '');

  // Estado del formulario de valoración
  const [estrellas, setEstrellas] = useState(miValoracion?.puntuacion ?? 0);
  const [comentario, setComentario] = useState(miValoracion?.comentario ?? '');
  const [editando, setEditando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);

  const showToast = useCallback((msg: string, tipo: 'ok' | 'err') => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (estrellas === 0) return;
    setEnviando(true);
    try {
      await submitValoracion(estrellas, comentario);
      showToast('¡Gracias! Tu valoración fue publicada.', 'ok');
      setEditando(false);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'No se pudo guardar tu valoración. Intentá de nuevo.', 'err');
    } finally {
      setEnviando(false);
    }
  }, [estrellas, comentario, submitValoracion, showToast]);

  const handleDelete = useCallback(async () => {
    setConfirmDelete(false);
    try {
      await deleteValoracion();
      setEstrellas(0);
      setComentario('');
      showToast('Valoración eliminada.', 'ok');
    } catch {
      showToast('No se pudo eliminar tu valoración. Intentá de nuevo.', 'err');
    }
  }, [deleteValoracion, showToast]);

  const iniciarEdicion = useCallback(() => {
    setEstrellas(miValoracion?.puntuacion ?? 0);
    setComentario(miValoracion?.comentario ?? '');
    setEditando(true);
  }, [miValoracion]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-white overflow-y-auto no-scrollbar pb-20">
        <SkeletonDetalle />
      </div>
    );
  }

  if (error || !servicio) {
    return (
      <div className="flex flex-col h-full bg-white items-center justify-center gap-4 px-8 text-center">
        <span className="material-symbols-outlined text-5xl text-gray-200">search_off</span>
        <p className="text-sm text-gray-500">{error ?? 'No encontramos este proveedor.'}</p>
        <button
          onClick={() => navigate(-1)}
          className="text-xs font-bold text-primary underline"
        >
          Volver al directorio
        </button>
      </div>
    );
  }

  const tieneWhatsApp = !!servicio.contacto_whatsapp;
  const sinValoraciones = servicio.total_valoraciones === 0;
  const yaValoro = !!miValoracion && !editando;
  const otrasValoraciones = valoraciones.filter(
    (v) => !miValoracion || v.usuario_id !== miValoracion.usuario_id,
  );

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto no-scrollbar pb-32 relative">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl text-sm font-bold shadow-lg text-white transition-all ${
            toast.tipo === 'ok' ? 'bg-secondary' : 'bg-red-500'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Modal confirmación de eliminación */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h4 className="font-black text-secondary mb-2">¿Eliminar valoración?</h4>
            <p className="text-sm text-gray-500 mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="relative">
        {!imgBroken && servicio.imagen_url ? (
          <img
            src={servicio.imagen_url}
            alt={servicio.titulo}
            className="w-full h-52 object-cover"
            onError={() => setImgBroken(true)}
          />
        ) : (
          <div className="w-full h-52 bg-gradient-to-b from-secondary to-gray-800 flex items-center justify-center">
            <span className="material-symbols-outlined text-6xl text-white/40">person</span>
          </div>
        )}
        {/* Overlay degradado */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        {/* Botón back */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 bg-white/90 shadow-sm rounded-full p-2 hover:bg-white"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        {/* Nombre y categoría sobre el overlay */}
        <div className="absolute bottom-4 left-4 right-4">
          <h1 className="text-xl font-black text-white leading-tight drop-shadow">{servicio.titulo}</h1>
          {servicio.categoria && (
            <span className="mt-1 inline-block text-[10px] font-bold uppercase text-primary bg-secondary/80 px-2 py-0.5 rounded-full">
              {servicio.categoria}
            </span>
          )}
        </div>
      </div>

      {/* Contenido */}
      <div className="px-4 pt-5 space-y-6">
        {/* Rating + distribución */}
        <div className="flex gap-4 items-start">
          <div className="flex flex-col items-center gap-1">
            <span className="text-3xl font-black text-secondary leading-none">
              {sinValoraciones ? '—' : servicio.promedio_rating.toFixed(1)}
            </span>
            <Estrellas valor={servicio.promedio_rating} />
            <span className="text-[11px] text-gray-400">
              {sinValoraciones ? 'Sin valoraciones' : `(${servicio.total_valoraciones})`}
            </span>
          </div>
          {!sinValoraciones && (
            <div className="flex-1">
              <BarraRating total={servicio.total_valoraciones} distribucion={distribucion} />
            </div>
          )}
        </div>

        {/* Descripción */}
        {servicio.descripcion && (
          <p className="text-sm text-gray-600 leading-relaxed">{servicio.descripcion}</p>
        )}

        {/* Precio */}
        {servicio.precio != null && (
          <span className="inline-block text-base font-black text-secondary bg-primary/10 text-primary px-3 py-1 rounded-lg">
            Desde ${servicio.precio.toLocaleString('es-AR')}
          </span>
        )}

        {/* Botón WhatsApp */}
        <div>
          <button
            disabled={!tieneWhatsApp}
            onClick={() => tieneWhatsApp && abrirWhatsApp(servicio.contacto_whatsapp!, servicio.titulo)}
            className={`w-full py-4 rounded-2xl font-black text-base text-white flex items-center justify-center gap-3 transition-colors ${
              tieneWhatsApp
                ? 'bg-[#25D366] hover:bg-[#1da851] cursor-pointer'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            {tieneWhatsApp ? 'Contactar por WhatsApp' : 'Sin contacto disponible'}
          </button>
          {tieneWhatsApp && (
            <p className="text-center text-[11px] text-gray-400 mt-1.5">
              Abre WhatsApp con un mensaje pre-armado
            </p>
          )}
        </div>

        {/* Divisor */}
        <div className="border-t border-gray-100" />

        {/* Sección valoraciones */}
        <div>
          <h3 className="text-base font-black mb-4">Valoraciones de vecinos</h3>

          {/* Mi valoración o formulario */}
          {yaValoro ? (
            <div className="bg-gray-50 rounded-2xl p-4 border-2 border-primary/30 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-secondary uppercase tracking-wide">Tu valoración</span>
                <div className="flex gap-3">
                  <button
                    onClick={iniciarEdicion}
                    className="text-xs font-bold text-secondary underline"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-xs font-bold text-red-500 underline"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
              <Estrellas valor={miValoracion.puntuacion} />
              {miValoracion.comentario && (
                <p className="text-sm text-gray-600 mt-2">{miValoracion.comentario}</p>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 mb-4">
              <p className="text-xs text-gray-500 mb-3">
                {editando
                  ? 'Editá tu valoración:'
                  : `¿Contrataste este servicio? Contale al barrio tu experiencia.`}
              </p>
              <Estrellas valor={estrellas} interactivo onChange={setEstrellas} />
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Comentario (opcional)"
                rows={3}
                className="w-full mt-3 bg-white border border-gray-100 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex gap-2 mt-3">
                {editando && (
                  <button
                    onClick={() => setEditando(false)}
                    className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-500"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  disabled={estrellas === 0 || enviando}
                  onClick={handleSubmit}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold text-secondary transition-colors flex items-center justify-center gap-2 ${
                    estrellas === 0
                      ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                      : 'bg-primary hover:bg-primary/80'
                  }`}
                >
                  {enviando ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                      Enviando...
                    </>
                  ) : (
                    'Enviar valoración'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Reviews de otros */}
          {otrasValoraciones.length === 0 && !miValoracion ? (
            <p className="text-sm text-gray-400 italic text-center py-4">
              Nadie valoró este servicio todavía. ¡Sé el primero!
            </p>
          ) : (
            <div>
              {otrasValoraciones.slice(0, 10).map((v) => (
                <ReviewItem key={v.id} v={v} />
              ))}
              {otrasValoraciones.length > 10 && (
                <button className="w-full py-3 text-xs font-bold text-primary text-center">
                  Ver todas las valoraciones
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Botón WhatsApp sticky en mobile (siempre visible) */}
      {tieneWhatsApp && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-100 px-4 py-3 pb-safe">
          <button
            onClick={() => abrirWhatsApp(servicio.contacto_whatsapp!, servicio.titulo)}
            className="w-full py-3.5 bg-[#25D366] hover:bg-[#1da851] rounded-2xl font-black text-white text-sm flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Contactar por WhatsApp
          </button>
        </div>
      )}
    </div>
  );
};

export default ServiceDetail;
