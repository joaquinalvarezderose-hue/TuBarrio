import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

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
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).auth.signInWithPassword({ email, password });
      console.log('supabase signIn', { data, error });
      if (error) throw error;
      if (data?.user) {
        console.log('[LOGIN] Supabase auth user:', data.user.id, data.user.email);
        const profile = await supabase.from('perfiles').select('*').eq('id', data.user.id).single();
        console.log('[LOGIN] Profile from DB:', profile.data);
        if (profile?.data) {
          localStorage.setItem('app_user', JSON.stringify(profile.data));
          console.log('[LOGIN] Saved profile.data to app_user:', profile.data);
        } else {
          const fallbackUser = { id: data.user.id, email: data.user.email };
          localStorage.setItem('app_user', JSON.stringify(fallbackUser));
          console.log('[LOGIN] Saved fallback to app_user:', fallbackUser);
        }
        if (onSuccess) onSuccess();
        // Force reload using HashRouter format
        window.location.href = '/#/';
      }
    } catch (err: any) {
      console.error('login error', err);
      setError(err?.message || 'Error al iniciar sesión');
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
        <div className="inline-flex items-center justify-center w-20 h-20 bg-primary/10 rounded-full mb-6">
          <span className="material-symbols-outlined text-primary text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>
            apartment
          </span>
        </div>
        <h1 className="font-headline font-black text-4xl tracking-tighter text-on-background mb-2">TuBarrio</h1>
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
