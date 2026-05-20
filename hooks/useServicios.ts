import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Database } from '../types/database.types';

export type ServicioConStats =
  Database['public']['Views']['v_servicios_con_stats']['Row'];

interface UseServiciosParams {
  busqueda?: string;
  categoria?: string | null;
}

interface UseServiciosReturn {
  servicios: ServicioConStats[];
  recomendados: ServicioConStats[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const DEBOUNCE_MS = 300;
const LIMIT = 50;

export function useServicios({
  busqueda = '',
  categoria = null,
}: UseServiciosParams = {}): UseServiciosReturn {
  const [servicios, setServicios] = useState<ServicioConStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const refetch = useCallback(() => setFetchTrigger((n) => n + 1), []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('v_servicios_con_stats')
        .select('*')
        .order('promedio_rating', { ascending: false })
        .limit(LIMIT);

      if (categoria) {
        query = query.eq('categoria', categoria);
      }

      if (busqueda.trim()) {
        query = query.ilike('titulo', `%${busqueda.trim()}%`);
      }

      const { data, error: supabaseError } = await query;

      if (supabaseError) {
        setError('No pudimos cargar los servicios. Verificá tu conexión.');
        setServicios([]);
      } else {
        setServicios(data ?? []);
        setError(null);
      }

      setLoading(false);
    }, busqueda ? DEBOUNCE_MS : 0);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [busqueda, categoria, fetchTrigger]);

  // Top 5 con mejor rating para el carrusel de Recomendados
  const recomendados = servicios
    .filter((s) => s.total_valoraciones > 0)
    .slice(0, 5);

  return { servicios, recomendados, loading, error, refetch };
}
