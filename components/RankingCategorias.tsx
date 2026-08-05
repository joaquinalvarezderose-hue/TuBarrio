import React, { useMemo } from 'react';
import { useRankingCategorias } from '../hooks/useRankingCategorias';
import Logo from './Logo';

type Props = {
  onBack: () => void;
};

const POSITION_STYLES: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: 'bg-amber-100', text: 'text-amber-700', label: '1°' },
  2: { bg: 'bg-gray-200', text: 'text-gray-600', label: '2°' },
  3: { bg: 'bg-orange-100', text: 'text-orange-700', label: '3°' },
};

const RankingCategorias: React.FC<Props> = ({ onBack }) => {
  const { rows, categorias, categoriaActiva, setCategoriaActiva, loading, error } = useRankingCategorias();

  const rowsActivos = useMemo(
    () => rows.filter((r) => r.categoria === categoriaActiva),
    [rows, categoriaActiva]
  );

  return (
    <div className="relative flex min-h-full w-full flex-col bg-background-light font-display pb-32 md:pb-0">
      {/* Header */}
      <header className="flex items-center p-4 md:px-8 pb-2 justify-between bg-background-light sticky top-0 z-40 border-b border-transparent md:border-gray-100">
        <button
          onClick={onBack}
          className="flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-gray-200 transition-colors text-[#111813]"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="flex-1 flex items-center justify-center md:justify-start md:pl-4">
          <Logo variant="tournament" className="h-[120px] w-auto" />
        </div>
        <div className="w-12" />
      </header>

      <div className="max-w-3xl mx-auto w-full px-4 md:px-8 pt-4">
        <h1 className="text-[#111813] text-[22px] font-bold leading-tight tracking-[-0.015em] pb-4">
          Ranking General
        </h1>

        {/* Aclaración: el puntaje no clasifica a la siguiente fase */}
        <div className="flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-200 p-3 mb-4 text-sm text-blue-700">
          <span className="material-symbols-outlined text-base leading-none mt-0.5">info</span>
          <p>
            Este puntaje no clasifica para la próxima fase. Sirve para ubicar a los mejores
            jugadores de cada categoría.
          </p>
        </div>

        {/* Estado cargando */}
        {loading && (
          <div className="py-16 text-center">
            <span className="material-symbols-outlined text-4xl text-gray-300 animate-spin">sync</span>
            <p className="text-sm text-gray-400 mt-3">Cargando ranking...</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Contenido principal */}
        {!loading && !error && (
          <>
            {/* Tabs de categorías */}
            {categorias.length > 0 && (
              <div className="flex gap-1 overflow-x-auto pb-1 mb-5 -mx-1 px-1 scrollbar-hide">
                {categorias.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoriaActiva(cat)}
                    className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                      categoriaActiva === cat
                        ? 'bg-[#13ec49] text-[#111813] shadow-sm shadow-[#13ec49]/30'
                        : 'bg-white text-[#61896b] border border-gray-200 hover:border-[#4a9c40]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Sin categorías */}
            {categorias.length === 0 && (
              <div className="bg-white rounded-3xl p-12 text-center shadow-sm border border-gray-100">
                <span className="material-symbols-outlined text-6xl text-gray-300 mb-4 block">leaderboard</span>
                <p className="text-gray-500 font-medium text-lg">Todavía no se disputó ningún partido.</p>
                <p className="text-gray-400 text-sm mt-1">El ranking aparecerá aquí una vez que se confirmen los primeros resultados.</p>
              </div>
            )}

            {/* Tabla de ranking */}
            {categorias.length > 0 && (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Encabezado de tabla */}
                <div className="grid grid-cols-[2.5rem_1fr_2.5rem_3rem] items-center px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 text-center">#</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pl-2">Jugador</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 text-center">PJ</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#4a9c40] text-center">Pts</span>
                </div>

                {/* Filas */}
                {rowsActivos.length === 0 ? (
                  <div className="py-12 text-center">
                    <span className="material-symbols-outlined text-4xl text-gray-300 mb-3 block">leaderboard</span>
                    <p className="text-gray-500 text-sm font-medium">No hay partidos registrados aún en esta categoría.</p>
                  </div>
                ) : (
                  rowsActivos.map((row, idx) => {
                    const posStyle = POSITION_STYLES[row.posicion];
                    const isLast = idx === rowsActivos.length - 1;
                    return (
                      <div
                        key={row.perfil_id}
                        className={`grid grid-cols-[2.5rem_1fr_2.5rem_3rem] items-center px-4 py-3.5 transition-colors hover:bg-gray-50 ${
                          !isLast ? 'border-b border-gray-100' : ''
                        } ${row.posicion === 1 ? 'bg-amber-50/30' : ''}`}
                      >
                        {/* Posición */}
                        <div className="flex justify-center">
                          <span
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                              posStyle ? `${posStyle.bg} ${posStyle.text}` : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {row.posicion}
                          </span>
                        </div>

                        {/* Jugador */}
                        <div className="flex items-center pl-2 min-w-0">
                          <span className="text-sm font-semibold text-[#111813] truncate">
                            {row.nombre_completo ?? 'Jugador'}
                          </span>
                        </div>

                        {/* PJ */}
                        <span className="text-sm text-gray-500 text-center">{row.partidos_jugados}</span>

                        {/* Pts */}
                        <div className="flex justify-center">
                          <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full bg-[#13ec49]/15 text-sm font-bold text-[#0eb538]">
                            {row.puntos}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Leyenda de puntos */}
            {categorias.length > 0 && (
              <div className="mt-4 rounded-2xl bg-white border border-gray-100 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Sistema de puntos</p>
                <div className="flex gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#13ec49]/15 text-xs font-bold text-[#0eb538]">3</span>
                    <span className="text-xs text-gray-500">Victoria 2-0</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#13ec49]/15 text-xs font-bold text-[#0eb538]">2</span>
                    <span className="text-xs text-gray-500">Victoria 2-1</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-bold text-gray-500">1</span>
                    <span className="text-xs text-gray-500">Derrota 1-2</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-bold text-gray-500">0</span>
                    <span className="text-xs text-gray-500">Derrota 0-2</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-xs font-bold text-amber-700">0</span>
                    <span className="text-xs text-gray-500">W.O. (jugador designado)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Explicación del propósito del ranking */}
            {categorias.length > 0 && (
              <div className="mt-4 rounded-2xl bg-white border border-gray-100 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                  ¿Para qué sirve este ranking?
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Este puntaje no define quién avanza de fase en el torneo. Su objetivo es reflejar
                  el nivel de cada jugador dentro de su categoría durante la temporada, para ubicar
                  a los mejores jugadores de cada categoría.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default RankingCategorias;
