import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { verifyAddress } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';

interface RegisterProps {
  onComplete: () => void;
}

const Register: React.FC<RegisterProps> = ({ onComplete }) => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [verifiedAddress, setVerifiedAddress] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});

  const handleVerify = async () => {
    console.log('handleVerify called', { address });
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const result = await verifyAddress(address);
      setVerifiedAddress(result.text);
    } catch (err) {
      setError("No pudimos verificar la dirección. Intenta ser más específico.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    console.log('handleRegister called', { name, email, password, confirmPassword, address, whatsapp, terms });
    // Client-side validation
    setError(null);
    setFieldErrors({});
    const errors: { [k: string]: string } = {};
    if (!name || name.trim().length < 3) errors.name = 'Ingresa tu nombre completo (mín. 3 caracteres).';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Ingresa un correo válido.';
    if (!password || password.length < 6) errors.password = 'La contraseña debe tener al menos 6 caracteres.';
    if (!confirmPassword || confirmPassword !== password) errors.confirmPassword = 'Las contraseñas no coinciden.';
    if (!terms) errors.terms = 'Debes aceptar los términos y condiciones.';
    if (!address || address.trim().length < 5) errors.address = 'Ingresa una dirección válida.';
    if (whatsapp && !/^[+0-9()\s-]{7,}$/.test(whatsapp)) errors.whatsapp = 'Ingresa un número de WhatsApp válido.';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError('Por favor corrige los campos indicados.');
      return;
    }

    setLoading(true);
    try {
      // Intentar registrar con Supabase; si falla (config), usar fallback local (MVP)
      if (supabase && typeof (supabase as any).auth?.signUp === 'function') {
        const { data: authData, error: authError } = await (supabase as any).auth.signUp({ email, password });
        console.log('supabase signUp result', { authData, authError });

        // If the user already exists in Auth, try signing in with the provided password
        if (authError && /already registered/i.test(authError.message || '')) {
          console.log('Usuario ya registrado en Auth, intentando signInWithPassword...');
          const { data: signInData, error: signInError } = await (supabase as any).auth.signInWithPassword({ email, password });
          console.log('supabase signIn result', { signInData, signInError });
          if (signInError) throw signInError;

          if (signInData?.user) {
            const insertResponse = await supabase
              .from('perfiles')
              .insert([
                {
                  id: signInData.user.id,
                  nombre_completo: name,
                  whatsapp: whatsapp || null,
                  direccion: verifiedAddress || address,
                  creado_en: new Date().toISOString(),
                },
              ])
              .select();
            console.log('supabase insert response', insertResponse);
            const dbError = (insertResponse as any).error;
            if (dbError) throw dbError;
            // If server returned no data, try to fetch the row by id to confirm
            if (!(insertResponse as any).data) {
              const { data: fetched, error: fetchErr } = await supabase
                .from('perfiles')
                .select('*')
                .eq('id', signInData.user.id)
                .single();
              console.log('fetched profile after insert (signin path)', { fetched, fetchErr });
            }
          }
        } else {
          if (authError) throw authError;

          if (authData?.user) {
            const insertResponse = await supabase
              .from('perfiles')
              .insert([
                {
                  id: authData.user.id,
                  nombre_completo: name,
                  whatsapp: whatsapp || null,
                  direccion: verifiedAddress || address,
                  creado_en: new Date().toISOString(),
                },
              ])
              .select();
            console.log('supabase insert response', insertResponse);
            const dbError = (insertResponse as any).error;
            if (dbError) throw dbError;
            if (!(insertResponse as any).data) {
              const { data: fetched, error: fetchErr } = await supabase
                .from('perfiles')
                .select('*')
                .eq('id', authData.user.id)
                .single();
              console.log('fetched profile after insert (signup path)', { fetched, fetchErr });
            }
          } else {
            console.log('No auth user returned from signUp; check Supabase auth settings (email confirmations, etc.)');
          }
        }
      } else {
        // Fallback: persist minimal user locally
        const localUser = { id: `local-${Date.now()}`, email, name, address: verifiedAddress || address };
        localStorage.setItem('app_user', JSON.stringify(localUser));
      }

      if (onComplete) onComplete();
      navigate('/');
    } catch (err: any) {
      // Surface error message for debugging
      console.error('register error', err);
      const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
      setError(msg || 'Error al registrarse');

      // If supabase not configured or insertion failed, still offer fallback
      try {
        const localUser = { id: `local-${Date.now()}`, email, name, address: verifiedAddress || address };
        localStorage.setItem('app_user', JSON.stringify(localUser));
        if (onComplete) onComplete();
        navigate('/');
      } catch (e) {
        console.error('fallback error', e);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface-container-low text-on-surface min-h-screen flex flex-col">
      <header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-outline-variant shadow-sm h-16 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-2xl">nearby</span>
          <span className="font-display font-black tracking-tighter uppercase text-lg text-secondary">TuBarrio</span>
        </div>
        <button className="p-2 hover:bg-surface-variant rounded-full transition-colors active:scale-95 duration-200">
          <span className="material-symbols-outlined text-on-surface-variant">help_outline</span>
        </button>
      </header>

      <main className="flex-grow flex items-center justify-center pt-20 pb-10 px-6">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="relative inline-block">
              <div className="absolute -inset-1 bg-gradient-to-tr from-primary to-secondary opacity-20 blur-xl rounded-full"></div>
              <div className="relative bg-white p-4 rounded-3xl shadow-md border border-outline-variant">
                <span className="material-symbols-outlined text-5xl text-primary">person_add</span>
              </div>
            </div>
            <h1 className="mt-6 text-3xl font-black tracking-tight text-secondary">Creá tu cuenta</h1>
            <p className="mt-2 text-on-surface-variant text-sm">Unite a la comunidad de TuBarrio hoy mismo.</p>
          </div>

          {error && (
            <div className="p-3 mb-4 text-sm text-red-500 bg-red-50 rounded-lg">{error}</div>
          )}

          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleRegister(); }}>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium tracking-widest uppercase text-on-surface-variant ml-1">Nombre Completo</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-xl">person</span>
                  <input
                    id="full_name"
                    type="text"
                    className="w-full pl-11 pr-4 py-3 bg-white border border-outline rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                    placeholder="Ej. Julian Alvarez"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  {fieldErrors.name && <p className="text-xs text-red-600 mt-1 ml-1">{fieldErrors.name}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium tracking-widest uppercase text-on-surface-variant ml-1">Email</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-xl">mail</span>
                  <input
                    id="email"
                    type="email"
                    className="w-full pl-11 pr-4 py-3 bg-white border border-outline rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                    placeholder="usuario@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  {fieldErrors.email && <p className="text-xs text-red-600 mt-1 ml-1">{fieldErrors.email}</p>}
                </div>
              </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium tracking-widest uppercase text-on-surface-variant ml-1">WhatsApp</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-xl">call</span>
                    <input
                      id="whatsapp"
                      type="tel"
                      className="w-full pl-11 pr-4 py-3 bg-white border border-outline rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                      placeholder="+54 9 11 1234-5678"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                    />
                    {fieldErrors.whatsapp && <p className="text-xs text-red-600 mt-1 ml-1">{fieldErrors.whatsapp}</p>}
                  </div>
                </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium tracking-widest uppercase text-on-surface-variant ml-1">Contraseña</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-xl">lock</span>
                  <input
                    id="password"
                    type="password"
                    className="w-full pl-11 pr-11 py-3 bg-white border border-outline rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {fieldErrors.password && <p className="text-xs text-red-600 mt-1 ml-1">{fieldErrors.password}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium tracking-widest uppercase text-on-surface-variant ml-1">Confirmar Contraseña</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-xl">lock_reset</span>
                  <input
                    id="confirm_password"
                    type="password"
                    className="w-full pl-11 pr-4 py-3 bg-white border border-outline rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                {fieldErrors.confirmPassword && <p className="text-xs text-red-600 mt-1 ml-1">{fieldErrors.confirmPassword}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium tracking-widest uppercase text-on-surface-variant ml-1">Dirección (en el barrio)</label>
                <div className="relative flex items-center gap-2">
                  <input
                    type="text"
                    className="flex-1 pl-4 py-3 bg-white border border-outline rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Calle y Nro..."
                  />
                  <button type="button" onClick={handleVerify} disabled={loading} className="px-4 py-2 bg-gray-800 text-white rounded-xl text-sm">Verificar</button>
                </div>
                {verifiedAddress && <p className="mt-1 text-xs text-green-600">✓ {verifiedAddress}</p>}
                {fieldErrors.address && <p className="text-xs text-red-600 mt-1 ml-1">{fieldErrors.address}</p>}
              </div>
            </div>

            <div className="flex items-start gap-3 py-2">
              <div className="flex items-center h-5">
                <input id="terms" name="terms" type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="h-5 w-5 rounded border-outline text-primary focus:ring-primary" />
              </div>
              <label className="text-xs text-on-surface-variant leading-tight" htmlFor="terms">Acepto los <span className="text-primary font-bold">términos y condiciones</span> y la política de privacidad de TuBarrio.</label>
            </div>
            {fieldErrors.terms && <p className="text-xs text-red-600 mt-1">{fieldErrors.terms}</p>}

            <button className="w-full bg-primary hover:bg-secondary text-on-primary-fixed font-bold py-4 rounded-xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4" type="submit" disabled={loading}>
              <span>{loading ? 'Procesando...' : 'Registrarme'}</span>
              <span className="material-symbols-outlined text-xl">arrow_forward</span>
            </button>

            <div className="text-center pt-6">
              <p className="text-sm text-on-surface-variant">Ya tengo cuenta, <Link to="/login" className="text-primary font-bold">iniciar sesión</Link></p>
            </div>
          </form>

          <div className="mt-10">
            <div className="relative mb-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-outline"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-widest">
                <span className="bg-white px-4 text-on-surface-variant">O continuar con</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button className="flex items-center justify-center gap-2 py-3 px-4 bg-white border border-outline rounded-xl hover:bg-surface transition-colors shadow-sm">
                <img alt="Google" className="w-5 h-5" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDFFPCKxti-8bFF8pc3IPzMTTUmkPCa9Xy1ntUE17CM4105dl3I9c62pkgRiKZHUigEzhWL9nL2C6fpYy-2Hg1Z4o4yvFeiGLQaHIC6qiMRFy69NYH9oH5eni9FLs-YAbUDzo1xtT8e_wo9h3QizD5jB3yFjSWM-SRW3J0hfTwv-CEm7GtIXuT-VZ57fTKld3tQ_jbdo4z43kvn8SohEKtk0ipdKisSRwrz5k_HES5BIWUFMwyWlU9ra1YdEjOwJvaMyiw-Xwl9jT8" />
                <span className="text-sm font-medium">Google</span>
              </button>
              <button className="flex items-center justify-center gap-2 py-3 px-4 bg-white border border-outline rounded-xl hover:bg-surface transition-colors shadow-sm">
                <span className="material-symbols-outlined text-xl text-blue-600">social_leaderboard</span>
                <span className="text-sm font-medium">Facebook</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-auto py-6 text-center">
        <p className="text-[10px] text-on-surface-variant font-medium tracking-widest uppercase opacity-50">TuBarrio © 2024 - Buenos Aires, Argentina</p>
      </footer>
    </div>
  );
};

export default Register;