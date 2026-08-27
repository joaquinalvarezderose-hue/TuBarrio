import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { buildH2HLookup, sortByTiebreak } from '../utils/tournamentLogic';

export type Enfrentamiento = { oponente_perfil_id: string; gano: boolean };

export type RankingRow = {
  categoria: string;
  perfil_id: string;
  nombre_completo: string | null;
  partidos_jugados: number;
  victorias: number;
  derrotas: number;
  puntos: number;
  sets_ganados: number;
  sets_perdidos: number;
  games_ganados: number;
  games_perdidos: number;
  enfrentamientos: Enfrentamiento[];
  posicion: number;
  tiebreakerReason: string | null;
};

// Reordena las filas de una categoria con el mismo criterio de desempate que
// la Tabla de Posiciones (ver utils/tournamentLogic.ts::sortByTiebreak):
// pts -> dif. sets -> sets ganados -> H2H -> dif. games. El H2H se arma a
// partir de "enfrentamientos", que ya viene resuelto por la vista (incluye
// dobles: cada jugador contra cada integrante del equipo rival).
function reorderCategoria(catRows: RankingRow[]): RankingRow[] {
  const pairs = catRows.flatMap((r) =>
    (r.enfrentamientos ?? [])
      .filter((e) => e.gano)
      .map((e) => ({ winnerId: r.perfil_id, loserId: e.oponente_perfil_id }))
  );
  const getH2H = buildH2HLookup(pairs);
  const sorted = sortByTiebreak(
    catRows.map((r) => ({
      id: r.perfil_id,
      pts: r.puntos,
      setsWon: r.sets_ganados,
      setsLost: r.sets_perdidos,
      gamesWon: r.games_ganados,
      gamesLost: r.games_perdidos,
    })),
    getH2H
  );
  const byId = new Map(catRows.map((r) => [r.perfil_id, r]));
  return sorted.map((s, idx) => ({
    ...byId.get(s.id)!,
    posicion: idx + 1,
    tiebreakerReason: s.tiebreakerReason,
  }));
}

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
        .order('categoria', { ascending: true });

      if (cancelled) return;
      if (err) {
        console.error('[useRankingCategorias] load error:', err);
        setError('No se pudo cargar el ranking. Intentá de nuevo más tarde.');
        setLoading(false);
        return;
      }

      const rawRows = (data ?? []) as RankingRow[];
      const cats = Array.from(new Set(rawRows.map((r) => r.categoria))).filter(Boolean);
      const allRows = cats.flatMap((cat) => reorderCategoria(rawRows.filter((r) => r.categoria === cat)));
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
