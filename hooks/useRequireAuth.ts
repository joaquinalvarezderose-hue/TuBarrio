import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCurrentUser } from './useCurrentUser';
import type { PendingIntent } from '../types/intent';

export function useRequireAuth() {
  const { authUser, perfil } = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (intent: PendingIntent, action: () => void) => {
      if (!authUser) {
        navigate('/register', { state: { from: location.pathname, intent } });
        return;
      }

      if (intent.type === 'tournament-signup' && (!perfil?.whatsapp || !perfil?.calle)) {
        navigate('/complete-profile', { state: { intent } });
        return;
      }

      action();
    },
    [authUser, perfil, navigate, location],
  );
}
