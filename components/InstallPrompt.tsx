import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pwa_install_dismissed_until';
const DISMISS_DAYS = 30;

function isDismissed(): boolean {
  const until = localStorage.getItem(DISMISSED_KEY);
  if (!until) return false;
  return Date.now() < Number(until);
}

function saveDismissed() {
  const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
  localStorage.setItem(DISMISSED_KEY, String(until));
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

function isIOSSafari(): boolean {
  return isIOS() && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOS, setShowIOS] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (isDismissed()) return;

    if (isIOSSafari()) {
      setShowIOS(true);
      setShowBanner(true);
      setTimeout(() => setVisible(true), 50);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
      setTimeout(() => setVisible(true), 50);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const trackInstall = async (platform: 'android' | 'ios') => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;
    let userNombre: string | null = null;
    if (userId) {
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('nombre_completo')
        .eq('id', userId)
        .single();
      userNombre = perfil?.nombre_completo ?? null;
    }
    await supabase.from('pwa_installs').insert({
      platform,
      user_agent: navigator.userAgent,
      user_id: userId,
      user_nombre: userNombre,
    });
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        trackInstall('android');
        handleClose();
      }
    } catch (err) {
      console.error('[PWA] Error al mostrar prompt de instalación:', err);
    }
    setDeferredPrompt(null);
  };

  const handleClose = () => {
    setVisible(false);
    saveDismissed();
    setTimeout(() => setShowBanner(false), 300);
  };

  if (!showBanner) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4 pb-4 transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <img
            src="/logos/logo-symbol.png"
            alt="Tu Barrio"
            className="w-12 h-12 rounded-xl flex-shrink-0 object-cover"
          />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-gray-900 leading-tight">Tu Barrio</p>
            {showIOS ? (
              <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                Tocá el ícono{' '}
                <span className="inline-block align-middle text-blue-500 font-bold">⎋</span>{' '}
                de compartir y luego <strong>"Agregar a pantalla de inicio"</strong>
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                Instalá la app para acceder más rápido desde tu pantalla de inicio
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0 -mt-0.5 -mr-0.5 p-1"
            aria-label="Cerrar"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!showIOS && (
          <div className="flex gap-2 px-4 pb-4">
            <button
              onClick={handleClose}
              className="flex-1 py-2 rounded-xl text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Ahora no
            </button>
            <button
              onClick={handleInstall}
              className="flex-1 py-2 rounded-xl text-sm font-semibold text-black transition-colors"
              style={{ backgroundColor: '#6dec13' }}
            >
              Instalar
            </button>
          </div>
        )}

        {showIOS && (
          <div className="px-4 pb-4">
            <button
              onClick={() => { trackInstall('ios'); handleClose(); }}
              className="w-full py-2 rounded-xl text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Entendido
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InstallPrompt;
