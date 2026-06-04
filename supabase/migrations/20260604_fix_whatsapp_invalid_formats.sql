-- Fix whatsapp values missing the '+' prefix (13 digits starting with 549)
UPDATE public.perfiles
SET whatsapp = '+' || whatsapp
WHERE whatsapp ~ '^549\d{10}$';

-- Fix whatsapp values missing '+' and the '9' mobile prefix (12 digits starting with 54)
UPDATE public.perfiles
SET whatsapp = '+549' || substring(whatsapp from 3)
WHERE whatsapp ~ '^54[0-8]\d{9}$';

-- Set empty strings to NULL (the constraint allows NULL but not empty string)
UPDATE public.perfiles
SET whatsapp = NULL
WHERE whatsapp = '';
