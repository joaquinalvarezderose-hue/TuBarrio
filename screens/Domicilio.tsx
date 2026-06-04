import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useCurrentUser } from '../hooks/useCurrentUser';
import {
  DomicilioUpdateSchema,
  BARRIOS,
  LOCALIDADES,
  type Barrio,
  type Localidad,
} from '../lib/schemas';

const Domicilio: React.FC = () => {
  const navigate = useNavigate();
  const { authUser, perfil, refresh } = useCurrentUser();

  const [barrio, setBarrio] = useState<Barrio | ''>('');
  const [calle, setCalle] = useState('');
  const [numeroAltura, setNumeroAltura] = useState('');
  const [lote, setLote] = useState('');
  const [localidad, setLocalidad] = useState<Localidad | ''>('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!perfil) return;
    setBarrio((perfil.barrio as Barrio) || '');
    setCalle(perfil.calle || '');
    setNumeroAltura(perfil.numero_altura || '');
    setLote(perfil.lote || '');
    setLocalidad((perfil.localidad as Localidad) || '');
  }, [perfil]);

  const hasDomicilio = !!(perfil?.barrio && perfil?.calle && perfil?.localidad);

  const handleSave = async () => {
    setError(null);
    setFieldErrors({});
    setSuccess(false);

    const parsed = DomicilioUpdateSchema.safeParse({
      barrio: barrio || undefined,
      calle,
      numero_altura: numeroAltura || undefined,
      lote: lote || undefined,
      localidad: localidad || undefined,
    });

    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]?.toString() ?? '_root';
        if (!errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      if (errs._root) setError(errs._root);
      return;
    }

    const { barrio: b, calle: c, numero_altura: n, lote: l, localidad: loc } = parsed.data;

    const parts = [`Barrio: ${b}`, `Calle: ${c}`];
    if (n) parts.push(`Nro: ${n}`);
    if (l) parts.push(`Lote: ${l}`);
    parts.push(`Localidad: ${loc}`);
    const direccionCompuesta = parts.join(', ');

    setSaving(true);
    try {
      const userId = authUser?.id;
      if (!userId) throw new Error('Sin sesión');

      const { error: dbError } = await supabase
        .from('perfiles')
        .update({
          barrio: b,
          calle: c,
          numero_altura: n ?? null,
          lote: l ?? null,
          localidad: loc,
          direccion: direccionCompuesta,
        })
        .eq('id', userId);

      if (dbError) throw dbError;

      await refresh();
      setSuccess(true);
      setTimeout(() => navigate(-1), 800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el domicilio');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => navigate(-1);

  const inputClass = (field: string) =>
    `w-full h-14 bg-gray-50 border rounded-xl px-4 font-sans text-base text-slate-900 focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary transition-all ${
      fieldErrors[field] ? 'border-red-400' : 'border-gray-200'
    }`;

  return (
    <div className="flex flex-col h-full bg-background-light font-sans text-slate-900 overflow-y-auto no-scrollbar pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white flex items-center justify-between px-4 h-16">
        <button
          aria-label="Volver"
          onClick={handleCancel}
          className="hover:bg-green-50 rounded-full transition-colors p-2 active:scale-95 duration-100"
        >
          <span className="material-symbols-outlined text-green-800">arrow_back</span>
        </button>
        <h1 className="font-display text-2xl font-semibold text-green-800">Mi Domicilio</h1>
        <div className="w-10" />
      </header>

      <main className="px-4 pt-6 max-w-lg mx-auto w-full space-y-6">
        {/* Domicilio Actual */}
        <section>
          <h2 className="font-sans text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">
            Domicilio Actual
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex gap-3 items-start shadow-sm">
            <div className="bg-green-50 p-3 rounded-xl shrink-0">
              <span
                className="material-symbols-outlined text-green-700"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                location_on
              </span>
            </div>
            <div className="flex-1 min-w-0">
              {hasDomicilio ? (
                <>
                  <p className="font-display text-base font-semibold text-slate-900 mb-0.5">
                    Barrio: {perfil!.barrio}
                  </p>
                  <p className="font-sans text-sm text-slate-500 leading-relaxed">
                    {perfil!.calle && `Calle: ${perfil!.calle}`}
                    {perfil!.numero_altura && `, Nro: ${perfil!.numero_altura}`}
                    <br />
                    {perfil!.lote && `Lote: ${perfil!.lote}, `}
                    {perfil!.localidad && `Localidad: ${perfil!.localidad}`}
                  </p>
                </>
              ) : (
                <p className="font-sans text-sm text-slate-400 italic pt-1">
                  Sin domicilio guardado
                </p>
              )}
            </div>
            <button
              aria-label="Editar"
              className="text-green-700 hover:bg-green-50 p-2 rounded-full transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">edit</span>
            </button>
          </div>
        </section>

        {/* Form */}
        <section className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-slate-900 mb-5">
            Editar Ubicación
          </h2>

          <div className="space-y-5">
            {/* Barrio */}
            <div className="flex flex-col gap-1.5">
              <label className="font-sans text-sm font-semibold text-slate-700 px-1">
                Barrio / Country
              </label>
              <div className="relative">
                <select
                  className={inputClass('barrio') + ' appearance-none pr-10'}
                  value={barrio}
                  onChange={(e) => setBarrio(e.target.value as Barrio)}
                >
                  <option value="">Seleccioná un barrio…</option>
                  {BARRIOS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-3 top-4 text-slate-400 pointer-events-none">
                  expand_more
                </span>
              </div>
              {fieldErrors.barrio && (
                <p className="text-xs text-red-600 px-1">{fieldErrors.barrio}</p>
              )}
            </div>

            {/* Calle */}
            <div className="flex flex-col gap-1.5">
              <label className="font-sans text-sm font-semibold text-slate-700 px-1">
                Calle / Avenida
              </label>
              <input
                type="text"
                className={inputClass('calle')}
                placeholder="Ej: Av. Principal"
                value={calle}
                onChange={(e) => setCalle(e.target.value)}
              />
              {fieldErrors.calle && (
                <p className="text-xs text-red-600 px-1">{fieldErrors.calle}</p>
              )}
            </div>

            {/* Número y Lote */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="font-sans text-sm font-semibold text-slate-700 px-1">
                  Número / Altura
                </label>
                <input
                  type="text"
                  className={inputClass('numero_altura')}
                  placeholder="Ej: 450"
                  value={numeroAltura}
                  onChange={(e) => setNumeroAltura(e.target.value)}
                />
                {fieldErrors.numero_altura && (
                  <p className="text-xs text-red-600 px-1">{fieldErrors.numero_altura}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-sans text-sm font-semibold text-slate-700 px-1">
                  Lote (Opcional)
                </label>
                <input
                  type="text"
                  className={inputClass('lote')}
                  placeholder="Ej: 12"
                  value={lote}
                  onChange={(e) => setLote(e.target.value)}
                />
              </div>
            </div>

            {/* Localidad */}
            <div className="flex flex-col gap-1.5">
              <label className="font-sans text-sm font-semibold text-slate-700 px-1">
                Localidad
              </label>
              <div className="relative">
                <select
                  className={inputClass('localidad') + ' appearance-none pr-10'}
                  value={localidad}
                  onChange={(e) => setLocalidad(e.target.value as Localidad)}
                >
                  <option value="">Seleccioná una localidad…</option>
                  {LOCALIDADES.map((loc) => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-3 top-4 text-slate-400 pointer-events-none">
                  expand_more
                </span>
              </div>
              {fieldErrors.localidad && (
                <p className="text-xs text-red-600 px-1">{fieldErrors.localidad}</p>
              )}
            </div>

            {/* Error global */}
            {error && !Object.keys(fieldErrors).length && (
              <p className="text-sm text-red-600 text-center px-1">{error}</p>
            )}

            {/* Éxito */}
            {success && (
              <p className="text-sm text-green-700 text-center font-semibold px-1">
                ✓ Domicilio guardado
              </p>
            )}

            {/* Botones */}
            <div className="pt-2 space-y-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full h-14 bg-primary text-secondary font-display font-bold text-base rounded-xl active:scale-[0.98] transition-all hover:bg-primary-dark duration-150 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar Domicilio'}
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="w-full h-14 border-2 border-gray-200 text-slate-600 font-display font-semibold text-base rounded-xl active:scale-[0.98] transition-all hover:bg-gray-50 duration-150 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Domicilio;
