-- Tabla de recomendaciones de proveedores enviadas por vecinos
CREATE TABLE recomendaciones_servicios (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id       UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  nombre_proveedor TEXT NOT NULL CHECK (char_length(trim(nombre_proveedor)) BETWEEN 3 AND 150),
  rubro            TEXT NOT NULL CHECK (rubro IN ('Plomería','Electricidad','Gasista Matriculado','Pintura y Albañilería','Climatización (AA)','Otros Servicios')),
  telefono         TEXT NOT NULL CHECK (char_length(regexp_replace(telefono, '\D', '', 'g')) BETWEEN 8 AND 15),
  motivo           TEXT CHECK (motivo IS NULL OR char_length(trim(motivo)) <= 1000),
  estado           TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para que admins filtren por estado
CREATE INDEX ON recomendaciones_servicios (estado, created_at DESC);

-- RLS
ALTER TABLE recomendaciones_servicios ENABLE ROW LEVEL SECURITY;

-- Usuarios: solo insertan y leen las propias
CREATE POLICY "usuario inserta la propia" ON recomendaciones_servicios
  FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "usuario lee las propias" ON recomendaciones_servicios
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());

-- Admins: leen todas y pueden actualizar el estado (moderación)
CREATE POLICY "admin lee todas" ON recomendaciones_servicios
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfiles
      WHERE perfiles.id = auth.uid() AND perfiles.rol = 'admin'
    )
  );

CREATE POLICY "admin actualiza estado" ON recomendaciones_servicios
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfiles
      WHERE perfiles.id = auth.uid() AND perfiles.rol = 'admin'
    )
  )
  WITH CHECK (true);

-- Sin policy DELETE: ningún usuario puede borrar filas por RLS (solo service_role)
