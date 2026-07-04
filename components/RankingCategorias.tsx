import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import Logo from './Logo';

type RankingRow = {
  categoria: string;
  perfil_id: string;
  nombre_completo: string | null;
  partidos_jugados: number;
  victorias: number;
  derrotas: number;
  puntos: number;
  posicion: number;
};

type Props = {
  onBack: () => void;
};

const POSITION_STYLES: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: 'bg-amber-100', text: 'text-amber-700', label: '1°' },
  2: { bg: 'bg-gray-200', text: 'text-gray-600', label: '2°' },
  3: { bg: 'bg-orange-100', text: 'text-orange-700', label: '3°' },
};

function getInitials(nombre: string | null): string {
  if (!nombre) return '?';
  const parts = nombre.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0][0]?.toUpperCase() ?? '?';
}

const RankingCategorias: React.FC<Props> = ({ onBack }) => {
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [categoriaActiva, setCategoriaActiva] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRanking = async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('ranking_categorias_view')
        .select('*')
        .order('categoria', { ascending: true })
        .order('posicion', { ascending: true });

      if (err) {
        setError('No se pudo cargar el ranking. Intentá de nuevo más tarde.');
        setLoading(false);
        return;
      }

      const allRows = (data ?? []) as RankingRow[];
      const cats = Array.from(new Set(allRows.map((r) => r.categoria))).filter(Boolean);
      setRows(allRows);
      setCategorias(cats);
      setCategoriaActiva(cats[0] ?? '');
      setLoading(false);
    };

    fetchRanking();
  }, []);

  const rowsActivos = rows.filter((r) => r.categoria === categoriaActiva);

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
                <div className="grid grid-cols-[3rem_1fr_2.5rem_2.5rem_2.5rem_3rem] items-center px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 text-center">#</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pl-2">Jugador</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 text-center">PJ</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 text-center">V</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 text-center">D</span>
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
                        className={`grid grid-cols-[3rem_1fr_2.5rem_2.5rem_2.5rem_3rem] items-center px-4 py-3.5 transition-colors hover:bg-gray-50 ${
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
                        <div className="flex items-center gap-3 pl-2 min-w-0">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#4a9c40]/15 flex items-center justify-center">
                            <span className="text-xs font-bold text-[#4a9c40]">
                              {getInitials(row.nombre_completo)}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-[#111813] truncate">
                            {row.nombre_completo ?? 'Jugador'}
                          </span>
                        </div>

                        {/* PJ */}
                        <span className="text-sm text-gray-500 text-center">{row.partidos_jugados}</span>

                        {/* V */}
                        <span className="text-sm font-semibold text-[#4a9c40] text-center">{row.victorias}</span>

                        {/* D */}
                        <span className="text-sm text-gray-400 text-center">{row.derrotas}</span>

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
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default RankingCategorias;
