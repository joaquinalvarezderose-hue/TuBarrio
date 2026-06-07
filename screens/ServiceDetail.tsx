import React, { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useServicioDetalle, Valoracion } from '../hooks/useServicioDetalle';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatFecha(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diffDias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diffDias === 0) return 'Hoy';
  if (diffDias === 1) return 'Ayer';
  if (diffDias < 7) return `Hace ${diffDias} días`;
  if (diffDias < 14) return 'Hace 1 semana';
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function abrirWhatsApp(whatsapp: string, nombre: string) {
  const numero = whatsapp.replace(/\D/g, '');
  const texto = encodeURIComponent(`Hola ${nombre}, te contacto desde TuBarrio`);
  window.open(`https://wa.me/${numero}?text=${texto}`, '_blank');
}

const AVATAR_COLORS = [
  { bg: '#dde5dc', text: '#161d18' },
  { bg: '#dce2f3', text: '#151c27' },
  { bg: '#fde8a8', text: '#3d1a00' },
  { bg: '#f5d0d0', text: '#370004' },
];

function avatarColor(str: string) {
  let sum = 0;
  for (let i = 0; i < str.length; i++) sum += str.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function initials(nombre: string): string {
  const parts = nombre.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0]?.substring(0, 2).toUpperCase() ?? 'VE';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EstrellasFormulario({
  valor,
  onChange,
}: {
  valor: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex justify-center gap-3 mb-6">
      {[1, 2, 3, 4, 5].map((s) => {
        const filled = s <= (hover || valor);
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(0)}
            style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            className="active:scale-95 transition-transform"
          >
            <span
              className={`material-symbols-outlined text-4xl transition-colors ${
                filled ? 'text-primary' : 'text-gray-200 hover:text-primary/60'
              }`}
              style={{ fontVariationSettings: filled ? "'FILL' 1" : "'FILL' 0" }}
            >
              star
            </span>
          </button>
        );
      })}
    </div>
  );
}

function EstrellasDisplay({ valor }: { valor: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          className={`material-symbols-outlined text-sm ${
            s <= Math.round(valor) ? 'text-primary' : 'text-gray-200'
          }`}
          style={{ fontVariationSettings: s <= Math.round(valor) ? "'FILL' 1" : "'FILL' 0" }}
        >
          star
        </span>
      ))}
    </div>
  );
}

function ReviewCard({
  nombre,
  fecha,
  puntuacion,
  comentario,
  esMia = false,
  onEditar,
  onEliminar,
}: {
  nombre: string;
  fecha: string | null;
  puntuacion: number;
  comentario: string | null;
  esMia?: boolean;
  onEditar?: () => void;
  onEliminar?: () => void;
}) {
  const ini = initials(nombre);
  const col = avatarColor(nombre);
  return (
    <article className={`bg-white rounded-2xl p-5 shadow-sm border ${esMia ? 'border-primary/50' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
            style={{ backgroundColor: col.bg, color: col.text }}
          >
            {ini}
          </div>
          <div>
            <h4 className="text-sm font-bold text-secondary">
              {nombre}
              {esMia && (
                <span className="ml-1.5 text-[10px] font-bold text-[#006e1c] bg-[#006e1c]/10 px-1.5 py-0.5 rounded">
                  Tu reseña
                </span>
              )}
            </h4>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">
              {formatFecha(fecha).toUpperCase()}
            </span>
          </div>
        </div>
        <div className="scale-75 origin-right">
          <EstrellasDisplay valor={puntuacion} />
        </div>
      </div>
      {comentario && (
        <p className="text-sm text-gray-500 italic">"{comentario}"</p>
      )}
      {esMia && (
        <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100">
          <button onClick={onEditar} className="text-xs font-bold text-secondary underline">
            Editar
          </button>
          <button onClick={onEliminar} className="text-xs font-bold text-red-500 underline">
            Eliminar
          </button>
        </div>
      )}
    </article>
  );
}

function SkeletonDetalle() {
  return (
    <div className="animate-pulse">
      <div className="h-60 bg-gray-200 w-full" />
      <div className="px-5 -mt-4 relative z-10">
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="h-6 bg-gray-100 rounded w-1/3 mb-4" />
          <div className="h-4 bg-gray-100 rounded w-full mb-2" />
          <div className="h-4 bg-gray-100 rounded w-3/4" />
        </div>
      </div>
    </div>
  );
}

// WhatsApp icon SVG
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const ServiceDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const {
    servicio,
    valoraciones,
    miValoracion,
    loading,
    error,
    submitValoracion,
    deleteValoracion,
  } = useServicioDetalle(id ?? '');

  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState('');
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
      setEstrellas(0);
      setComentario('');
    } catch (e: unknown) {
      showToast(
        e instanceof Error ? e.message : 'No se pudo guardar tu valoración. Intentá de nuevo.',
        'err',
      );
    } finally {
      setEnviando(false);
    }
  }, [estrellas, comentario, submitValoracion, showToast]);

  const handleDelete = useCallback(async () => {
    setConfirmDelete(false);
    try {
      await deleteValoracion();
      showToast('Valoración eliminada.', 'ok');
    } catch {
      showToast('No se pudo eliminar. Intentá de nuevo.', 'err');
    }
  }, [deleteValoracion, showToast]);

  const iniciarEdicion = useCallback(() => {
    setEstrellas(miValoracion?.puntuacion ?? 0);
    setComentario(miValoracion?.comentario ?? '');
    setEditando(true);
  }, [miValoracion]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full bg-gray-50 overflow-y-auto no-scrollbar pb-32">
        <SkeletonDetalle />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !servicio) {
    return (
      <div className="h-full bg-gray-50 flex flex-col items-center justify-center gap-4 px-8 text-center">
        <span className="material-symbols-outlined text-5xl text-gray-200">search_off</span>
        <p className="text-sm text-gray-500">{error ?? 'No encontramos este proveedor.'}</p>
        <button
          onClick={() => navigate(-1)}
          className="text-xs font-bold text-[#006e1c] underline"
        >
          Volver al directorio
        </button>
      </div>
    );
  }

  const tieneWhatsApp = !!servicio.contacto_whatsapp;
  const yaValoro = !!miValoracion && !editando;
  const nombreMostrado = servicio.proveedor_nombre ?? servicio.titulo;
  const otrasValoraciones: Valoracion[] = valoraciones.filter(
    (v) => !miValoracion || v.id !== miValoracion.id,
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full bg-gray-50 overflow-y-auto no-scrollbar pb-32 relative">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl text-sm font-bold shadow-lg text-white ${
            toast.tipo === 'ok' ? 'bg-secondary' : 'bg-red-500'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h4 className="font-display font-bold text-secondary mb-2">¿Eliminar valoración?</h4>
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
      <header className="relative h-[240px] w-full overflow-hidden">
        {!imgBroken && servicio.imagen_url ? (
          <img
            src={servicio.imagen_url}
            alt={nombreMostrado}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImgBroken(true)}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-secondary to-gray-800 flex items-center justify-center">
            <span className="material-symbols-outlined text-6xl text-white/30">person</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-6 left-6 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform z-10"
        >
          <span className="material-symbols-outlined text-secondary">arrow_back</span>
        </button>
        <div className="absolute bottom-6 left-6 right-6">
          {servicio.categoria && (
            <span className="inline-block px-3 py-1 bg-primary text-secondary font-bold text-[10px] rounded-full mb-2 uppercase tracking-wider">
              {servicio.categoria}
            </span>
          )}
          <h1 className="font-display font-bold text-2xl text-white leading-tight">
            {nombreMostrado}
          </h1>
        </div>
      </header>

      {/* Main content overlaps hero */}
      <main className="px-5 -mt-4 relative z-10 max-w-screen-sm mx-auto w-full">
        {/* Info card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xl font-black text-secondary">
                {servicio.total_valoraciones > 0 ? servicio.promedio_rating.toFixed(1) : '—'}
              </span>
              <EstrellasDisplay valor={servicio.promedio_rating} />
              <span className="text-sm text-gray-500">
                ({servicio.total_valoraciones} valoracion{servicio.total_valoraciones !== 1 ? 'es' : ''})
              </span>
            </div>
            {servicio.precio != null && (
              <div className="bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                <span className="text-sm font-bold text-[#006e1c]">
                  Desde ${servicio.precio.toLocaleString('es-AR')}
                </span>
              </div>
            )}
          </div>
          {servicio.descripcion && (
            <p className="text-sm text-gray-500 leading-relaxed">{servicio.descripcion}</p>
          )}
        </div>

        {/* Rating section */}
        <section className="mb-8">
          <h2 className="font-display font-bold text-base text-secondary mb-4">
            {yaValoro ? 'Tu valoración' : 'Dejá tu valoración'}
          </h2>

          {yaValoro ? (
            <ReviewCard
              nombre="Tu valoración"
              fecha={miValoracion.created_at}
              puntuacion={miValoracion.puntuacion}
              comentario={miValoracion.comentario}
              esMia
              onEditar={iniciarEdicion}
              onEliminar={() => setConfirmDelete(true)}
            />
          ) : (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <EstrellasFormulario valor={estrellas} onChange={setEstrellas} />
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Contanos tu experiencia con el servicio..."
                rows={4}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-secondary placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all mb-4"
              />
              <button
                disabled={estrellas === 0 || enviando}
                onClick={handleSubmit}
                className={`w-full py-4 rounded-xl font-bold text-sm shadow-sm transition-all ${
                  estrellas === 0
                    ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    : 'bg-secondary text-white hover:bg-secondary/90 active:scale-[0.98]'
                }`}
              >
                {enviando ? 'Enviando...' : 'Enviar valoración'}
              </button>
              {editando && (
                <button
                  onClick={() => setEditando(false)}
                  className="w-full mt-3 py-3 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              )}
            </div>
          )}
        </section>

        {/* Reviews */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display font-bold text-base text-secondary">Opiniones de vecinos</h2>
            {otrasValoraciones.length > 5 && (
              <span className="text-sm font-bold text-[#006e1c] cursor-pointer">Ver todas</span>
            )}
          </div>
          <div className="space-y-4">
            {otrasValoraciones.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-4">
                {miValoracion
                  ? 'Todavía no hay otras opiniones.'
                  : 'Nadie valoró este servicio todavía. ¡Sé el primero!'}
              </p>
            ) : (
              otrasValoraciones.slice(0, 10).map((v) => (
                <ReviewCard
                  key={v.id}
                  nombre={v.perfiles?.nombre_completo ?? 'Vecino'}
                  fecha={v.created_at}
                  puntuacion={v.puntuacion}
                  comentario={v.comentario}
                />
              ))
            )}
          </div>
        </section>
      </main>

      {/* WhatsApp CTA sticky */}
      <div className="fixed bottom-0 left-0 right-0 p-5 pb-20 bg-gradient-to-t from-white via-white to-transparent z-40">
        <button
          disabled={!tieneWhatsApp}
          onClick={() =>
            tieneWhatsApp && abrirWhatsApp(servicio.contacto_whatsapp!, nombreMostrado)
          }
          className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl shadow-xl transition-all ${
            tieneWhatsApp
              ? 'bg-[#25D366] text-white hover:bg-[#1da851] active:scale-95 cursor-pointer'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          <WhatsAppIcon className="w-6 h-6 fill-current" />
          <div className="text-left">
            <p className="font-bold text-sm leading-none">
              {tieneWhatsApp ? 'Contactar por WhatsApp' : 'Sin contacto disponible'}
            </p>
            {tieneWhatsApp && (
              <p className="text-[10px] opacity-80 mt-0.5">Abre WhatsApp con un mensaje pre-armado</p>
            )}
          </div>
        </button>
      </div>
    </div>
  );
};

export default ServiceDetail;
