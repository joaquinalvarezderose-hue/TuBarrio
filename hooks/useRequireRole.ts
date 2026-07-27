import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser, type CurrentUserState } from './useCurrentUser';

export interface RequireRoleState extends CurrentUserState {
  /** true una vez que perfil esta cargado y su rol esta en la lista permitida */
  hasAccess: boolean;
}

/**
 * Reemplaza el patron duplicado de dos useEffect (uno para auth, uno para
 * rol) que hoy vive por separado en AdminPanel.tsx y AdminPartidos.tsx.
 * Redirige a /login si no hay sesion, y a redirectTo si el rol no matchea.
 */
export function useRequireRole(
  allowedRoles: string[],
  redirectTo: string = '/tournaments'
): RequireRoleState {
  const navigate = useNavigate();
  const state = useCurrentUser();
  const { authUser, perfil, loading } = state;

  useEffect(() => {
    if (!loading && !authUser) {
      navigate('/login', { replace: true });
    }
  }, [loading, authUser, navigate]);

  useEffect(() => {
    if (!loading && perfil && !allowedRoles.includes(perfil.rol ?? '')) {
      navigate(redirectTo, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, perfil, navigate, redirectTo]);

  const hasAccess = !!perfil && allowedRoles.includes(perfil.rol ?? '');

  return { ...state, hasAccess };
}
