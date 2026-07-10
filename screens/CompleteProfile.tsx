import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { normalizeWhatsApp, COUNTRY_CODES, BARRIOS, LOCALIDADES, SECTORES_CANTON, type Barrio, type Localidad, type SectorCanton } from '../lib/schemas';
import type { PendingIntent } from '../types/intent';

interface Props {
  onSaved?: () => Promise<void>;
}

const CompleteProfile: React.FC<Props> = ({ onSaved }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { authUser, refresh } = useCurrentUser();
  const intent = (location.state as { intent?: PendingIntent } | null)?.intent;

  const [whatsappLocal, setWhatsappLocal] = useState('');
  const [whatsappDialCode, setWhatsappDialCode] = useState('+549');
  const [barrio, setBarrio] = useState<Barrio | ''>('');
  const [sector, setSector] = useState<SectorCanton | ''>('');
  const [calle, setCalle] = useState('');
  const [numeroAltura, setNumeroAltura] = useState('');
  const [lote, setLote] = useState('');
  const [localidad, setLocalidad] = useState<Localidad | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser) return;

    if (!whatsappLocal.trim()) {
      setError('El WhatsApp es obligatorio para continuar.');
      return;
    }
    if (!barrio) {
      setError('Seleccioná tu country.');
      return;
    }
    if (!calle.trim()) {
      setError('Ingresá tu calle.');
      return;
    }
    if (!localidad) {
      setError('Seleccioná tu localidad.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const normalizedWA = normalizeWhatsApp(whatsappDialCode, whatsappLocal);

      // Fetch auth metadata so we can set nombre_completo/email for new Google users
      const { data: { user: authMeta } } = await supabase.auth.getUser();
      const nombreCompleto = authMeta?.user_metadata?.full_name || authMeta?.user_metadata?.name || authMeta?.email?.split('@')[0] || 'Usuario';

      const { error: upsertError } = await supabase
        .from('perfiles')
        .upsert(
          {
            id: authUser.id,
            email: authUser.email,
            nombre_completo: nombreCompleto,
            whatsapp: normalizedWA || null,
            barrio,
            sector: sector || null,
            calle,
            numero_altura: numeroAltura || null,
            lote: lote || null,
            localidad,
          },
          { onConflict: 'id' },
        );

      if (upsertError) throw upsertError;

      // Refresh the shared App-level perfil first so the guard check in App.tsx
      // sees the updated profile before we navigate away from /complete-profile.
      await (onSaved ?? refresh)();

      if (intent?.type === 'tournament-signup') {
        navigate('/payment', { state: { tournament: intent.payload.tournament } });
      } else if (intent?.type === 'service-hire') {
        navigate(`/service/${intent.payload.serviceId}`);
      } else {
        navigate('/');
      }
    } catch (err: any) {
      console.error('[CompleteProfile] upsert error', err);
      setError('Error al guardar el perfil. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface-container-low text-on-surface min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="relative inline-block">
            <div className="absolute -inset-1 bg-gradient-to-tr from-primary to-secondary opacity-20 blur-xl rounded-full"></div>
            <div className="relative bg-white p-4 rounded-3xl shadow-md border border-outline-variant">
              <span className="material-symbols-outlined text-5xl text-primary">edit_note</span>
            </div>
          </div>
          <h1 className="mt-6 text-2xl font-black tracking-tight text-secondary">Completá tu perfil</h1>
          <p className="mt-2 text-on-surface-variant text-sm">Necesitamos estos datos para continuar con tu solicitud.</p>
        </div>

        {error && (
          <div className="p-3 mb-4 text-sm text-red-500 bg-red-50 rounded-lg">{error}</div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* WhatsApp */}
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
                type="tel"
                className="flex-1 px-4 py-3 bg-white border border-outline rounded-r-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                placeholder={COUNTRY_CODES.find(c => c.code === whatsappDialCode)?.placeholder ?? ''}
                value={whatsappLocal}
                onChange={(e) => setWhatsappLocal(e.target.value)}
              />
            </div>
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
          </div>

          {/* Sector (solo El Cantón) */}
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
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium tracking-widest uppercase text-on-surface-variant ml-1">Lote (opcional)</label>
              <input
                type="text"
                className="w-full pl-4 py-3 bg-white border border-outline rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                placeholder="Ej: 12"
                value={lote}
                onChange={(e) => setLote(e.target.value)}
              />
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
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-secondary text-on-primary-fixed font-bold py-4 rounded-xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4"
          >
            <span>{loading ? 'Guardando...' : 'Guardar y continuar'}</span>
            <span className="material-symbols-outlined text-xl">arrow_forward</span>
          </button>
        </form>
      </div>
    </div>
  );
};

export default CompleteProfile;
