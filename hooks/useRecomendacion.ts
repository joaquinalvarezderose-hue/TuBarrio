import { useState } from 'react';
import { supabase } from '../services/supabaseClient';

interface RecomendacionData {
  nombre_proveedor: string;
  rubro: string;
  telefono: string;
  motivo: string;
}

interface UseRecomendacionReturn {
  submit: (data: RecomendacionData) => Promise<void>;
  loading: boolean;
}

export function useRecomendacion(): UseRecomendacionReturn {
  const [loading, setLoading] = useState(false);

  const submit = async (data: RecomendacionData) => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        throw new Error('Necesitás iniciar sesión para enviar una recomendación.');
      }

      const payload = {
        usuario_id: userData.user.id,
        nombre_proveedor: data.nombre_proveedor.trim(),
        rubro: data.rubro,
        telefono: data.telefono.trim(),
        motivo: data.motivo.trim() || null,
      };

      const { error } = await supabase
        .from('recomendaciones_servicios')
        .insert(payload);

      if (error) {
        if (error.code === '23514') {
          throw new Error('Algunos datos no son válidos. Revisá el formulario y volvé a intentar.');
        }
        throw new Error('No se pudo enviar tu recomendación. Intentá de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  return { submit, loading };
}
