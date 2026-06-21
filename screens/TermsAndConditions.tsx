import React from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';

const Section: React.FC<{ id?: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
  <section id={id} className="mb-8 scroll-mt-20">
    <h2 className="text-lg font-bold text-secondary mb-3 border-b border-outline-variant pb-2">{title}</h2>
    <div className="text-sm text-on-surface leading-relaxed space-y-3">{children}</div>
  </section>
);

const TermsAndConditions: React.FC = () => {
  return (
    <div className="bg-surface-container-low text-on-surface min-h-screen flex flex-col">
      <header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-outline-variant shadow-sm h-16 flex items-center justify-between px-4">
        <Link to="/register" className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined text-xl">arrow_back</span>
          <span className="text-sm">Volver</span>
        </Link>
        <Logo variant="primary" className="h-[100px] w-auto absolute left-1/2 -translate-x-1/2" />
        <div className="w-16" />
      </header>

      <main className="flex-grow pt-24 pb-16 px-4 max-w-2xl mx-auto w-full">
        <div className="mb-8 text-center">
          <span className="material-symbols-outlined text-4xl text-primary">gavel</span>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-secondary">Términos y Condiciones</h1>
          <p className="mt-1 text-xs text-on-surface-variant">Última actualización: junio de 2026 · Plataforma TuBarrio</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 text-xs text-amber-800 leading-relaxed">
          <strong>Importante:</strong> Al registrarte en TuBarrio aceptás expresamente estos Términos y Condiciones y la Política de Privacidad. Leélos con atención antes de crear tu cuenta.
        </div>

        {/* ───────── TÉRMINOS Y CONDICIONES ───────── */}
        <Section title="1. Aceptación">
          <p>
            El acceso y uso de la plataforma TuBarrio (en adelante "la Plataforma") implica la aceptación plena,
            sin reservas, de estos Términos y Condiciones de Uso (en adelante "T&C"). Si no estás de acuerdo con
            alguna de las condiciones aquí establecidas, debés abstenerte de utilizar la Plataforma.
          </p>
          <p>
            La aceptación se perfecciona en el momento en que el usuario tilda la casilla correspondiente durante
            el proceso de registro y confirma su cuenta. Dicha aceptación tiene carácter vinculante conforme al
            <strong> art. 1106 del Código Civil y Comercial de la Nación (CCyCN)</strong>.
          </p>
        </Section>

        <Section title="2. Objeto y descripción del servicio">
          <p>
            TuBarrio es una plataforma digital de gestión comunitaria destinada a vecinos de un barrio o comunidad
            cerrada. Permite la organización de torneos deportivos, publicación de servicios locales, comunicación
            entre vecinos y otras funcionalidades de uso comunitario.
          </p>
          <p>
            El servicio se presta "tal como está" (<em>as is</em>). TuBarrio no garantiza disponibilidad
            ininterrumpida y se reserva el derecho de realizar mantenimientos, actualizaciones o interrupciones sin
            previo aviso.
          </p>
        </Section>

        <Section title="3. Marketplace de servicios — Descargo de responsabilidad">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 leading-relaxed space-y-3">
            <p className="font-bold text-sm">Descargo de responsabilidad — Leer con atención</p>

            <p>
              TuBarrio actúa exclusivamente como <strong>plataforma intermediaria</strong> que conecta a vecinos
              interesados en contratar un servicio con prestadores que ofrecen sus servicios dentro de la comunidad
              (en adelante "el Marketplace"). TuBarrio no es parte de ningún contrato que se celebre entre usuarios
              y prestadores, ni actúa en carácter de empleador, agente, mandatario ni representante de ninguna de
              las partes.
            </p>

            <p>
              <strong>TuBarrio no certifica, avala, verifica ni garantiza</strong>, bajo ninguna forma, (i) la
              identidad, habilitación profesional o idoneidad de los prestadores de servicios; (ii) la calidad,
              exactitud, seguridad o legalidad de los servicios ofrecidos; (iii) el cumplimiento efectivo de los
              servicios contratados; ni (iv) la satisfacción del usuario con el resultado obtenido.
            </p>

            <p>
              Toda contratación de servicios a través del Marketplace se realiza <strong>bajo la exclusiva
              responsabilidad del usuario interesado y del prestador</strong>. Cualquier disputa, reclamo,
              daño o perjuicio derivado de la prestación —o falta de prestación— de un servicio deberá resolverse
              directamente entre las partes involucradas, sin que TuBarrio tenga obligación de intervenir ni
              pueda ser considerado responsable solidario o subsidiario.
            </p>

            <p className="font-semibold">Calificaciones y reseñas</p>
            <p>
              Las opiniones, puntuaciones y reseñas publicadas en el Marketplace son expresiones de terceros usuarios
              y <strong>no reflejan la opinión de TuBarrio ni han sido verificadas por la Plataforma</strong>.
              TuBarrio no garantiza la veracidad, exactitud ni imparcialidad de dichas calificaciones y no asume
              responsabilidad alguna por los perjuicios que pudieran ocasionar a prestadores o usuarios.
            </p>

            <p className="font-semibold">Precios y condiciones de pago</p>
            <p>
              TuBarrio no interviene en la fijación de precios ni en las condiciones económicas pactadas entre
              usuarios y prestadores. <strong>El manejo, transferencia y recepción de dinero es responsabilidad
              exclusiva de las partes contratantes.</strong> TuBarrio no procesa pagos, no retiene fondos ni actúa
              como intermediario financiero, por lo que no asume responsabilidad ante incumplimientos de pago,
              fraudes económicos o controversias sobre honorarios.
            </p>

            <p className="font-semibold">Seguridad personal</p>
            <p>
              Al contratar servicios que impliquen el ingreso de un prestador al domicilio u otros espacios privados,
              el usuario actúa <strong>bajo su exclusivo riesgo y responsabilidad</strong>. TuBarrio <strong>no
              realiza verificaciones de antecedentes penales, policiales ni de ninguna otra índole</strong> sobre
              los prestadores registrados en la Plataforma. Se recomienda encarecidamente verificar la identidad
              del prestador, solicitar referencias a otros vecinos y tomar las precauciones de seguridad que
              el usuario considere pertinentes antes de permitir el acceso a su hogar o propiedad.
            </p>

            <p className="font-semibold">Datos de contacto compartidos</p>
            <p>
              Al iniciar contacto con un prestador a través del Marketplace, el usuario <strong>consiente
              expresamente</strong> que sus datos de contacto (número de WhatsApp u otros que haya proporcionado)
              sean visibles para dicho prestador. TuBarrio no controla el uso que el prestador realice de esa
              información con posterioridad a la comunicación iniciada, y no asume responsabilidad por el
              tratamiento de datos que terceros realicen fuera del ámbito de la Plataforma.
            </p>

            <p className="font-semibold">Disponibilidad y cancelaciones</p>
            <p>
              TuBarrio no garantiza la disponibilidad de ningún prestador ni el cumplimiento de los horarios,
              plazos o condiciones acordados entre las partes. Ante cancelaciones, demoras o incumplimientos por
              parte del prestador, <strong>TuBarrio no tiene obligación de mediar, compensar ni resolver la
              disputa</strong>. El usuario deberá gestionar directamente con el prestador cualquier reclamo
              derivado de estas situaciones.
            </p>

            <p>
              En consecuencia, <strong>TuBarrio queda eximida de toda responsabilidad</strong> por daños directos,
              indirectos, incidentales o consecuentes que pudieran derivarse de las relaciones entre usuarios y
              prestadores, conforme a los <strong>artículos 1719, 1720 y concordantes del Código Civil y Comercial
              de la Nación</strong>.
            </p>

            <p>
              Se recomienda a los usuarios verificar las referencias, antecedentes e idoneidad del prestador antes
              de contratar cualquier servicio.
            </p>
          </div>
        </Section>

        <Section title="4. Registro de usuario">
          <p>
            Para acceder a las funcionalidades de la Plataforma es necesario crear una cuenta. El usuario se
            compromete a proporcionar datos verdaderos, exactos, completos y actualizados. Cualquier información
            falsa podrá derivar en la suspensión o cancelación de la cuenta sin derecho a reclamo.
          </p>
          <p>
            El usuario es responsable de mantener la confidencialidad de su contraseña y de todas las actividades
            realizadas bajo su cuenta.
          </p>
        </Section>

        <Section title="5. Uso permitido y prohibiciones">
          <p>Queda expresamente prohibido:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Utilizar la Plataforma para fines ilícitos o contrarios a estos T&C.</li>
            <li>Publicar contenido difamatorio, discriminatorio, obsceno o que infrinja derechos de terceros.</li>
            <li>Intentar acceder de forma no autorizada a sistemas, datos o cuentas de otros usuarios.</li>
            <li>Realizar ingeniería inversa, descompilar o intentar extraer el código fuente de la Plataforma.</li>
            <li>Transmitir virus, malware o cualquier código malicioso.</li>
          </ul>
        </Section>

        <Section title="6. Propiedad intelectual">
          <p>
            Todos los contenidos de la Plataforma (diseño, código, marca, logotipos, textos) son propiedad de
            TuBarrio y están protegidos por las leyes de propiedad intelectual vigentes en la República Argentina.
            Queda prohibida su reproducción total o parcial sin autorización expresa.
          </p>
        </Section>

        <Section title="7. Modificaciones a los T&C">
          <p>
            TuBarrio podrá modificar estos T&C en cualquier momento. Los cambios serán notificados mediante un
            aviso visible en la Plataforma con al menos 7 (siete) días de anticipación. El uso continuado de la
            Plataforma tras la vigencia de los nuevos T&C implica su aceptación.
          </p>
        </Section>

        <Section title="8. Rescisión">
          <p>
            TuBarrio podrá suspender o cancelar la cuenta de un usuario que incumpla estos T&C, sin necesidad de
            interpelación previa, conforme al <strong>art. 1084 CCyCN</strong>.
          </p>
        </Section>

        <Section title="9. Ley aplicable y jurisdicción">
          <p>
            Estos T&C se rigen por las leyes de la República Argentina. Para cualquier controversia, las partes
            se someten a la jurisdicción de los Tribunales Ordinarios de la Ciudad Autónoma de Buenos Aires,
            renunciando a cualquier otro fuero o jurisdicción que pudiere corresponderles.
          </p>
        </Section>

        {/* ───────── POLÍTICA DE PRIVACIDAD ───────── */}
        <div id="privacidad" className="mt-12 mb-8 scroll-mt-20">
          <div className="flex items-center gap-3 border-b-2 border-primary pb-3 mb-6">
            <span className="material-symbols-outlined text-primary text-2xl">privacy_tip</span>
            <h2 className="text-xl font-black text-secondary">Política de Privacidad</h2>
          </div>
          <p className="text-xs text-on-surface-variant mb-6">
            Esta política es parte integrante de los T&C y rige el tratamiento de los datos personales conforme a
            la <strong>Ley 25.326 de Protección de Datos Personales</strong> y su decreto reglamentario 1558/2001.
          </p>
        </div>

        <Section id="responsable" title="10. Responsable del tratamiento de datos">
          <p>
            El responsable del tratamiento es el operador de la Plataforma TuBarrio. Para contactos relacionados
            con el tratamiento de datos personales, dirigirse a:{' '}
            <strong>joaquinalvarezderose@gmail.com</strong>.
          </p>
          <p className="text-xs text-on-surface-variant">
            Base de datos inscripta ante la Agencia de Acceso a la Información Pública (AAIP) conforme al
            art. 21 de la Ley 25.326.
          </p>
        </Section>

        <Section title="11. Datos personales recolectados">
          <p>Al registrarte, TuBarrio recolecta los siguientes datos:</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-outline-variant rounded-lg overflow-hidden">
              <thead className="bg-surface-variant">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Dato</th>
                  <th className="text-left px-3 py-2 font-semibold">Obligatorio</th>
                  <th className="text-left px-3 py-2 font-semibold">Finalidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                <tr><td className="px-3 py-2">Nombre completo</td><td className="px-3 py-2">Sí</td><td className="px-3 py-2">Identificación dentro de la comunidad</td></tr>
                <tr><td className="px-3 py-2">Correo electrónico</td><td className="px-3 py-2">Sí</td><td className="px-3 py-2">Autenticación y comunicaciones</td></tr>
                <tr><td className="px-3 py-2">Contraseña</td><td className="px-3 py-2">Sí</td><td className="px-3 py-2">Seguridad de acceso (almacenada cifrada)</td></tr>
                <tr><td className="px-3 py-2">Dirección domiciliaria</td><td className="px-3 py-2">Sí</td><td className="px-3 py-2">Verificación de residencia en el barrio</td></tr>
                <tr><td className="px-3 py-2">Número de WhatsApp</td><td className="px-3 py-2">No</td><td className="px-3 py-2">Comunicación directa opcional</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-on-surface-variant">
            Los datos son almacenados en servidores de <strong>Supabase Inc.</strong> (infraestructura en la nube).
            Supabase actúa como encargado del tratamiento conforme al art. 25 de la Ley 25.326.
          </p>
        </Section>

        <Section title="12. Medidas de seguridad y limitación de responsabilidad ante incidentes">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-900 leading-relaxed">
            <p className="font-bold mb-2">Cláusula de limitación de responsabilidad — Leer con atención</p>
            <p className="mb-2">
              TuBarrio implementa medidas técnicas y organizativas razonables para proteger los datos personales de
              sus usuarios, incluyendo cifrado en tránsito (TLS/HTTPS), almacenamiento cifrado de contraseñas
              (bcrypt), políticas de seguridad a nivel de base de datos (Row Level Security) y control de acceso
              por roles.
            </p>
            <p className="mb-2">
              No obstante lo anterior, <strong>ningún sistema de transmisión o almacenamiento de información en
              Internet es completamente seguro</strong>. TuBarrio no puede garantizar de forma absoluta la
              invulnerabilidad de sus sistemas frente a ataques informáticos, accesos no autorizados, hackeos,
              malware u otras amenazas cibernéticas.
            </p>
            <p className="mb-2">
              En consecuencia, <strong>TuBarrio no será responsable</strong> por los daños directos, indirectos,
              incidentales, especiales o consecuentes que pudieran derivarse de un acceso no autorizado a la
              información por parte de terceros, siempre que dicho incidente sea consecuencia de un caso de
              <strong> fuerza mayor o caso fortuito</strong>, conforme a los{' '}
              <strong>artículos 1730 y 1731 del Código Civil y Comercial de la Nación</strong>. Los ciberataques
              perpetrados por terceros ajenos a TuBarrio constituyen, en principio, causas externas que interrumpen
              el nexo causal de responsabilidad del operador.
            </p>
            <p>
              <strong>Al aceptar estos T&C, el usuario reconoce y acepta expresamente el riesgo residual
              inherente a todo sistema digital</strong> y exime a TuBarrio de responsabilidad en los supuestos
              descritos precedentemente, en la máxima medida permitida por la legislación argentina vigente.
            </p>
          </div>
        </Section>

        <Section title="13. Notificación de brechas de seguridad">
          <p>
            En caso de detectarse una brecha de seguridad que comprometa datos personales de los usuarios,
            TuBarrio notificará a los titulares afectados y a la Agencia de Acceso a la Información Pública (AAIP)
            en los plazos que establezca la normativa vigente, conforme a la{' '}
            <strong>Resolución AAIP 47/2018</strong> y disposiciones concordantes.
          </p>
          <p>
            La notificación incluirá, como mínimo: la naturaleza del incidente, los datos comprometidos, las
            medidas adoptadas y los datos de contacto del responsable.
          </p>
        </Section>

        <Section title="14. Transferencia y compartición de datos">
          <p>
            TuBarrio no vende ni cede datos personales a terceros con fines comerciales. Los datos podrán ser
            compartidos únicamente con:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Supabase Inc.</strong> — proveedor de infraestructura de base de datos y autenticación.</li>
            <li><strong>Google (Gemini API)</strong> — para el servicio de verificación de dirección (solo se envía el texto ingresado por el usuario, sin otros datos identificatorios).</li>
            <li>Autoridades competentes, cuando exista obligación legal.</li>
          </ul>
        </Section>

        <Section title="15. Derechos del titular (Habeas Data — Art. 43 CN)">
          <p>
            Conforme a los artículos 14 al 19 de la Ley 25.326, los titulares de datos personales tienen derecho
            a acceder, rectificar, actualizar, suprimir y a solicitar la confidencialidad de sus datos
            (derechos ARCO).
          </p>
          <p>Para ejercer estos derechos, el titular debe enviar una solicitud a:</p>
          <div className="bg-surface-variant rounded-lg px-4 py-3 text-sm font-medium">
            joaquinalvarezderose@gmail.com
          </div>
          <p className="text-xs text-on-surface-variant">
            TuBarrio responderá dentro de los 5 (cinco) días hábiles de recibida la solicitud, conforme al
            art. 14 inc. 3 de la Ley 25.326. La AAIP (Agencia de Acceso a la Información Pública) es el
            organismo de control competente: <strong>www.argentina.gob.ar/aaip</strong>.
          </p>
        </Section>

        <Section title="16. Retención de datos">
          <p>
            Los datos personales se conservarán mientras la cuenta del usuario permanezca activa. Una vez
            solicitada la eliminación de la cuenta, los datos serán suprimidos en un plazo máximo de 30 días,
            salvo obligación legal de conservación.
          </p>
        </Section>

        <Section title="17. Menores de edad">
          <p>
            La Plataforma no está dirigida a personas menores de 18 años. Si un menor proporcionara datos sin
            consentimiento de sus responsables legales, TuBarrio procederá a eliminar dicha cuenta e información
            en cuanto tome conocimiento de la situación.
          </p>
        </Section>

        <Section title="18. Contacto">
          <p>Para consultas, reclamos o ejercicio de derechos:</p>
          <div className="bg-surface-variant rounded-lg px-4 py-3 space-y-1 text-sm">
            <p><strong>Plataforma:</strong> TuBarrio</p>
            <p><strong>Correo:</strong> joaquinalvarezderose@gmail.com</p>
            <p><strong>Jurisdicción:</strong> Ciudad Autónoma de Buenos Aires, Argentina</p>
          </div>
        </Section>

        <div className="mt-10 text-center">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-primary text-on-primary-fixed font-bold px-6 py-3 rounded-xl shadow-md active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined text-xl">arrow_back</span>
            Volver al registro
          </Link>
        </div>
      </main>

      <footer className="py-6 text-center">
        <p className="text-[10px] text-on-surface-variant font-medium tracking-widest uppercase opacity-50">
          TuBarrio © 2026 · Buenos Aires, Argentina · Ley 25.326
        </p>
      </footer>
    </div>
  );
};

export default TermsAndConditions;
