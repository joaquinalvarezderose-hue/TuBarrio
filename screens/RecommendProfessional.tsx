import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRecomendacion } from '../hooks/useRecomendacion';

const RUBROS = [
  'Plomería',
  'Electricidad',
  'Gasista Matriculado',
  'Pintura y Albañilería',
  'Climatización (AA)',
  'Otros Servicios',
] as const;

const MOTIVO_MAX = 1000;

function validarTelefono(tel: string): boolean {
  return /\d{8,}/.test(tel.replace(/\D/g, ''));
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ mensaje, tipo }: { mensaje: string; tipo: 'ok' | 'error' }) {
  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl text-sm font-bold shadow-lg text-white max-w-xs text-center transition-all ${
        tipo === 'ok' ? 'bg-[#28C76F]' : 'bg-red-500'
      }`}
    >
      {mensaje}
    </div>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const RecommendProfessional: React.FC = () => {
  const navigate = useNavigate();
  const { submit, loading } = useRecomendacion();

  const [nombre, setNombre] = useState('');
  const [rubro, setRubro] = useState('');
  const [telefono, setTelefono] = useState('');
  const [motivo, setMotivo] = useState('');

  const [errores, setErrores] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ mensaje: string; tipo: 'ok' | 'error' } | null>(null);

  const mostrarToast = (mensaje: string, tipo: 'ok' | 'error') => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  const validar = (): boolean => {
    const nuevosErrores: Record<string, string> = {};

    if (nombre.trim().length < 3) {
      nuevosErrores.nombre = 'Ingresá al menos 3 caracteres.';
    }
    if (!rubro) {
      nuevosErrores.rubro = 'Seleccioná un rubro.';
    }
    if (!validarTelefono(telefono)) {
      nuevosErrores.telefono = 'Ingresá un número válido (mínimo 8 dígitos).';
    }
    if (motivo.trim().length > MOTIVO_MAX) {
      nuevosErrores.motivo = `Máximo ${MOTIVO_MAX} caracteres.`;
    }

    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validar()) return;

    try {
      await submit({ nombre_proveedor: nombre, rubro, telefono, motivo });
      mostrarToast('¡Gracias! Tu recomendación fue enviada.', 'ok');
      setNombre('');
      setRubro('');
      setTelefono('');
      setMotivo('');
      setErrores({});
      setTimeout(() => navigate(-1), 1500);
    } catch (err) {
      mostrarToast(
        err instanceof Error ? err.message : 'No se pudo enviar la recomendación.',
        'error',
      );
    }
  };

  const inputClass = (campo: string) =>
    `w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm text-secondary placeholder-gray-400 focus:outline-none focus:ring-2 transition-all ${
      errores[campo]
        ? 'border-red-400 focus:ring-red-400/50'
        : 'border-gray-200 focus:ring-primary/50'
    }`;

  const labelClass = 'block text-sm font-bold text-secondary mb-1.5';

  return (
    <div className="flex flex-col min-h-full bg-gray-50 overflow-y-auto no-scrollbar">
      {toast && <Toast mensaje={toast.mensaje} tipo={toast.tipo} />}

      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-white border-b border-gray-100 flex items-center h-16 px-5 shadow-sm">
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          className="w-10 h-10 flex items-center justify-center text-secondary hover:opacity-80 transition-opacity active:scale-95"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="flex-1 text-center font-display font-bold text-base text-secondary pr-10">
          Recomendar Profesional
        </h1>
      </header>

      <main className="pt-20 pb-28 px-5 max-w-screen-sm mx-auto w-full space-y-6">
        {/* Info card */}
        <section
          className="rounded-xl p-4 flex gap-3"
          style={{ backgroundColor: '#EBF5FF', border: '1px solid #1E90FF' }}
        >
          <span className="material-symbols-outlined mt-0.5 flex-shrink-0" style={{ color: '#1E90FF' }}>
            info
          </span>
          <p className="text-sm leading-relaxed" style={{ color: '#1E90FF' }}>
            Ayudá a tus vecinos compartiendo el contacto de un profesional que haya hecho un buen
            trabajo para vos.
          </p>
        </section>

        {/* Formulario */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Nombre */}
            <div>
              <label htmlFor="nombre" className={labelClass}>
                Nombre completo o Empresa
              </label>
              <input
                id="nombre"
                type="text"
                value={nombre}
                onChange={(e) => {
                  setNombre(e.target.value);
                  if (errores.nombre) setErrores((p) => ({ ...p, nombre: '' }));
                }}
                placeholder="Ej. Juan Pérez o Plomería Rápida"
                className={inputClass('nombre')}
              />
              {errores.nombre && (
                <p className="mt-1 text-xs text-red-500">{errores.nombre}</p>
              )}
            </div>

            {/* Rubro */}
            <div>
              <label htmlFor="rubro" className={labelClass}>
                Rubro
              </label>
              <div className="relative">
                <select
                  id="rubro"
                  value={rubro}
                  onChange={(e) => {
                    setRubro(e.target.value);
                    if (errores.rubro) setErrores((p) => ({ ...p, rubro: '' }));
                  }}
                  className={`${inputClass('rubro')} appearance-none pr-10`}
                >
                  <option value="" disabled>
                    Seleccioná un rubro (Ej. Plomería...)
                  </option>
                  {RUBROS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-base">
                  expand_more
                </span>
              </div>
              {errores.rubro && (
                <p className="mt-1 text-xs text-red-500">{errores.rubro}</p>
              )}
            </div>

            {/* Teléfono */}
            <div>
              <label htmlFor="telefono" className={labelClass}>
                Número de teléfono
              </label>
              <input
                id="telefono"
                type="tel"
                value={telefono}
                onChange={(e) => {
                  setTelefono(e.target.value);
                  if (errores.telefono) setErrores((p) => ({ ...p, telefono: '' }));
                }}
                placeholder="Ej. +54 11 1234-5678"
                className={inputClass('telefono')}
              />
              {errores.telefono && (
                <p className="mt-1 text-xs text-red-500">{errores.telefono}</p>
              )}
            </div>

            {/* Motivo */}
            <div>
              <label htmlFor="motivo" className={labelClass}>
                ¿Por qué lo recomendás?
              </label>
              <textarea
                id="motivo"
                value={motivo}
                onChange={(e) => {
                  setMotivo(e.target.value);
                  if (errores.motivo) setErrores((p) => ({ ...p, motivo: '' }));
                }}
                placeholder="Contale al barrio qué trabajos hace y por qué confiás en él..."
                rows={5}
                className={`${inputClass('motivo')} resize-none`}
              />
              <div className="flex justify-between items-center mt-1">
                {errores.motivo ? (
                  <p className="text-xs text-red-500">{errores.motivo}</p>
                ) : (
                  <span />
                )}
                <span
                  className={`text-xs ml-auto ${
                    motivo.trim().length > MOTIVO_MAX ? 'text-red-500' : 'text-gray-400'
                  }`}
                >
                  {motivo.trim().length}/{MOTIVO_MAX}
                </span>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ backgroundColor: '#28C76F' }}
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-base animate-spin">sync</span>
                  Procesando...
                </>
              ) : (
                'Enviar Recomendación'
              )}
            </button>
          </form>
        </div>

        {/* Banner motivacional */}
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-secondary to-gray-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-6xl text-white/20">handyman</span>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex flex-col justify-end p-5">
            <p className="text-white font-display font-bold text-lg leading-tight mb-1">
              Tu recomendación fortalece al barrio.
            </p>
            <p className="text-white/70 text-xs">
              Los vecinos ya encontraron soluciones gracias a la comunidad.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default RecommendProfessional;
