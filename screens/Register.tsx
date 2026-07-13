import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import Logo from '../components/Logo';
import {
  RegisterSchema,
  flattenZodErrors,
  normalizeWhatsApp,
  COUNTRY_CODES,
  BARRIOS,
  LOCALIDADES,
  SECTORES_CANTON,
  type Barrio,
  type Localidad,
  type SectorCanton,
} from '../lib/schemas';
import type { PendingIntent } from '../types/intent';

function traducirErrorSupabase(msg: string): string {
  if (!msg) return 'Error al registrarse. Intentá de nuevo.';
  const m = msg.toLowerCase();
  if (/already registered/.test(m)) return 'Este correo ya está registrado.';
  if (/invalid login credentials/.test(m)) return 'Correo o contraseña incorrectos.';
  if (/email rate limit|too many requests|rate limit/.test(m)) return 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.';
  if (/database error/.test(m)) return 'Error al guardar el usuario. Intentá de nuevo.';
  if (/password.*character|character.*password|weak.?password|password.*weak|password.*strong|password.*requirements/.test(m)) return 'La contraseña debe tener mín. 12 caracteres, mayúscula, minúscula, número y símbolo (!@#$...).';
  if (/email.*invalid|invalid.*email/.test(m)) return 'El correo ingresado no es válido.';
  if (/network|fetch|connection/.test(m)) return 'Error de conexión. Verificá tu internet e intentá de nuevo.';
  return 'Error al registrarse. Intentá de nuevo.';
}

interface RegisterProps {
  onComplete: () => void;
  refresh: () => Promise<void>;
}

const Register: React.FC<RegisterProps> = ({ onComplete, refresh }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const pendingIntent = (location.state as { intent?: PendingIntent } | null)?.intent;
  const [name, setName] = useState('');
  const [barrio, setBarrio] = useState<Barrio | ''>('');
  const [sector, setSector] = useState<SectorCanton | ''>('');
  const [calle, setCalle] = useState('');
  const [numeroAltura, setNumeroAltura] = useState('');
  const [lote, setLote] = useState('');
  const [localidad, setLocalidad] = useState<Localidad | ''>('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [whatsappLocal, setWhatsappLocal] = useState('');
  const [whatsappDialCode, setWhatsappDialCode] = useState('+549');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailRegistered, setEmailRegistered] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleRegister = async () => {
    setError(null);
    setFieldErrors({});

    const result = RegisterSchema.safeParse({
      name,
      email,
      password,
      confirmPassword,
      barrio: barrio || undefined,
      sector: sector || undefined,
      localidad: localidad || undefined,
      calle,
      numero_altura: numeroAltura || undefined,
      lote: lote || undefined,
      whatsappLocal,
      terms,
    });

    if (!result.success) {
      const errors = flattenZodErrors(result);
      if (errors.whatsappLocal) {
        errors.whatsapp = errors.whatsappLocal;
        delete errors.whatsappLocal;
      }
      setFieldErrors(errors);
      setError('Por favor corrige los campos indicados.');
      return;
    }

    const validated = result.data;
    setLoading(true);
    try {
      const normalizedWA = normalizeWhatsApp(whatsappDialCode, whatsappLocal);
      if (supabase && typeof supabase.auth?.signUp === 'function') {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { nombre_completo: name, whatsapp: normalizedWA || null } },
        });

        if (authError && /already registered/i.test(authError.message || '')) {
          setEmailRegistered(true);
          setError('Este correo ya está registrado.');
          setLoading(false);
          return;
        }

        if (authError) throw authError;

        if (authData?.user) {
          const insertResponse = await supabase
            .from('perfiles')
            .upsert(
              {
                id: authData.user.id,
                email: authData.user.email,
                nombre_completo: name,
                whatsapp: normalizedWA || null,
                barrio: validated.barrio,
                sector: validated.sector ?? null,
                calle: validated.calle,
                numero_altura: validated.numero_altura ?? null,
                lote: validated.lote ?? null,
                localidad: validated.localidad,
              },
              { onConflict: 'id' }
            )
            .select()
            .single();
          const dbError = insertResponse.error;
          if (dbError) throw dbError;
          const insertedProfile = insertResponse.data;
          if (insertedProfile) {
            localStorage.setItem('app_user', JSON.stringify(insertedProfile));
          } else {
            const { data: fetched } = await supabase
              .from('perfiles')
              .select('*')
              .eq('id', authData.user.id)
              .single();
            if (fetched) localStorage.setItem('app_user', JSON.stringify(fetched));
          }
        } else {
          localStorage.setItem('pending_profile', JSON.stringify({
            nombre_completo: name,
            whatsapp: normalizedWA || null,
            barrio: validated.barrio,
            sector: validated.sector ?? null,
            calle: validated.calle,
            numero_altura: validated.numero_altura ?? null,
            lote: validated.lote ?? null,
            localidad: validated.localidad,
          }));
        }

        // Si signUp() ya devolvió una sesión activa (confirmación de email desactivada),
        // NO volver a loguear: signInWithPassword dispara un segundo evento SIGNED_IN que
        // compite con el primero (creado por el trigger de perfil, con datos incompletos)
        // y puede hacer que App.tsx redirija a /complete-profile por una carrera de estado.
        if (!authData?.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
          if (signInError) {
            console.warn('Auto sign-in tras registro falló:', signInError.message);
            setLoading(false);
            return;
          }
        }

        // Forzar que el perfil compartido (App.tsx) refleje los datos recién guardados
        // ANTES de navegar, en vez de depender de que el listener onAuthStateChange
        // termine de refrescarlo por su cuenta.
        await refresh();
        onComplete();
      } else {
        const localUser = { id: `local-${Date.now()}`, email, name };
        localStorage.setItem('app_user', JSON.stringify(localUser));
      }

      if (pendingIntent?.type === 'tournament-signup') {
        navigate('/payment', { state: { tournament: pendingIntent.payload.tournament } });
      } else if (pendingIntent?.type === 'service-hire') {
        navigate(`/service/${pendingIntent.payload.serviceId}`);
      } else {
        navigate('/');
      }
    } catch (err: any) {
      console.error('register error', err);
      const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
      setError(traducirErrorSupabase(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface-container-low text-on-surface min-h-screen flex flex-col">
      <header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-outline-variant shadow-sm h-16 flex items-center justify-between px-4">
        <div className="flex items-center">
          <Logo variant="primary" className="h-[120px] w-auto" />
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
            className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-outline rounded-xl hover:bg-surface-variant transition-colors text-sm font-semibold text-on-surface mb-4"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continuar con Google
          </button>

          <div className="relative flex items-center gap-4 mb-4">
            <div className="flex-1 h-px bg-outline-variant"></div>
            <span className="text-xs text-on-surface-variant font-medium">o registrate con email</span>
            <div className="flex-1 h-px bg-outline-variant"></div>
          </div>

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
                <div className="relative h-12">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-xl pointer-events-none">mail</span>
                  <input
                    id="email"
                    type="email"
                    className="w-full pl-11 pr-4 py-3 bg-white border border-outline rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                    placeholder="usuario@ejemplo.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailRegistered(false); }}
                  />
                  {fieldErrors.email && <p className="text-xs text-red-600 mt-1 ml-1">{fieldErrors.email}</p>}
                  {emailRegistered && (
                    <div className="mt-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                      Este correo ya está registrado. ¿Querés <Link to="/login" className="font-bold text-red-800">iniciar sesión</Link>?
                    </div>
                  )}
                </div>
              </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium tracking-widest uppercase text-on-surface-variant ml-1">WhatsApp</label>
                  <div className="flex items-center">
                    <select
                      value={whatsappDialCode}
                      onChange={(e) => setWhatsappDialCode(e.target.value)}
                      className="px-2 py-3 bg-gray-100 border border-r-0 border-outline rounded-l-xl text-xs font-medium text-on-surface-variant outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    >
                      {COUNTRY_CODES.map(c => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                    <input
                      id="whatsapp"
                      type="tel"
                      className="flex-1 px-4 py-3 bg-white border border-outline rounded-r-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                      placeholder={COUNTRY_CODES.find(c => c.code === whatsappDialCode)?.placeholder ?? ''}
                      value={whatsappLocal}
                      onChange={(e) => setWhatsappLocal(e.target.value)}
                    />
                  </div>
                  {fieldErrors.whatsapp && <p className="text-xs text-red-600 mt-1 ml-1">{fieldErrors.whatsapp}</p>}
                </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium tracking-widest uppercase text-on-surface-variant ml-1">Contraseña</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-xl">lock</span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="w-full pl-11 pr-11 py-3 bg-white border border-outline rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors" tabIndex={-1} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                    <span className="material-symbols-outlined text-xl">{showPassword ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
                <p className="text-xs text-on-surface-variant mt-1 ml-1">Mín. 12 caracteres, mayúscula, minúscula, número y símbolo (!@#$...).</p>
                {fieldErrors.password && <p className="text-xs text-red-600 mt-1 ml-1">{fieldErrors.password}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium tracking-widest uppercase text-on-surface-variant ml-1">Confirmar Contraseña</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-xl">lock_reset</span>
                  <input
                    id="confirm_password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="w-full pl-11 pr-11 py-3 bg-white border border-outline rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowConfirmPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors" tabIndex={-1} aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                    <span className="material-symbols-outlined text-xl">{showConfirmPassword ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
                {fieldErrors.confirmPassword && <p className="text-xs text-red-600 mt-1 ml-1">{fieldErrors.confirmPassword}</p>}
              </div>

              {/* Country */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium tracking-widest uppercase text-on-surface-variant ml-1">Country</label>
                <div className="relative">
                  <select
                    className="w-full pl-4 pr-10 py-3 bg-white border border-outline rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm appearance-none"
                    value={barrio}
                    onChange={(e) => {
                      const v = e.target.value as Barrio;
                      setBarrio(v);
                      setSector('');
                      if (v === 'El Cantón') {
                        setCalle('Libertad');
                        setNumeroAltura('310');
                      }
                    }}
                  >
                    <option value="">Seleccioná un country...</option>
                    {BARRIOS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl pointer-events-none">expand_more</span>
                </div>
                {fieldErrors.barrio && <p className="text-xs text-red-600 mt-1 ml-1">{fieldErrors.barrio}</p>}
              </div>

              {/* Barrio (solo para El Cantón) */}
              {barrio === 'El Cantón' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium tracking-widest uppercase text-on-surface-variant ml-1">Barrio</label>
                  <div className="relative">
                    <select
                      className="w-full pl-4 pr-10 py-3 bg-white border border-outline rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm appearance-none"
                      value={sector}
                      onChange={(e) => setSector(e.target.value as SectorCanton)}
                    >
                      <option value="">Seleccioná un barrio...</option>
                      {SECTORES_CANTON.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl pointer-events-none">expand_more</span>
                  </div>
                  {fieldErrors.sector && <p className="text-xs text-red-600 mt-1 ml-1">{fieldErrors.sector}</p>}
                </div>
              )}

              {/* Calle */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium tracking-widest uppercase text-on-surface-variant ml-1">Calle / Avenida</label>
                <input
                  type="text"
                  className="w-full pl-4 py-3 bg-white border border-outline rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                  placeholder="Ej: Av. Principal"
                  value={calle}
                  onChange={(e) => setCalle(e.target.value)}
                />
                {fieldErrors.calle && <p className="text-xs text-red-600 mt-1 ml-1">{fieldErrors.calle}</p>}
              </div>

              {/* Número y Lote */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium tracking-widest uppercase text-on-surface-variant ml-1">Número / Altura</label>
                  <input
                    type="text"
                    className="w-full pl-4 py-3 bg-white border border-outline rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                    placeholder="Ej: 450"
                    value={numeroAltura}
                    onChange={(e) => setNumeroAltura(e.target.value)}
                  />
                  {fieldErrors.numero_altura && <p className="text-xs text-red-600 mt-1 ml-1">{fieldErrors.numero_altura}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium tracking-widest uppercase text-on-surface-variant ml-1">
                    {barrio === 'El Cantón' ? 'Lote' : 'Lote (Opcional)'}
                  </label>
                  <input
                    type="text"
                    className="w-full pl-4 py-3 bg-white border border-outline rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                    placeholder="Ej: 12"
                    value={lote}
                    onChange={(e) => setLote(e.target.value)}
                  />
                  {fieldErrors.lote && <p className="text-xs text-red-600 mt-1 ml-1">{fieldErrors.lote}</p>}
                </div>
              </div>

              {/* Localidad */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium tracking-widest uppercase text-on-surface-variant ml-1">Localidad</label>
                <div className="relative">
                  <select
                    className="w-full pl-4 pr-10 py-3 bg-white border border-outline rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm appearance-none"
                    value={localidad}
                    onChange={(e) => setLocalidad(e.target.value as Localidad)}
                  >
                    <option value="">Seleccioná una localidad...</option>
                    {LOCALIDADES.map((loc) => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl pointer-events-none">expand_more</span>
                </div>
                {fieldErrors.localidad && <p className="text-xs text-red-600 mt-1 ml-1">{fieldErrors.localidad}</p>}
              </div>
            </div>

            <div className="flex items-start gap-3 py-2">
              <div className="flex items-center h-5">
                <input id="terms" name="terms" type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="h-5 w-5 rounded border-outline text-primary focus:ring-primary" />
              </div>
              <div className="text-xs text-on-surface-variant leading-tight">
                <label htmlFor="terms" className="cursor-pointer">Acepto los </label>
                <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-primary font-bold underline hover:text-secondary transition-colors">
                  términos y condiciones
                </Link>
                <label htmlFor="terms" className="cursor-pointer"> y la </label>
                <Link to="/terms#privacidad" target="_blank" rel="noopener noreferrer" className="text-primary font-bold underline hover:text-secondary transition-colors">
                  política de privacidad
                </Link>
                <label htmlFor="terms" className="cursor-pointer"> de TuBarrio.</label>
              </div>
            </div>
            {fieldErrors.terms && <p className="text-xs text-red-600 mt-1">{fieldErrors.terms}</p>}

            <button className="w-full bg-primary hover:bg-secondary text-on-primary-fixed font-bold py-4 rounded-xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4" type="submit" disabled={loading}>
              <span>{loading ? 'Procesando...' : 'Registrarme'}</span>
              <span className="material-symbols-outlined text-xl">arrow_forward</span>
            </button>

            <div className="text-center pt-6">
              <p className="text-sm text-on-surface-variant">
                Ya tengo cuenta,{' '}
                <button
                  type="button"
                  onClick={() => navigate('/login', { state: location.state })}
                  className="text-primary font-bold hover:underline"
                >
                  iniciar sesión
                </button>
              </p>
            </div>
          </form>

        </div>
      </main>

      <footer className="mt-auto py-6 text-center">
        <p className="text-[10px] text-on-surface-variant font-medium tracking-widest uppercase opacity-50">TuBarrio © 2026 - Buenos Aires, Argentina</p>
      </footer>
    </div>
  );
};

export default Register;
