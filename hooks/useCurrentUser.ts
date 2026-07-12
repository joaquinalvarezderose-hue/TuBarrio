import { useEffect, useState } from 'react';
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

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      let { data, error: authErr } = await supabase.auth.getUser();

      console.log('[useCurrentUser] getUser result:', { userId: data?.user?.id, authErr });

      if (authErr || !data?.user) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.user) {
          data = { user: refreshed.user } as typeof data;
          authErr = null;
        }
      }

      if (authErr) throw authErr;

      if (!data?.user) {
        console.log('[useCurrentUser] No user found');
        setAuthUser(null);
        // IMPORTANTE: NO borramos el perfil del cache aquí.
        // Si hay perfil en cache (usuario ya logueado antes), lo mantenemos disponible.
        // Esto permite que el app funcione aunque la sesión de Supabase se haya perdido.
        if (!perfil) {
          localStorage.removeItem(PERFIL_CACHE_KEY);
        }
        return;
      }

      const next: AuthUser = { id: data.user.id, email: data.user.email ?? null };
      console.log('[useCurrentUser] Auth user set:', next);
      setAuthUser(next);

      console.log('[useCurrentUser] Querying profile for user:', data.user.id);
      const { data: profileData, error: profileErr } = await supabase
        .from('perfiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      console.log('[useCurrentUser] Profile query result:', { profileData, profileErr });

      if (profileErr) throw profileErr;

      if (profileData) {
        console.log('[useCurrentUser] Setting perfil with rol:', profileData.rol);
        setPerfil(profileData);
        localStorage.setItem(PERFIL_CACHE_KEY, JSON.stringify(profileData));
      } else {
        console.log('[useCurrentUser] No profile data returned!');
        setPerfil(null);
        localStorage.removeItem(PERFIL_CACHE_KEY);
      }
    } catch (e) {
      console.error('[useCurrentUser] Error:', e);
      setError(e as Error);
      setAuthUser(null);
      setPerfil(null);
    } finally {
      setLoading(false);
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
