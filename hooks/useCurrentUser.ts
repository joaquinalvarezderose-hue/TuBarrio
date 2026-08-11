import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { isAuthSessionMissingError } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import type { Database } from '../types/database.types';

// Solo las columnas que efectivamente se leen en la app — evita traer created_at/
// updated_at (sin uso en UI) en la consulta que corre en cada carga inicial.
export type Perfil = Pick<
  Database['public']['Tables']['perfiles']['Row'],
  | 'id'
  | 'email'
  | 'nombre_completo'
  | 'whatsapp'
  | 'rol'
  | 'handicap'
  | 'barrio'
  | 'sector'
  | 'calle'
  | 'numero_altura'
  | 'lote'
  | 'localidad'
>;

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

function useCurrentUserState(): CurrentUserState {
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

      // Sin sesion en absoluto (visitante nuevo/deslogueado): no hay nada que
      // refrescar, evita un segundo round-trip de red que iba a fallar igual.
      if (authErr && isAuthSessionMissingError(authErr)) {
        if (requestId !== requestIdRef.current) return;
        setAuthUser(null);
        setPerfil(null);
        localStorage.removeItem(PERFIL_CACHE_KEY);
        return;
      }

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
        .select('id, email, nombre_completo, whatsapp, rol, handicap, barrio, sector, calle, numero_altura, lote, localidad')
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

const CurrentUserContext = createContext<CurrentUserState | null>(null);

/**
 * Corre useCurrentUserState() una unica vez para toda la app. Sin esto, cada
 * pantalla/hook que llama useCurrentUser() (Dashboard, Profile, AdminPanel,
 * useRequireRole, useRequireAuth, ...) dispara su propia ronda independiente
 * de getUser()/refreshSession()/select perfiles — en la carga inicial de "/"
 * por ejemplo, App.tsx y Dashboard.tsx corrian esto por duplicado en paralelo,
 * compitiendo por el mismo refresh de sesion (el cliente de Supabase serializa
 * refreshes concurrentes) y multiplicando la demora hasta mostrar contenido.
 */
export const CurrentUserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const state = useCurrentUserState();
  return React.createElement(CurrentUserContext.Provider, { value: state }, children);
};

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
  const ctx = useContext(CurrentUserContext);
  if (!ctx) {
    throw new Error('useCurrentUser() debe usarse dentro de <CurrentUserProvider>');
  }
  return ctx;
}
