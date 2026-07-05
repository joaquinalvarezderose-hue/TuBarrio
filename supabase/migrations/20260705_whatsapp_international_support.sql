-- Ampliar el CHECK constraint de whatsapp para aceptar números internacionales en formato E.164.
-- El constraint anterior solo aceptaba números argentinos (+549XXXXXXXXXX).
-- El nuevo acepta cualquier número E.164 válido: +[1-9] seguido de 6 a 14 dígitos.

ALTER TABLE public.perfiles
  DROP CONSTRAINT IF EXISTS perfiles_whatsapp_e164_chk;

ALTER TABLE public.perfiles
  ADD CONSTRAINT perfiles_whatsapp_e164_chk
  CHECK (whatsapp IS NULL OR whatsapp ~ '^\+[1-9]\d{6,14}$')
  NOT VALID;
