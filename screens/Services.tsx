import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServicios, ServicioConStats } from '../hooks/useServicios';

const CATEGORIAS = ['Todos', 'Plomería', 'Electricidad', 'Pintura', 'Jardinería', 'Tutorías', 'Otros'];

// Avatar fallback: inicial del título sobre fondo oscuro
function AvatarFallback({ titulo, className }: { titulo: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-secondary text-white font-black ${className}`}>
      {titulo.charAt(0).toUpperCase()}
    </div>
  );
}

function ProveedorImg({ src, titulo, className }: { src: string | null; titulo: string; className: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <AvatarFallback titulo={titulo} className={className} />;
  return <img src={src} className={className} alt={titulo} onError={() => setBroken(true)} />;
}

function EstrellasMini({ valor }: { valor: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          className={`material-symbols-outlined text-[11px] ${s <= Math.round(valor) ? 'filled text-primary' : 'text-gray-200'}`}
        >
          star
        </span>
      ))}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm animate-pulse">
      <div className="flex gap-4">
        <div className="size-20 rounded-xl bg-gray-100" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-4 bg-gray-100 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
          <div className="h-3 bg-gray-100 rounded w-1/3" />
        </div>
      </div>
      <div className="mt-4 h-8 bg-gray-100 rounded-xl" />
    </div>
  );
}

function SkeletonCarrusel() {
  return (
    <div className="flex gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex flex-col items-center gap-2 min-w-[100px] animate-pulse">
          <div className="size-20 rounded-2xl bg-gray-100" />
          <div className="h-3 w-16 bg-gray-100 rounded" />
          <div className="h-2 w-12 bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  );
}

function CardProveedor({ p, onPress }: { p: ServicioConStats; onPress: () => void }) {
  const sinValoraciones = p.total_valoraciones === 0;
  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={onPress}
    >
      <div className="flex gap-4">
        <ProveedorImg
          src={p.imagen_url}
          titulo={p.titulo}
          className="size-20 rounded-xl object-cover flex-shrink-0"
        />
        <div className="flex-1 flex flex-col justify-between min-w-0">
          <div>
            <h4 className="font-black text-secondary leading-tight truncate">{p.titulo}</h4>
            {sinValoraciones ? (
              <p className="text-[11px] text-gray-400 mt-0.5">Sin valoraciones aún</p>
            ) : (
              <div className="flex items-center gap-1.5 mt-0.5">
                <EstrellasMini valor={p.promedio_rating} />
                <span className="text-xs font-bold text-secondary">{p.promedio_rating.toFixed(1)}</span>
                <span className="text-[10px] text-gray-400">({p.total_valoraciones})</span>
              </div>
            )}
            {p.categoria && (
              <p className="text-xs text-gray-500 font-bold mt-0.5">{p.categoria}</p>
            )}
          </div>
          {p.total_valoraciones > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] bg-gray-50 text-gray-500 font-bold px-2 py-1 rounded-lg border border-gray-100">
                {p.total_valoraciones} valoracion{p.total_valoraciones !== 1 ? 'es' : ''} en el barrio
              </span>
            </div>
          )}
        </div>
      </div>
      <button
        className="w-full mt-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-xl text-xs font-bold text-secondary flex items-center justify-center gap-2 transition-colors"
        onClick={(e) => { e.stopPropagation(); onPress(); }}
      >
        Ver perfil completo <span className="material-symbols-outlined text-sm">chevron_right</span>
      </button>
    </div>
  );
}

const Services: React.FC = () => {
  const navigate = useNavigate();
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

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto no-scrollbar pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-gray-100">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-lg font-black tracking-tight">Directorio de Servicios</h2>
        <button className="p-2 -mr-2 rounded-full hover:bg-gray-100">
          <span className="material-symbols-outlined">tune</span>
        </button>
      </header>

      <div className="px-4 py-4">
        {/* Buscador */}
        <div className="relative mb-4">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setCategoriaActiva(null); }}
            placeholder="Buscar plomero, electricista..."
            className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3.5 pl-11 pr-10 text-sm font-medium focus:ring-primary focus:border-primary outline-none"
          />
          <span className="material-symbols-outlined absolute left-3.5 top-3.5 text-gray-400">search</span>
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-600"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          )}
        </div>

        {/* Chips de categoría */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-4">
          {CATEGORIAS.map((cat) => {
            const isActive = (cat === 'Todos' && !categoriaActiva) || cat === categoriaActiva;
            return (
              <button
                key={cat}
                onClick={() => handleCategoria(cat)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  isActive
                    ? 'bg-secondary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Error de red */}
        {error && (
          <div className="mb-6 flex flex-col items-center gap-3 py-6 text-center">
            <span className="material-symbols-outlined text-4xl text-gray-300">wifi_off</span>
            <p className="text-sm text-gray-500">{error}</p>
            <button
              onClick={refetch}
              className="text-xs font-bold text-primary underline"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Carrusel Recomendados (solo sin búsqueda activa y sin categoría filtrada, si hay datos) */}
        {!error && !hayBusqueda && !categoriaActiva && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black">Recomendados</h3>
              <button
                className="text-primary text-xs font-bold"
                onClick={() => {}}
              >
                Ver todos
              </button>
            </div>
            <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-4 px-4 pb-2">
              {loading ? (
                <SkeletonCarrusel />
              ) : recomendados.length > 0 ? (
                recomendados.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col items-center gap-2 min-w-[100px] group cursor-pointer"
                    onClick={() => navigate(`/service/${p.id}`)}
                  >
                    <div className="relative">
                      <ProveedorImg
                        src={p.imagen_url}
                        titulo={p.titulo}
                        className="size-20 rounded-2xl object-cover shadow-sm group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute -bottom-1 -right-1 bg-primary border-2 border-white rounded-full p-0.5">
                        <span className="material-symbols-outlined text-[12px] text-white filled">verified</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-secondary truncate max-w-[90px]">{p.titulo.split(' ')[0]}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase truncate max-w-[90px]">{p.categoria}</p>
                      <div className="flex items-center justify-center gap-0.5 mt-0.5">
                        <span className="material-symbols-outlined text-[10px] filled text-primary">star</span>
                        <span className="text-[10px] font-bold text-secondary">{p.promedio_rating.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : null /* Oculta la sección si no hay recomendados */}
            </div>
          </section>
        )}

        {/* Lista principal */}
        {!error && (
          <section>
            <h3 className="text-base font-black mb-4">
              {hayBusqueda
                ? `Resultados para "${busqueda}"`
                : categoriaActiva
                ? categoriaActiva
                : 'Profesionales destacados'}
            </h3>

            {loading ? (
              <div className="space-y-4">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
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
                    className="text-xs font-bold text-primary underline"
                  >
                    Limpiar búsqueda
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {servicios.map((p) => (
                  <CardProveedor
                    key={p.id}
                    p={p}
                    onPress={() => navigate(`/service/${p.id}`)}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default Services;
