import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { LoginSchema, flattenZodErrors } from '../lib/schemas';
import Logo from '../components/Logo';

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

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
              direccion: pending.direccion || null,
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
        // Force reload using HashRouter format
        window.location.href = '/#/';
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
      if ((supabase as any).auth?.resetPasswordForEmail) {
        await (supabase as any).auth.resetPasswordForEmail(email);
        setInfo('Se envió un link de recuperación a tu correo.');
      } else if ((supabase as any).auth?.resetPasswordForEmail === undefined && (supabase as any).auth?.api?.resetPasswordForEmail) {
        // older sdk path
        await (supabase as any).auth.api.resetPasswordForEmail(email);
        setInfo('Se envió un link de recuperación a tu correo.');
      } else {
        setInfo('Pedir recuperación en el dashboard de Supabase si no recibís el email.');
      }
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
                <input id="password" name="password" placeholder="••••••••" required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-surface-variant border-none rounded-xl focus:ring-2 focus:ring-primary/20 text-on-surface text-sm transition-all" />
              </div>
            </div>

            {error && <div className="text-sm text-red-700 bg-red-50 p-2 rounded">{error}</div>}
            {info && <div className="text-sm text-green-700 bg-green-50 p-2 rounded">{info}</div>}

            <button type="submit" className="w-full bg-primary hover:bg-secondary text-on-primary-fixed font-headline font-bold py-4 rounded-xl shadow-md active:scale-95 transition-all duration-200 flex items-center justify-center gap-2">Ingresar <span className="material-symbols-outlined text-xl">login</span></button>
          </form>
        </div>

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
