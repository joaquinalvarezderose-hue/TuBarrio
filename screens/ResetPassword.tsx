import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import Logo from '../components/Logo';

function traducirErrorSupabase(msg: string): string {
  if (!msg) return 'Error al cambiar contraseña. Intentá de nuevo.';
  const m = msg.toLowerCase();
  if (/invalid session|session expired|token expired|invalid token/.test(m)) return 'El link de recuperación expiró. Pedí uno nuevo en el login.';
  if (/password.*character|character.*password|weak.?password|password.*weak|password.*strong|password.*requirements/.test(m)) return 'La contraseña debe tener mín. 12 caracteres, mayúscula, minúscula, número y símbolo (!@#$...).';
  if (/password does not match|passwords do not match|passwords.*match/.test(m)) return 'Las contraseñas no coinciden.';
  return 'Error al cambiar contraseña. Intentá de nuevo.';
}

const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        clearTimeout(timer);
        setSessionValid(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        setSessionValid(true);
        return;
      }
      timer = setTimeout(() => {
        if (!mounted) return;
        setSessionValid((prev) => (prev === null ? false : prev));
        setError('No encontramos tu sesión de recuperación. Pedí un link nuevo en el login.');
      }, 8000);
    });

    return () => {
      mounted = false;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password || !confirmPassword) {
      setError('Ingresá la nueva contraseña en ambos campos.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    if (password.length < 12) {
      setError('La contraseña debe tener mín. 12 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(traducirErrorSupabase(updateError.message));
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 2000);
    } catch (err: any) {
      console.error('reset password error', err);
      setError(traducirErrorSupabase(err?.message));
      setLoading(false);
    }
  };

  if (sessionValid === null) {
    return (
      <div className="bg-background text-on-background min-h-screen flex flex-col items-center justify-center p-6 selection:bg-primary selection:text-on-primary">
        <div className="text-on-surface-variant text-sm">Verificando sesión…</div>
      </div>
    );
  }

  if (!sessionValid) {
    return (
      <div className="bg-background text-on-background min-h-screen flex flex-col items-center justify-center p-6 selection:bg-primary selection:text-on-primary">
        <header className="mb-12 text-center">
          <Logo variant="primary" className="h-[120px] w-auto mx-auto mb-4" />
          <p className="font-body text-on-surface-variant text-sm tracking-tight">Tu comunidad, a un toque de distancia.</p>
        </header>

        <main className="w-full max-w-[400px]">
          <div className="bg-surface rounded-xl shadow-sm border border-outline-variant p-8">
            <div className="text-center">
              <h1 className="font-headline text-lg mb-4">Link expirado</h1>
              <p className="text-on-surface-variant text-sm mb-6">{error || 'El link de recuperación ya no es válido.'}</p>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-primary text-on-primary font-button py-4 rounded-xl hover:bg-primary/90 transition-colors"
              >
                Volver al login
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col items-center justify-center p-6 selection:bg-primary selection:text-on-primary">
      <header className="mb-12 text-center">
        <Logo variant="primary" className="h-[120px] w-auto mx-auto mb-4" />
        <p className="font-body text-on-surface-variant text-sm tracking-tight">Tu comunidad, a un toque de distancia.</p>
      </header>

      <main className="w-full max-w-[400px]">
        <div className="bg-surface rounded-xl shadow-sm border border-outline-variant p-8 mb-8">
          <h1 className="font-headline text-lg mb-8 text-center">Nueva contraseña</h1>

          {success ? (
            <div className="text-center">
              <span className="material-symbols-outlined text-5xl text-primary mb-4 block">check_circle</span>
              <p className="font-headline text-lg mb-2">¡Contraseña actualizada!</p>
              <p className="text-on-surface-variant text-sm">Redirigiendo al login…</p>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-6">
              <div className="space-y-2">
                <label className="font-label text-[10px] font-bold tracking-widest uppercase text-on-surface-variant px-1" htmlFor="password">
                  Nueva contraseña
                </label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors">lock</span>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-12 py-4 bg-surface-variant border-none rounded-xl focus:ring-2 focus:ring-primary/20 text-on-surface text-sm transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors"
                  >
                    <span className="material-symbols-outlined text-xl">{showPassword ? 'visibility' : 'visibility_off'}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="font-label text-[10px] font-bold tracking-widest uppercase text-on-surface-variant px-1" htmlFor="confirmPassword">
                  Confirmar contraseña
                </label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors">lock</span>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="••••••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-12 pr-12 py-4 bg-surface-variant border-none rounded-xl focus:ring-2 focus:ring-primary/20 text-on-surface text-sm transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors"
                  >
                    <span className="material-symbols-outlined text-xl">{showConfirm ? 'visibility' : 'visibility_off'}</span>
                  </button>
                </div>
              </div>

              {error && <div className="bg-error/10 text-error text-xs px-4 py-3 rounded-lg">{error}</div>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-on-primary font-button py-4 rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Actualizando…' : 'Actualizar contraseña'}
              </button>

              <p className="text-center text-on-surface-variant text-xs">
                Mín. 12 caracteres, mayúscula, minúscula, número y símbolo (!@#$...)
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};

export default ResetPassword;
