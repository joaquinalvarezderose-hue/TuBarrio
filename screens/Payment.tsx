
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

const Payment: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const tournament = location.state?.tournament || {
    id: 1,
    title: "Barrio Tennis Open",
    subtitle: "Inscripción Individual • Caballeros",
    date: "Sáb, 24 Oct • 9:00 AM"
  };

  const aliasDestino = 'tubarrio.torneos';
  const whatsappDestino = '+54 9 11 5555-1234';

  const handleManualPaymentSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      const userStr = localStorage.getItem('app_user');
      const user = userStr ? JSON.parse(userStr) : null;
      const perfilId = user?.id;

      if (!perfilId) {
        throw new Error('No pudimos identificar tu perfil. Inicia sesión nuevamente.');
      }

      const payload = {
        torneo_id: Number(tournament.id),
        perfil_id: perfilId,
        estado: 'pendiente_revision',
        monto: 27,
        moneda: 'ARS',
        metodo_pago: 'transferencia_alias',
        categoria: tournament.subtitle || null,
        grupo: null,
        alias_destino: aliasDestino,
        whatsapp_destino: whatsappDestino,
        referencia_manual: reference || null,
      };

      const { data, error: upsertError } = await supabase
        .from('inscripciones_torneo')
        .upsert(payload, { onConflict: 'torneo_id,perfil_id' })
        .select('id, estado')
        .single();

      if (upsertError) {
        throw upsertError;
      }

      navigate('/confirmation', {
        state: {
          tournament,
          enrollmentStatus: data?.estado || 'pendiente_revision',
        },
      });
    } catch (err: any) {
      setError(err?.message || 'No pudimos registrar tu solicitud de pago.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden bg-background-light text-[#111813] font-display">
      <header className="sticky top-0 z-30 bg-background-light/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="text-lg font-bold">Pago</h1>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar pb-40">
        <div className="px-4 py-6">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex gap-4">
            <div className="h-20 w-20 rounded-lg bg-gray-200 flex-shrink-0 overflow-hidden relative border border-gray-50">
              <img 
                alt="Tournament" 
                className="object-cover w-full h-full" 
                src={tournament.image || "https://lh3.googleusercontent.com/aida-public/AB6AXuAkACAJDk1YmZUavx4Q84LF1hqvnTyGZ8dMjm5uxDcnrHXbqI61rijPof3U9QxC6iasZVmkyLI6QPBmYx66Ok26F26_LSmiuzEnBcoGKn2c-g0JfRVIWZgLHJwJXNSzk84jRd8yhULaVdXztOioSvTifRFlvQE1NgQSlFVqyxtNZsXdYtXsQfLx-nUPCl6wkYnG2FVX8xpycRncckUiLXikgi6bRf9uiioDsgnwMp-3912I47TViSKhyU0KCOWAxNqtaPDfJiaXFv0"}
              />
            </div>
            <div className="flex flex-col justify-center">
              <h2 className="text-[#111813] font-black text-lg leading-tight">{tournament.title}</h2>
              <p className="text-gray-500 text-sm mt-1 font-bold">{tournament.subtitle}</p>
              <p className="text-gray-400 text-[11px] mt-0.5 font-bold uppercase tracking-tighter opacity-80">{tournament.date}</p>
            </div>
          </div>
        </div>

        <section className="px-4 mb-2">
          <h3 className="text-[#111813] text-base font-black mb-3 px-1">Resumen de Pago</h3>
          <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Costo de Inscripción</span>
              <span className="text-[#111813] font-black">$25.00</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Costo de Servicio</span>
              <span className="text-[#111813] font-black">$2.00</span>
            </div>
            <div className="h-px bg-gray-50 my-2"></div>
            <div className="flex justify-between items-center">
              <span className="text-[#111813] font-black text-lg tracking-tight">Total</span>
              <span className="text-[#111813] font-black text-2xl tracking-tighter">$27.00</span>
            </div>
          </div>
        </section>

        <section className="px-4 py-6">
          <h3 className="text-[#111813] text-base font-black mb-3 px-1">Método de Pago</h3>
          <div className="space-y-3">
            <div className="group relative flex items-center justify-between p-4 rounded-[1.5rem] border-2 border-primary bg-primary/5 transition-all shadow-md shadow-primary/5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-primary shadow-sm border border-primary/20">
                  <span className="material-symbols-outlined text-2xl">account_balance</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[#111813] font-black text-sm">Transferencia Bancaria</span>
                  <span className="text-gray-400 text-[10px] font-black tracking-tight uppercase">Alias + envío de comprobante</span>
                </div>
              </div>
              <div className="w-6 h-6 rounded-full border-2 border-primary flex items-center justify-center">
                <div className="w-3.5 h-3.5 rounded-full bg-primary"></div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Alias para transferir</p>
                  <p className="text-base font-black text-[#111813]">{aliasDestino}</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(aliasDestino)}
                  className="text-xs font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-full"
                >
                  Copiar alias
                </button>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">WhatsApp para comprobante</p>
                <a className="text-sm font-black text-primary" href={`https://wa.me/${whatsappDestino.replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer">
                  {whatsappDestino}
                </a>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Referencia de transferencia (opcional)</label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Ej: MP-48291 o nro. operación"
                  className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <p className="text-xs text-gray-500 font-medium">
                Luego de transferir, enviá el comprobante por WhatsApp. Tu inscripción quedará pendiente hasta aprobación manual.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-medium">
                {error}
              </div>
            )}
          </div>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto bg-white/90 backdrop-blur-xl border-t border-gray-50 p-5 pb-10 z-[60] shadow-[0_-10px_40px_-15px_rgba(19,236,73,0.15)]">
        <button 
          onClick={handleManualPaymentSubmit}
          disabled={loading}
          className="w-full bg-primary hover:bg-[#0fdc41] active:scale-[0.98] transition-all text-[#111813] font-black text-lg h-16 rounded-[1.5rem] shadow-xl shadow-primary/40 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <span>{loading ? 'Enviando solicitud...' : 'Ya transferí y envié comprobante'}</span>
          <span className="material-symbols-outlined font-black">check_circle</span>
        </button>
      </div>
    </div>
  );
};

export default Payment;
