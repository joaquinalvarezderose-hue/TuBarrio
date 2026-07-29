import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

// hoyos.mapa_url guarda un path relativo dentro del bucket privado
// "golf-mapas" (ej. "3/17.svg"), no una URL publica. Hay que
// descargarlo de forma autenticada (respeta la RLS del bucket, que
// solo deja ver el archivo a quien participa/administra el torneo
// que usa esa cancha) y convertirlo en un blob URL para el <img>.
export function useGolfMapaUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);

    if (!path) return;

    setLoading(true);
    (async () => {
      const { data, error } = await supabase.storage.from('golf-mapas').download(path);
      if (cancelled) return;
      if (!error && data) {
        objectUrl = URL.createObjectURL(data);
        setUrl(objectUrl);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return { url, loading };
}
