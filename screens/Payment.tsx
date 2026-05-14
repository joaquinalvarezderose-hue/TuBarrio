
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import ResponsiveScreen from '../components/layouts/ResponsiveScreen';

const TOURNAMENT_SEASON_LABEL = 'Mayo a Julio';

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
      const cachedUser = userStr ? JSON.parse(userStr) : null;
      const { data: authData, error: authError } = await (supabase as any).auth.getUser();
      if (authError) throw authError;
      const perfilId = authData?.user?.id || cachedUser?.id;

      if (!perfilId) {
        throw new Error('Sesion no valida. Inicia sesion nuevamente para inscribirte.');
      }

      // Si el cache local quedó de otra cuenta, lo corregimos para evitar desincronización.
      // Si no existe perfil en BD, lo creamos automáticamente.
      if (!cachedUser || cachedUser.id !== perfilId) {
        const { data: profileRow } = await supabase
          .from('perfiles')
          .select('*')
          .eq('id', perfilId)
          .maybeSingle();
        
        if (!profileRow) {
          // Crear perfil automáticamente si no existe
          const { data: authUser } = await (supabase as any).auth.getUser();
          const userEmail = authUser?.user?.email || '';
          const userName = authUser?.user?.user_metadata?.name || userEmail.split('@')[0] || 'Usuario';
          
          const { data: newProfile, error: createError } = await supabase
            .from('perfiles')
            .insert({
              id: perfilId,
              email: userEmail,
              nombre_completo: userName,
              rol: 'jugador',
            })
            .select('*')
            .single();
          
          if (createError) {
            console.error('Error creando perfil:', createError);
            throw new Error('No se pudo crear tu perfil. Contacta soporte.');
          }
          
          localStorage.setItem('app_user', JSON.stringify(newProfile));
        } else {
          localStorage.setItem('app_user', JSON.stringify(profileRow));
        }
      }

      const updatedUser = JSON.parse(localStorage.getItem('app_user') || '{}');

      const payload = {
        torneo_id: Number(tournament.id),
        perfil_id: perfilId,
        estado: 'pendiente_revision',
        monto: 27,
        moneda: 'ARS',
        metodo_pago: 'transferencia_alias',
        categoria: tournament.subtitle || null,
        grupo: `TORNEO_${Number(tournament.id)}`,
        alias_destino: aliasDestino,
        whatsapp_destino: whatsappDestino,
        referencia_manual: reference || null,
        nombre_contacto: updatedUser.nombre_completo || null,
        whatsapp_contacto: updatedUser.whatsapp || null,
      };

      // Evitamos upsert porque si ya existe una fila aprobada/rechazada,
      // la policy de UPDATE la bloquea y devuelve RLS error.
      const { data: existente, error: existingError } = await supabase
        .from('inscripciones_torneo')
        .select('id, estado')
        .eq('torneo_id', Number(tournament.id))
        .eq('perfil_id', perfilId)
        .maybeSingle();

      if (existingError) throw existingError;

      let enrollmentStatus = 'pendiente_revision';

      if (!existente) {
        const { data: insertData, error: insertError } = await supabase
          .from('inscripciones_torneo')
          .insert(payload)
          .select('id, estado')
          .single();
        if (insertError) throw insertError;
        enrollmentStatus = insertData?.estado || 'pendiente_revision';
      } else if (existente.estado === 'pendiente_revision') {
        const { data: updateData, error: updateError } = await supabase
          .from('inscripciones_torneo')
          .update({
            referencia_manual: reference || null,
            nombre_contacto: updatedUser.nombre_completo || null,
            whatsapp_contacto: updatedUser.whatsapp || null,
          })
          .eq('id', existente.id)
          .select('id, estado')
          .single();
        if (updateError) throw updateError;
        enrollmentStatus = updateData?.estado || 'pendiente_revision';
      } else {
        // Si ya esta aprobado/rechazado, no intentamos mutar estado.
        enrollmentStatus = existente.estado;
      }

      navigate('/confirmation', {
        state: {
          tournament,
          enrollmentStatus,
        },
      });
    } catch (err: any) {
      setError(err?.message || 'No pudimos registrar tu solicitud de pago.');
    } finally {
      setLoading(false);
    }
  };

  const header = (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-100 bg-background-light/95 px-4 py-3 backdrop-blur-md md:px-8">
      <button onClick={() => navigate(-1)} className="-ml-2 rounded-full p-2 transition-colors hover:bg-gray-100">
        <span className="material-symbols-outlined">arrow_back</span>
      </button>
      <h1 className="text-lg font-bold">Pago</h1>
      <div className="w-10"></div>
    </header>
  );

  const main = (
    <div className="px-4 py-6 md:max-w-xl md:px-0 md:pt-10">
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
              <p className="text-gray-400 text-[11px] mt-0.5 font-bold uppercase tracking-tighter opacity-80">{TOURNAMENT_SEASON_LABEL}</p>
            </div>
          </div>
        <section className="mb-2 md:max-w-xl">
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
    </div>
  );

  const aside = (
    <section className="px-4 py-6 md:w-[420px] md:justify-self-end md:px-0 md:pb-8 md:pt-10">
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
  );

  const footer = (
    <button
      onClick={handleManualPaymentSubmit}
      disabled={loading}
      className="flex h-16 w-full items-center justify-center gap-2 rounded-[1.5rem] bg-primary text-lg font-black text-[#111813] shadow-xl shadow-primary/40 transition-all hover:bg-[#0fdc41] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 md:w-[420px]"
    >
      <span>{loading ? 'Enviando solicitud...' : 'Ya transferí y envié comprobante'}</span>
      <span className="material-symbols-outlined font-black">check_circle</span>
    </button>
  );

  return (
    <ResponsiveScreen
      header={header}
      main={main}
      aside={aside}
      footer={footer}
      contentClassName="pb-40 md:px-8"
      footerContainerClassName="md:flex md:justify-end"
    />
  );
};

export default Payment;
