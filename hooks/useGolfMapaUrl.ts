import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

// hoyos.mapa_url guarda un path relativo dentro del bucket privado
// "golf-mapas" (ej. "3/17.svg"), no una URL publica. Hay que
// descargarlo de forma autenticada (respeta la RLS del bucket, que
// solo deja ver el archivo a quien participa/administra el torneo
// que usa esa cancha) y convertirlo en un blob URL para el <img>.
//
// Cache en memoria (module-level, fuera del ciclo de render) de
// path -> blob URL: GolfScorecard monta el mismo mapa_url en la vista
// compacta y en el modal fullscreen, y el jugador suele volver a un
// hoyo ya visto — sin esto, cada mount vuelve a descargar el mismo
// archivo del bucket. El modelo de seguridad no cambia: cada path
// sigue pasando por .download() autenticado la primera vez que se ve
// en la sesion: solo se evitan las descargas repetidas del mismo path.
const mapaCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 20;

function cacheMapaUrl(path: string, objectUrl: string) {
  if (mapaCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = mapaCache.keys().next().value;
    if (oldestKey) {
      URL.revokeObjectURL(mapaCache.get(oldestKey)!);
      mapaCache.delete(oldestKey);
    }
  }
  mapaCache.set(path, objectUrl);
}

export function useGolfMapaUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(path ? mapaCache.get(path) ?? null : null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }

    const cached = mapaCache.get(path);
    if (cached) {
      setUrl(cached);
      return;
    }

    let cancelled = false;
    setUrl(null);
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.storage.from('golf-mapas').download(path);
      if (cancelled) return;
      if (!error && data) {
        const objectUrl = URL.createObjectURL(data);
        cacheMapaUrl(path, objectUrl);
        setUrl(objectUrl);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      // El blob URL queda vivo en el cache compartido (no se revoca aca) para
      // que el proximo mount del mismo path lo reuse sin volver a pedirlo.
    };
  }, [path]);

  return { url, loading };
}
