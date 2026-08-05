import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

export type RankingRow = {
  categoria: string;
  perfil_id: string;
  nombre_completo: string | null;
  partidos_jugados: number;
  victorias: number;
  derrotas: number;
  puntos: number;
  posicion: number;
};

/**
 * Fetch compartido de ranking_categorias_view, usado por RankingCategorias.tsx
 * (pantalla publica) y AdminPanel.tsx (preview de admin) — antes cada uno tenia
 * su propia copia identica del fetch + derivacion de categorias.
 *
 * ranking_categorias_view es un ranking historico cross-torneo (no tiene
 * torneo_id en su agregacion), asi que a diferencia del resto de las queries
 * del audit no tiene sentido "filtrar por torneo activo" aca — se trae
 * completa. EXPLAIN ANALYZE sobre la vista (2026-08-05, ~180 filas en
 * torneo_partidos_historial) muestra ~10ms de tiempo total con Seq Scan de
 * costo trivial: al volumen de datos actual no justifica un indice nuevo.
 */
export function useRankingCategorias(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;

  const [rows, setRows] = useState<RankingRow[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [categoriaActiva, setCategoriaActiva] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('ranking_categorias_view')
        .select('*')
        .order('categoria', { ascending: true })
        .order('posicion', { ascending: true });

      if (cancelled) return;
      if (err) {
        console.error('[useRankingCategorias] load error:', err);
        setError('No se pudo cargar el ranking. Intentá de nuevo más tarde.');
        setLoading(false);
        return;
      }

      const allRows = (data ?? []) as RankingRow[];
      const cats = Array.from(new Set(allRows.map((r) => r.categoria))).filter(Boolean);
      setRows(allRows);
      setCategorias(cats);
      setCategoriaActiva((prev) => (prev && cats.includes(prev) ? prev : cats[0] ?? ''));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { rows, categorias, categoriaActiva, setCategoriaActiva, loading, error };
}
