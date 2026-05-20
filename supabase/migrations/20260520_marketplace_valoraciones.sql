-- Tabla de valoraciones para servicios del marketplace
-- Una valoración por usuario por servicio (UNIQUE constraint)
CREATE TABLE IF NOT EXISTS valoraciones_servicios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id UUID NOT NULL REFERENCES marketplace_servicios(id) ON DELETE CASCADE,
  usuario_id  UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  puntuacion  SMALLINT NOT NULL CHECK (puntuacion BETWEEN 1 AND 5),
  comentario  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (servicio_id, usuario_id)
);

-- RLS
ALTER TABLE valoraciones_servicios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "valoraciones_select_authenticated"
  ON valoraciones_servicios FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "valoraciones_insert_own"
  ON valoraciones_servicios FOR INSERT
  TO authenticated WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "valoraciones_update_own"
  ON valoraciones_servicios FOR UPDATE
  TO authenticated
  USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "valoraciones_delete_own"
  ON valoraciones_servicios FOR DELETE
  TO authenticated USING (usuario_id = auth.uid());

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_valoraciones_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_valoraciones_updated_at
  BEFORE UPDATE ON valoraciones_servicios
  FOR EACH ROW EXECUTE FUNCTION update_valoraciones_updated_at();

-- Vista que combina servicios con sus estadísticas de valoración y datos del proveedor
-- Evita N+1 queries en el listado
CREATE OR REPLACE VIEW v_servicios_con_stats AS
SELECT
  s.id,
  s.titulo,
  s.descripcion,
  s.categoria,
  s.precio,
  s.proveedor_id,
  s.contacto_email,
  s.contacto_whatsapp,
  s.imagen_url,
  s.estado,
  s.created_at,
  s.updated_at,
  p.nombre_completo                                          AS proveedor_nombre,
  COALESCE(ROUND(AVG(v.puntuacion)::NUMERIC, 1), 0)::FLOAT AS promedio_rating,
  COUNT(v.id)::INT                                          AS total_valoraciones
FROM marketplace_servicios s
LEFT JOIN perfiles p
  ON p.id = s.proveedor_id
LEFT JOIN valoraciones_servicios v
  ON v.servicio_id = s.id
WHERE s.estado = 'activo'
GROUP BY s.id, s.titulo, s.descripcion, s.categoria, s.precio,
         s.proveedor_id, s.contacto_email, s.contacto_whatsapp,
         s.imagen_url, s.estado, s.created_at, s.updated_at,
         p.nombre_completo;
