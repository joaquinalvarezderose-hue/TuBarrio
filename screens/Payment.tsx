
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import ResponsiveScreen from '../components/layouts/ResponsiveScreen';
import { toWhatsAppLink } from '../utils/whatsapp';

const TOURNAMENT_SEASON_LABEL = 'Julio a Septiembre';

const Payment: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tournament = location.state?.tournament || {
    id: 1,
    title: "Barrio Tennis Open",
    subtitle: "Inscripción Individual • Caballeros",
    date: "Sáb, 24 Oct • 9:00 AM"
  };

  const aliasDestino = tournament.alias_pago ?? 'torneo.canton';
  const whatsappDestino = '+54 9 11 6421-9155';

  const handleManualPaymentSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      const userStr = localStorage.getItem('app_user');
      const cachedUser = userStr ? JSON.parse(userStr) : null;
      const { data: authData, error: authError } = await supabase.auth.getUser();
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
          const { data: authUser } = await supabase.auth.getUser();
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
        monto: 50000,
        moneda: 'ARS',
        metodo_pago: 'transferencia_alias',
        categoria: tournament.subtitle || null,
        grupo: `TORNEO_${Number(tournament.id)}`,
        alias_destino: aliasDestino,
        whatsapp_destino: whatsappDestino,
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
                src={tournament.image || "/images/payment-tournament.jpg"}
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
              <span className="text-[#111813] font-black">$50.000</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Expensas del barrio</span>
              <span className="text-[#111813] font-black">$5.000</span>
            </div>
            <div className="h-px bg-gray-100 my-1"></div>
            <div className="flex justify-between items-center">
              <span className="text-[#111813] font-black text-lg tracking-tight">Total a transferir</span>
              <span className="text-[#111813] font-black text-2xl tracking-tighter">$45.000</span>
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
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">WhatsApp para comprobante</p>
                  <span className="text-sm font-black text-[#111813]">{whatsappDestino}</span>
                </div>
                <a
                  href={toWhatsAppLink(whatsappDestino) ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 bg-[#25D366] text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </a>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 items-start">
                <span className="material-symbols-outlined text-amber-500 text-xl mt-0.5">warning</span>
                <p className="text-sm text-[#111813] font-bold leading-snug">
                  El costo total es $50.000, pero <span className="text-amber-700">transferí solo $45.000</span>. Los $5.000 restantes se cobran por expensas del barrio.
                </p>
              </div>
              <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 flex gap-2 items-start">
                <span className="material-symbols-outlined text-primary text-xl mt-0.5">info</span>
                <p className="text-sm text-[#111813] font-bold leading-snug">
                  Luego de transferir, enviá el comprobante por WhatsApp. Tu inscripción quedará pendiente hasta aprobación manual.
                </p>
              </div>
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
