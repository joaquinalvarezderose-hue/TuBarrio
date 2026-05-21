-- Seed de servicios de prueba para el marketplace
-- Cubre todas las categorías: Plomería, Electricidad, Pintura, Jardinería, Tutorías, Otros
-- Los proveedor_id quedan en NULL (proveedor externo / sin perfil registrado)
-- imagen_url usa avatares de UI Avatars para que el componente ProvImg siempre tenga fallback

INSERT INTO marketplace_servicios
  (titulo, descripcion, categoria, precio, contacto_email, contacto_whatsapp, imagen_url, estado)
VALUES

-- Plomería
(
  'Carlos Fontanero',
  'Reparación de cañerías, destapaciones y colocación de sanitarios. Más de 15 años de experiencia en el barrio.',
  'Plomería', 1800,
  'carlos.fontanero@gmail.com', '5491112345678',
  'https://ui-avatars.com/api/?name=Carlos+Fontanero&background=006e1c&color=fff&size=128',
  'activo'
),
(
  'Miguel Instalaciones',
  'Colocación de termotanques, calefones y reparación de pérdidas. Urgencias 24hs.',
  'Plomería', 2200,
  'miguel.inst@gmail.com', '5491198765432',
  NULL,
  'activo'
),

-- Electricidad
(
  'Roberto Electricista',
  'Instalaciones eléctricas domiciliarias, tableros y cableado. Habilitado ENRE.',
  'Electricidad', 2500,
  'roberto.elec@gmail.com', '5491187654321',
  'https://ui-avatars.com/api/?name=Roberto+Electricista&background=f5a623&color=fff&size=128',
  'activo'
),
(
  'Luz & Fuerza SRL',
  'Empresa familiar de electricidad industrial y residencial. Presupuesto sin cargo.',
  'Electricidad', 3000,
  'luzyfuerza@gmail.com', '5491176543210',
  NULL,
  'activo'
),

-- Pintura
(
  'Hernán Pinturas',
  'Pintura interior y exterior, temple, enduído y trabajo fino. Materiales incluidos.',
  'Pintura', 1500,
  'hernan.pint@gmail.com', '5491165432109',
  'https://ui-avatars.com/api/?name=Hernán+Pinturas&background=e53935&color=fff&size=128',
  'activo'
),
(
  'Marcos y Nicolás',
  'Dúo de pintores con experiencia en locales comerciales y departamentos. Trabajamos fines de semana.',
  'Pintura', 1200,
  NULL, '5491154321098',
  NULL,
  'activo'
),

-- Jardinería
(
  'Verde Barrio',
  'Diseño, mantenimiento y poda de jardines y patios. Servicio mensual con descuento.',
  'Jardinería', 900,
  'verdebarrio@gmail.com', '5491143210987',
  'https://ui-avatars.com/api/?name=Verde+Barrio&background=2e7d32&color=fff&size=128',
  'activo'
),
(
  'Sergio Paisajista',
  'Creación de jardines desde cero, riego automático y mantenimiento de espacios verdes.',
  'Jardinería', 1400,
  'sergio.paisa@gmail.com', NULL,
  NULL,
  'activo'
),

-- Tutorías
(
  'Lucía Matemáticas',
  'Clases particulares de matemáticas para secundaria y CBC. Online o presencial en el barrio.',
  'Tutorías', 800,
  'lucia.mate@gmail.com', '5491132109876',
  'https://ui-avatars.com/api/?name=Lucía+Matemáticas&background=1565c0&color=fff&size=128',
  'activo'
),
(
  'Tomás Inglés',
  'Profesor de inglés nivel inicial a avanzado. Preparación para exámenes internacionales (FCE, IELTS).',
  'Tutorías', 1000,
  'tomas.ingles@gmail.com', '5491121098765',
  NULL,
  'activo'
),

-- Otros
(
  'Fletes Rápido',
  'Mudanzas y fletes en camioneta por el barrio y zona sur. Cargamos y descargamos.',
  'Otros', 2000,
  'fletesrapido@gmail.com', '5491110987654',
  'https://ui-avatars.com/api/?name=Fletes+Rápido&background=6a1b9a&color=fff&size=128',
  'activo'
),
(
  'Ana Costurera',
  'Arreglos de ropa, confección a medida y uniformes escolares. Entrega en 48hs.',
  'Otros', 600,
  'ana.costurera@gmail.com', '5491109876543',
  NULL,
  'activo'
);

-- ── Valoraciones de prueba ────────────────────────────────────────────────────
-- Para ver el carrusel de Recomendados necesitás filas en valoraciones_servicios.
-- Corré esto DESPUÉS de tener usuarios reales en `perfiles`, reemplazando los UUIDs.
--
-- Ejemplo (descomentiá y reemplazá los IDs):
--
-- INSERT INTO valoraciones_servicios (servicio_id, usuario_id, puntuacion, comentario)
-- SELECT
--   s.id,
--   '<UUID_DE_UN_PERFIL_REAL>'::uuid,
--   5,
--   'Excelente servicio, muy recomendable'
-- FROM marketplace_servicios s
-- WHERE s.titulo = 'Carlos Fontanero';
