ALTER TABLE inscripciones_torneo
  ADD COLUMN IF NOT EXISTS nombre_contacto TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_contacto TEXT;

UPDATE inscripciones_torneo i
SET
  nombre_contacto = p.nombre_completo,
  whatsapp_contacto = p.whatsapp
FROM perfiles p
WHERE i.perfil_id = p.id;
