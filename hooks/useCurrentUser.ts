import { useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Database } from '../types/database.types';

export type Perfil = Database['public']['Tables']['perfiles']['Row'];

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface CurrentUserState {
  authUser: AuthUser | null;
  perfil: Perfil | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

const PERFIL_CACHE_KEY = 'tubarrio_perfil_cache';

function readPerfilCache(): Perfil | null {
  try {
    const raw = localStorage.getItem(PERFIL_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Perfil) : null;
  } catch {
    return null;
  }
}

/**
 * Fuente única de verdad para el usuario autenticado actual.
 *
 * Usa supabase.auth.getUser() — que valida el JWT contra el servidor — en lugar de
 * confiar en localStorage. Esto evita que un atacante con DevTools / XSS pueda
 * suplantar la identidad modificando localStorage['app_user'].
 *
 * El perfil sigue siendo legible por RLS: solo el dueño + admins ven datos completos.
 */
export function useCurrentUser(): CurrentUserState {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(readPerfilCache);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const requestIdRef = useRef(0);

  const load = async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      let { data, error: authErr } = await supabase.auth.getUser();

      if (authErr || !data?.user) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.user) {
          data = { user: refreshed.user } as typeof data;
          authErr = null;
        }
      }

      if (authErr) throw authErr;

      if (!data?.user) {
        if (requestId !== requestIdRef.current) return;
        setAuthUser(null);
        setPerfil(null);
        localStorage.removeItem(PERFIL_CACHE_KEY);
        return;
      }

      const next: AuthUser = { id: data.user.id, email: data.user.email ?? null };

      const { data: profileData, error: profileErr } = await supabase
        .from('perfiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileErr) throw profileErr;

      // Descartar esta respuesta si mientras tanto se disparó una llamada a load() más
      // reciente (p. ej. signUp() + signInWithPassword() emiten dos eventos SIGNED_IN
      // seguidos durante el registro) — evita pisar un perfil completo con uno parcial.
      if (requestId !== requestIdRef.current) return;

      setAuthUser(next);

      if (profileData) {
        setPerfil(profileData);
        localStorage.setItem(PERFIL_CACHE_KEY, JSON.stringify(profileData));
      } else {
        setPerfil(null);
        localStorage.removeItem(PERFIL_CACHE_KEY);
      }
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      console.error('[useCurrentUser] Error:', e);
      setError(e as Error);
      setAuthUser(null);
      setPerfil(null);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (cancelled) return;
      await load();
    })();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (!session) {
        setAuthUser(null);
        setPerfil(null);
        setLoading(false);
      } else {
        void load();
      }
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { authUser, perfil, loading, error, refresh: load };
}
