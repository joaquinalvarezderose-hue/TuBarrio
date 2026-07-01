import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { LoginSchema, flattenZodErrors } from '../lib/schemas';
import Logo from '../components/Logo';
import type { PendingIntent } from '../types/intent';

function traducirErrorSupabase(msg: string): string {
  if (!msg) return 'Error al iniciar sesión. Intentá de nuevo.';
  const m = msg.toLowerCase();
  if (/invalid login credentials/.test(m)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/.test(m)) return 'Debés confirmar tu correo antes de iniciar sesión.';
  if (/email rate limit|too many requests|rate limit/.test(m)) return 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.';
  if (/user not found/.test(m)) return 'No existe una cuenta con ese correo.';
  if (/network|fetch|connection/.test(m)) return 'Error de conexión. Verificá tu internet e intentá de nuevo.';
  return 'Error al iniciar sesión. Intentá de nuevo.';
}

interface LoginProps {
  onSuccess?: () => void;
}

const Login: React.FC<LoginProps> = ({ onSuccess }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const pendingIntent = (location.state as { intent?: PendingIntent } | null)?.intent;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const validation = LoginSchema.safeParse({ email, password });
    if (!validation.success) {
      const errors = flattenZodErrors(validation);
      setError(errors.email ?? errors.password ?? 'Datos inválidos');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: validation.data.email,
        password: validation.data.password,
      });
      if (error) throw error;
      if (data?.user) {
        const profile = await supabase.from('perfiles').select('*').eq('id', data.user.id).single();
        if (profile?.data) {
          localStorage.setItem('app_user', JSON.stringify(profile.data));
        } else {
          // Crear perfil automáticamente si no existe
          const meta = data.user.user_metadata || {};
          const pendingStr = localStorage.getItem('pending_profile');
          const pending = pendingStr ? JSON.parse(pendingStr) : {};
          const userName = meta.nombre_completo || pending.nombre_completo || data.user.email?.split('@')[0] || 'Usuario';
          const whatsappVal = meta.whatsapp || pending.whatsapp || null;
          const { data: newProfile, error: createError } = await supabase
            .from('perfiles')
            .insert({
              id: data.user.id,
              email: data.user.email,
              nombre_completo: userName,
              whatsapp: whatsappVal,
              barrio: pending.barrio || null,
              calle: pending.calle || null,
              numero_altura: pending.numero_altura || null,
              lote: pending.lote || null,
              localidad: pending.localidad || null,
            })
            .select('*')
            .single();

          if (createError) {
            console.error('[LOGIN] Error creating profile:', createError);
            const fallbackUser = { id: data.user.id, email: data.user.email };
            localStorage.setItem('app_user', JSON.stringify(fallbackUser));
          } else {
            localStorage.setItem('app_user', JSON.stringify(newProfile));
            localStorage.removeItem('pending_profile');
          }
        }
        if (onSuccess) onSuccess();
        if (pendingIntent?.type === 'tournament-signup') {
          navigate('/payment', { state: { tournament: pendingIntent.payload.tournament }, replace: true });
        } else if (pendingIntent?.type === 'service-hire') {
          navigate(`/service/${pendingIntent.payload.serviceId}`, { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }
    } catch (err: any) {
      console.error('login error', err);
      setError(traducirErrorSupabase(err?.message));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!email) {
      setError('Ingresá tu email para recibir el link de recuperación.');
      return;
    }
    setError(null);
    setInfo(null);
    try {
      const redirectTo = window.location.origin;

      await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      setInfo('Se envió un link de recuperación a tu correo.');
    } catch (err: any) {
      console.error('reset error', err);
      setError(err?.message || 'Error al enviar recuperación');
    }
  };

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col items-center justify-center p-6 selection:bg-primary selection:text-on-primary">
      <header className="mb-12 text-center">
        <Logo variant="primary" className="h-[120px] w-auto mx-auto mb-4" />
        <p className="font-body text-on-surface-variant text-sm tracking-tight">Tu comunidad, a un toque de distancia.</p>
      </header>

      <main className="w-full max-w-[400px]">
        <div className="bg-surface rounded-xl shadow-sm border border-outline-variant p-8 mb-8">
          <form className="space-y-6" onSubmit={handleLogin}>
            <div className="space-y-2">
              <label className="font-label text-[10px] font-bold tracking-widest uppercase text-on-surface-variant px-1" htmlFor="email">Correo Electrónico</label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors">mail</span>
                <input id="email" name="email" placeholder="nombre@ejemplo.com" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-surface-variant border-none rounded-xl focus:ring-2 focus:ring-primary/20 text-on-surface text-sm transition-all" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="font-label text-[10px] font-bold tracking-widest uppercase text-on-surface-variant" htmlFor="password">Contraseña</label>
                <button type="button" onClick={handleReset} className="font-body text-[11px] text-primary font-semibold hover:underline">¿Olvidaste tu contraseña?</button>
              </div>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors">lock</span>
                <input id="password" name="password" placeholder="••••••••" required type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-12 pr-12 py-4 bg-surface-variant border-none rounded-xl focus:ring-2 focus:ring-primary/20 text-on-surface text-sm transition-all" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors" tabIndex={-1} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  <span className="material-symbols-outlined text-xl">{showPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>

            {error && <div className="text-sm text-red-700 bg-red-50 p-2 rounded">{error}</div>}
            {info && <div className="text-sm text-green-700 bg-green-50 p-2 rounded">{info}</div>}

            <button type="submit" className="w-full bg-primary hover:bg-secondary text-on-primary-fixed font-headline font-bold py-4 rounded-xl shadow-md active:scale-95 transition-all duration-200 flex items-center justify-center gap-2">Ingresar <span className="material-symbols-outlined text-xl">login</span></button>
          </form>
        </div>

        <div className="relative flex items-center gap-4 my-2">
          <div className="flex-1 h-px bg-outline-variant"></div>
          <span className="text-xs text-on-surface-variant font-medium">o continuá con</span>
          <div className="flex-1 h-px bg-outline-variant"></div>
        </div>

        <button
          type="button"
          onClick={async () => {
            if (pendingIntent) {
              localStorage.setItem('pending_intent', JSON.stringify(pendingIntent));
            }
            await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: window.location.origin },
            });
          }}
          className="w-full flex items-center justify-center gap-3 py-4 px-4 bg-surface border border-outline-variant text-on-surface font-headline font-semibold rounded-xl hover:bg-surface-variant transition-colors mb-6"
        >
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continuar con Google
        </button>

        <div className="text-center space-y-4">
          <p className="font-body text-on-surface-variant text-sm">¿Aún no tenés una cuenta?</p>
          <Link to="/register" className="w-full inline-block bg-surface border border-outline-variant text-on-surface font-headline font-semibold py-4 rounded-xl hover:bg-surface-variant transition-colors text-center">Crear cuenta nueva <span className="material-symbols-outlined text-xl align-middle">person_add</span></Link>
        </div>
      </main>

      <footer className="mt-auto pt-12">
        <div className="flex items-center gap-1 opacity-20 grayscale">
          <div className="w-2 h-2 rounded-full bg-primary"></div>
          <div className="w-2 h-2 rounded-full bg-primary"></div>
          <div className="w-2 h-2 rounded-full bg-primary"></div>
        </div>
      </footer>
    </div>
  );
};

export default Login;
