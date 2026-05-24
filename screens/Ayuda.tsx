import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const WA_SOPORTE = 'https://wa.me/5491164219155?text=Hola%2C+necesito+ayuda+con+TuBarrio.';

interface Pregunta {
  id: string;
  q: string;
  a: string;
}

interface Seccion {
  id: string;
  titulo: string;
  icono: string;
  chipColor: string;
  preguntas: Pregunta[];
}

const secciones: Seccion[] = [
  {
    id: 'servicios',
    titulo: 'Servicios',
    icono: 'handyman',
    chipColor: 'bg-primary/15 text-primary',
    preguntas: [
      {
        id: 's1',
        q: '¿Cómo contacto a un profesional?',
        a: 'Desde la pantalla de Servicios, tocá el profesional que te interese. En su perfil vas a ver el botón "Contactar por WhatsApp" que abre una conversación directa con él.',
      },
      {
        id: 's2',
        q: '¿Cómo funcionan las calificaciones?',
        a: 'Las estrellas que ves en cada profesional son el promedio de las reseñas dejadas por otros vecinos. Cuanto más reseñas tenga, más confiable es el puntaje.',
      },
      {
        id: 's3',
        q: '¿Puedo recomendar a un profesional?',
        a: 'Sí. Desde la pantalla de Servicios encontrás el botón "Recomendar profesional". Completá el formulario con nombre, rubro y teléfono, y lo revisamos para sumarlo al directorio.',
      },
      {
        id: 's4',
        q: '¿Qué hago si el profesional no responde?',
        a: 'Si un profesional no responde en un tiempo razonable, podés contactarnos por WhatsApp desde esta misma sección de ayuda. Lo revisamos y actualizamos su disponibilidad.',
      },
    ],
  },
  {
    id: 'torneos',
    titulo: 'Torneos',
    icono: 'emoji_events',
    chipColor: 'bg-amber-100 text-amber-700',
    preguntas: [
      {
        id: 't1',
        q: '¿Cómo me inscribo a un torneo?',
        a: 'Ingresá a la sección Torneos, elegí el torneo que te interese y seguí los pasos de inscripción. El pago se realiza por transferencia al alias indicado en la pantalla de pago.',
      },
      {
        id: 't2',
        q: '¿Cómo registro el resultado de un partido?',
        a: 'Desde tu Panel de Torneo, tocá "Cargar Resultado" y completá el marcador de cada set. Ambos jugadores deben confirmar el resultado dentro de las 24 hs siguientes al partido.',
      },
      {
        id: 't3',
        q: '¿Qué hago si hay una disputa con el resultado?',
        a: 'Si no llegás a un acuerdo con tu rival sobre el marcador, cualquiera de los dos puede abrir una disputa desde la pantalla de resultado. El organizador la revisa y determina el resultado oficial.',
      },
      {
        id: 't4',
        q: '¿Cómo funciona el sistema de puntos?',
        a: 'Ganar un partido suma 3 puntos. Perder suma 1 punto por haber jugado. Un W.O. (walkover) otorga 0 puntos. La clasificación se define por puntos, y en caso de empate se usan diferencia de sets y games.',
      },
    ],
  },
  {
    id: 'cuenta',
    titulo: 'Mi Cuenta',
    icono: 'manage_accounts',
    chipColor: 'bg-slate-100 text-slate-600',
    preguntas: [
      {
        id: 'c1',
        q: '¿Cómo actualizo mi número de WhatsApp?',
        a: 'Desde tu Perfil, en la sección WhatsApp, tocá "Editar" e ingresá tu nuevo número en formato internacional (ej: +54 9 11 1234-5678). Es importante tenerlo actualizado para que tus rivales puedan contactarte.',
      },
      {
        id: 'c2',
        q: '¿Cómo cambio mi dirección?',
        a: 'En la pantalla de Perfil tocá "Mi Domicilio". Podés actualizar tu dirección en cualquier momento.',
      },
      {
        id: 'c3',
        q: '¿Qué hago si olvidé mi contraseña?',
        a: 'En la pantalla de inicio de sesión tocá "¿Olvidaste tu contraseña?". Te vamos a enviar un correo a tu email registrado con las instrucciones para restablecerla.',
      },
    ],
  },
];

const Ayuda: React.FC = () => {
  const navigate = useNavigate();
  const [abierta, setAbierta] = useState<string | null>(null);

  const toggle = (id: string) => {
    setAbierta(prev => (prev === id ? null : id));
  };

  return (
    <div className="bg-background-light text-slate-900 min-h-screen font-display pb-24 max-w-md mx-auto no-scrollbar overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-slate-600 p-1 hover:bg-slate-100 rounded-full transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back_ios</span>
          </button>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">Centro de Ayuda</h1>
          <div className="w-8" />
        </div>
      </div>

      <main className="px-4 pt-6">
        {/* Subtítulo */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold">¿En qué podemos ayudarte?</h2>
          <p className="text-slate-500 text-sm font-medium mt-1">Encontrá respuestas rápidas a las dudas más frecuentes.</p>
        </div>

        {/* Secciones */}
        <div className="space-y-6">
          {secciones.map(seccion => (
            <div key={seccion.id}>
              {/* Título de sección */}
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-base text-slate-500">{seccion.icono}</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${seccion.chipColor}`}>
                  {seccion.titulo}
                </span>
              </div>

              {/* Acordeón de preguntas */}
              <div className="space-y-2">
                {seccion.preguntas.map(p => (
                  <div
                    key={p.id}
                    className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm"
                  >
                    <button
                      className="w-full flex items-center justify-between p-4 cursor-pointer text-left"
                      onClick={() => toggle(p.id)}
                      aria-expanded={abierta === p.id}
                    >
                      <span className="font-semibold text-slate-800 text-sm pr-2">{p.q}</span>
                      <span
                        className={`material-symbols-outlined text-slate-400 shrink-0 transition-transform duration-200 ${abierta === p.id ? 'rotate-180' : ''}`}
                      >
                        expand_more
                      </span>
                    </button>
                    {abierta === p.id && (
                      <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
                        {p.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Banner de contacto WhatsApp */}
        <div className="mt-10 bg-primary/10 border border-primary/20 rounded-2xl p-6 text-center">
          <div className="flex justify-center mb-3">
            <svg viewBox="0 0 24 24" className="w-10 h-10 fill-[#25D366]" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>
          <h3 className="font-bold text-slate-900 text-base mb-1">¿No encontraste tu respuesta?</h3>
          <p className="text-slate-500 text-sm mb-4">Escribinos directamente y te ayudamos.</p>
          <button
            onClick={() => window.open(WA_SOPORTE, '_blank')}
            className="w-full bg-[#25D366] text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-[#1da851] active:scale-95 transition-all shadow-sm"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Contactar por WhatsApp
          </button>
        </div>

        <p className="mt-6 mb-2 text-center text-[10px] text-slate-400 uppercase tracking-widest font-bold">TuBarrio AR v2.4.0</p>
      </main>

      {/* Decoración de fondo */}
      <div className="fixed bottom-0 right-0 -z-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed top-20 left-0 -z-10 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
    </div>
  );
};

export default Ayuda;
