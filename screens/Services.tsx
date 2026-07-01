import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServicios, ServicioConStats } from '../hooks/useServicios';
import { useRequireAuth } from '../hooks/useRequireAuth';

// Cambiá esto a true cuando el directorio tenga suficientes proveedores
const DIRECTORIO_ACTIVO = false;

const CATEGORIAS = ['Todos', 'Plomería', 'Electricidad', 'Pintura', 'Jardinería', 'Tutorías', 'Otros'];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function ProvImg({
  src,
  titulo,
  className,
}: {
  src: string | null;
  titulo: string;
  className: string;
}) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className={`flex items-center justify-center bg-secondary text-white font-black ${className}`}>
        {titulo.charAt(0).toUpperCase()}
      </div>
    );
  }
  return <img src={src} className={className} alt={titulo} onError={() => setBroken(true)} />;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCarrusel() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex-none w-44 bg-white p-4 rounded-xl shadow-sm border border-gray-100 animate-pulse"
        >
          <div className="w-20 h-20 bg-gray-100 rounded-xl mx-auto mb-3" />
          <div className="h-3 bg-gray-100 rounded w-3/4 mx-auto mb-2" />
          <div className="h-3 bg-gray-100 rounded w-1/2 mx-auto" />
        </div>
      ))}
    </>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm animate-pulse">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-16 h-16 bg-gray-100 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-4 bg-gray-100 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
          <div className="h-3 bg-gray-100 rounded w-1/3" />
        </div>
      </div>
      <div className="h-6 bg-gray-100 rounded w-1/2 mb-5" />
      <div className="h-10 bg-gray-100 rounded-lg" />
    </div>
  );
}

// ─── Carousel card ────────────────────────────────────────────────────────────

function CarouselCard({ p, onClick }: { p: ServicioConStats; onClick: () => void }) {
  return (
    <div
      className="flex-none w-44 bg-white p-4 rounded-xl shadow-sm border border-gray-100 cursor-pointer active:scale-95 transition-transform"
      onClick={onClick}
    >
      <div className="relative w-20 h-20 mx-auto mb-3">
        <ProvImg
          src={p.imagen_url}
          titulo={p.titulo}
          className="w-full h-full object-cover rounded-xl"
        />
        <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-1 border-2 border-white">
          <span
            className="material-symbols-outlined text-[14px] font-bold text-secondary"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            verified
          </span>
        </div>
      </div>
      <h4 className="text-sm font-bold text-secondary text-center truncate">
        {(p.proveedor_nombre ?? p.titulo).split(' ')[0]}
      </h4>
      <p className="text-xs text-gray-500 text-center mb-2">{p.categoria}</p>
      <div className="flex items-center justify-center gap-1">
        <span
          className="material-symbols-outlined text-sm text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          star
        </span>
        <span className="text-xs font-bold text-secondary">
          {p.total_valoraciones > 0 ? p.promedio_rating.toFixed(1) : '—'}
        </span>
      </div>
    </div>
  );
}

// ─── Featured provider card ───────────────────────────────────────────────────

function ProveedorCard({ p, onClick }: { p: ServicioConStats; onClick: () => void }) {
  return (
    <article className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex items-start gap-4 mb-4">
        <ProvImg
          src={p.imagen_url}
          titulo={p.titulo}
          className="w-16 h-16 object-cover rounded-xl flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <h4 className="font-display font-bold text-sm text-secondary truncate">
              {p.proveedor_nombre ?? p.titulo}
            </h4>
            <span
              className="material-symbols-outlined text-primary text-sm flex-shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              verified
            </span>
          </div>
          {p.categoria && (
            <p className="text-xs text-gray-500 mb-2">{p.categoria}</p>
          )}
          <div className="flex items-center gap-1">
            <span
              className="material-symbols-outlined text-sm text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              star
            </span>
            {p.total_valoraciones > 0 ? (
              <>
                <span className="text-xs font-bold text-secondary">
                  {p.promedio_rating.toFixed(1)}
                </span>
                <span className="text-xs text-gray-500">({p.total_valoraciones} reviews)</span>
              </>
            ) : (
              <span className="text-xs text-gray-400">Sin valoraciones aún</span>
            )}
          </div>
        </div>
      </div>

      {p.total_valoraciones > 0 && (
        <div className="flex items-center gap-2 mb-5">
          <span className="px-3 py-1 bg-[#006e1c]/10 text-[#006e1c] rounded-md text-xs font-bold">
            {p.total_valoraciones} valoracion{p.total_valoraciones !== 1 ? 'es' : ''} en el barrio
          </span>
        </div>
      )}

      <button
        onClick={onClick}
        className="w-full py-3 bg-gray-50 border border-gray-200 text-secondary font-bold text-sm rounded-lg hover:bg-gray-100 transition-all active:scale-[0.98]"
      >
        Ver perfil completo
      </button>
    </article>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const Services: React.FC = () => {
  const navigate = useNavigate();
  const requireAuth = useRequireAuth();
  const [busqueda, setBusqueda] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);

  const { servicios, recomendados, loading, error, refetch } = useServicios({
    busqueda,
    categoria: categoriaActiva,
  });

  const handleCategoria = useCallback((cat: string) => {
    setCategoriaActiva(cat === 'Todos' ? null : cat);
    setBusqueda('');
  }, []);

  const hayBusqueda = busqueda.trim().length > 0;

  const handleRecomendar = () => navigate('/recomendar-profesional');

  if (!DIRECTORIO_ACTIVO) {
    return (
      <div className="flex flex-col h-full bg-gray-50 overflow-y-auto no-scrollbar">
        <header className="fixed top-0 w-full z-50 bg-gray-50/95 backdrop-blur-md border-b border-gray-100 relative flex items-center px-5 h-16">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-5 hover:opacity-80 transition-opacity active:scale-95 text-secondary"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="w-full text-center font-display font-bold text-base text-secondary">
            Directorio de Servicios
          </h1>
        </header>
        <main className="min-h-full flex flex-col items-center justify-center px-8 text-center pt-16 pb-28">
          <span
            className="material-symbols-outlined text-7xl text-primary mb-6"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            groups
          </span>
          <h2 className="font-display font-black text-xl text-secondary mb-3 max-w-[300px]">
            Estamos armando la red de profesionales del barrio
          </h2>
          <p className="text-sm text-gray-500 mb-8 max-w-[280px] leading-relaxed">
            Cada recomendación nos acerca a un directorio de confianza. ¿Conocés a alguien que merezca estar acá?
          </p>
          <button
            onClick={handleRecomendar}
            className="px-8 py-3.5 bg-primary text-secondary font-bold text-sm rounded-xl shadow-sm hover:opacity-90 transition-all active:scale-95"
          >
            Recomendar un profesional
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-y-auto no-scrollbar">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-gray-50/95 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-5 h-16 transition-all">
        <button
          onClick={() => navigate(-1)}
          className="hover:opacity-80 transition-opacity active:scale-95 text-secondary"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="font-display font-bold text-base text-secondary">Directorio de Servicios</h1>
        <div className="w-6" />
      </header>

      <main className="pt-20 pb-28 px-5 max-w-screen-sm mx-auto w-full">
        {/* Buscador */}
        <section className="mt-4 mb-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400">
              <span className="material-symbols-outlined">search</span>
            </div>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setCategoriaActiva(null);
              }}
              placeholder="Buscar plomero, electricista..."
              className="w-full h-14 pl-12 pr-10 bg-gray-100 border border-gray-200 rounded-xl text-sm text-secondary placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            )}
          </div>
        </section>

        {/* Chips de categoría */}
        <section className="mb-8 -mx-5 px-5 overflow-x-auto no-scrollbar flex gap-2">
          {CATEGORIAS.map((cat) => {
            const isActive =
              (cat === 'Todos' && !categoriaActiva) || cat === categoriaActiva;
            return (
              <button
                key={cat}
                onClick={() => handleCategoria(cat)}
                className={`flex-none px-6 py-2.5 rounded-full text-sm font-bold transition-all active:scale-95 ${
                  isActive
                    ? 'bg-secondary text-white'
                    : 'bg-gray-100 border border-gray-200 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </section>

        {/* Community Banner */}
        {!hayBusqueda && !categoriaActiva && (
          <section className="mb-10 bg-primary/10 rounded-xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex-1">
              <h3 className="font-display font-bold text-sm text-secondary mb-1">
                ¿Ofrecés un servicio o conocés a un buen profesional?
              </h3>
              <p className="text-xs text-gray-500">
                Sumá tu propuesta o recomendación para vecinos del barrio.
              </p>
            </div>
            <button
              onClick={handleRecomendar}
              className="flex-none px-8 py-3 bg-primary text-secondary font-bold text-sm rounded-lg shadow-sm hover:opacity-90 transition-all active:scale-95"
            >
              Recomendar
            </button>
          </section>
        )}

        {/* Error de red */}
        {error && (
          <div className="mb-6 flex flex-col items-center gap-3 py-6 text-center">
            <span className="material-symbols-outlined text-4xl text-gray-300">wifi_off</span>
            <p className="text-sm text-gray-500">{error}</p>
            <button onClick={refetch} className="text-xs font-bold text-[#006e1c] underline">
              Reintentar
            </button>
          </div>
        )}

        {/* Carrusel Recomendados */}
        {!error && !hayBusqueda && !categoriaActiva && (
          <section className="mb-10">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display font-bold text-base text-secondary">Recomendados</h2>
              <button className="text-sm font-bold text-[#006e1c] hover:underline transition-all">
                Ver todos
              </button>
            </div>
            <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-5 px-5">
              {loading ? (
                <SkeletonCarrusel />
              ) : recomendados.length > 0 ? (
                recomendados.map((p) => (
                  <CarouselCard
                    key={p.id}
                    p={p}
                    onClick={() => requireAuth({ type: 'service-hire', payload: { serviceId: p.id } }, () => navigate(`/service/${p.id}`))}
                  />
                ))
              ) : null}
            </div>
          </section>
        )}

        {/* Lista Profesionales */}
        {!error && (
          <section className="mb-12">
            <h2 className="font-display font-bold text-base text-secondary mb-6">
              {hayBusqueda
                ? `Resultados para "${busqueda}"`
                : categoriaActiva
                ? categoriaActiva
                : 'Profesionales destacados'}
            </h2>
            <div className="space-y-4">
              {loading ? (
                <>
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </>
              ) : servicios.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <span className="material-symbols-outlined text-5xl text-gray-200">
                    {hayBusqueda ? 'search_off' : 'handyman'}
                  </span>
                  <p className="text-sm text-gray-500 max-w-[240px]">
                    {hayBusqueda
                      ? `No encontramos proveedores para "${busqueda}".`
                      : categoriaActiva
                      ? `Sin proveedores en ${categoriaActiva} por ahora.`
                      : 'Todavía no hay proveedores en el directorio.'}
                  </p>
                  {hayBusqueda && (
                    <button
                      onClick={() => setBusqueda('')}
                      className="text-xs font-bold text-[#006e1c] underline"
                    >
                      Limpiar búsqueda
                    </button>
                  )}
                </div>
              ) : (
                servicios.map((p) => (
                  <ProveedorCard
                    key={p.id}
                    p={p}
                    onClick={() => requireAuth({ type: 'service-hire', payload: { serviceId: p.id } }, () => navigate(`/service/${p.id}`))}
                  />
                ))
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default Services;
