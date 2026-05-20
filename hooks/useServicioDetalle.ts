import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Database } from '../types/database.types';

export type ServicioConStats =
  Database['public']['Views']['v_servicios_con_stats']['Row'];

export type Valoracion =
  Database['public']['Tables']['valoraciones_servicios']['Row'] & {
    perfiles: { nombre_completo: string | null } | null;
  };

interface UseServicioDetalleReturn {
  servicio: ServicioConStats | null;
  valoraciones: Valoracion[];
  miValoracion: Database['public']['Tables']['valoraciones_servicios']['Row'] | null;
  distribucion: Record<1 | 2 | 3 | 4 | 5, number>;
  loading: boolean;
  error: string | null;
  submitValoracion: (puntuacion: number, comentario: string) => Promise<void>;
  deleteValoracion: () => Promise<void>;
}

export function useServicioDetalle(servicioId: string): UseServicioDetalleReturn {
  const [servicio, setServicio] = useState<ServicioConStats | null>(null);
  const [valoraciones, setValoraciones] = useState<Valoracion[]>([]);
  const [miValoracion, setMiValoracion] = useState<
    Database['public']['Tables']['valoraciones_servicios']['Row'] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [{ data: userData }, { data: servicioData, error: sErr }] =
      await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('v_servicios_con_stats')
          .select('*')
          .eq('id', servicioId)
          .maybeSingle(),
      ]);

    if (sErr || !servicioData) {
      setError('No encontramos este proveedor.');
      setLoading(false);
      return;
    }

    setServicio(servicioData);

    const [{ data: reviewsData }, { data: miaData }] = await Promise.all([
      supabase
        .from('valoraciones_servicios')
        .select('*, perfiles(nombre_completo)')
        .eq('servicio_id', servicioId)
        .order('created_at', { ascending: false })
        .limit(50),
      userData?.user
        ? supabase
            .from('valoraciones_servicios')
            .select('*')
            .eq('servicio_id', servicioId)
            .eq('usuario_id', userData.user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    setValoraciones((reviewsData as unknown as Valoracion[]) ?? []);
    setMiValoracion(miaData ?? null);
    setLoading(false);
  }, [servicioId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const submitValoracion = useCallback(
    async (puntuacion: number, comentario: string) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const payload = {
        servicio_id: servicioId,
        usuario_id: userData.user.id,
        puntuacion,
        comentario: comentario.trim() || null,
      };

      if (miValoracion) {
        // Actualizar existente
        const { error: uErr } = await supabase
          .from('valoraciones_servicios')
          .update({ puntuacion, comentario: payload.comentario })
          .eq('id', miValoracion.id);
        if (uErr) throw new Error('No se pudo guardar tu valoración. Intentá de nuevo.');
      } else {
        // Insertar nueva
        const { error: iErr } = await supabase
          .from('valoraciones_servicios')
          .insert(payload);
        if (iErr) {
          if (iErr.code === '23505') {
            throw new Error('Ya valoraste este servicio. Podés editar tu valoración arriba.');
          }
          throw new Error('No se pudo guardar tu valoración. Intentá de nuevo.');
        }
      }

      await fetchData();
    },
    [servicioId, miValoracion, fetchData],
  );

  const deleteValoracion = useCallback(async () => {
    if (!miValoracion) return;
    const { error: dErr } = await supabase
      .from('valoraciones_servicios')
      .delete()
      .eq('id', miValoracion.id);
    if (dErr) throw new Error('No se pudo eliminar tu valoración. Intentá de nuevo.');
    await fetchData();
  }, [miValoracion, fetchData]);

  // Distribución de estrellas para la barra de ratings
  const distribucion = valoraciones.reduce(
    (acc, v) => {
      const p = v.puntuacion as 1 | 2 | 3 | 4 | 5;
      acc[p] = (acc[p] ?? 0) + 1;
      return acc;
    },
    { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>,
  );

  return {
    servicio,
    valoraciones,
    miValoracion,
    distribucion,
    loading,
    error,
    submitValoracion,
    deleteValoracion,
  };
}
