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
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;

      if (!data?.user) {
        setAuthUser(null);
        setPerfil(null);
        return;
      }

      const next: AuthUser = { id: data.user.id, email: data.user.email ?? null };
      setAuthUser(next);

      const { data: profileData, error: profileErr } = await supabase
        .from('perfiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileErr) throw profileErr;
      setPerfil(profileData ?? null);
    } catch (e) {
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
