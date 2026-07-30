import { z } from 'zod';

const INTL_WHATSAPP_E164_RE = /^\+[1-9]\d{6,14}$/;
const INTL_WHATSAPP_LOCAL_RE = /^\d[\d\s\-]{5,13}$/;

export const COUNTRY_CODES = [
  { code: '+549', label: 'AR (+549)', placeholder: '11 1234-5678' },
  { code: '+55',  label: 'BR (+55)',  placeholder: '11 91234-5678' },
  { code: '+598', label: 'UY (+598)', placeholder: '9 1234-5678' },
  { code: '+595', label: 'PY (+595)', placeholder: '9 1234-5678' },
  { code: '+56',  label: 'CL (+56)',  placeholder: '9 1234-5678' },
  { code: '+591', label: 'BO (+591)', placeholder: '7 1234-567' },
  { code: '+57',  label: 'CO (+57)',  placeholder: '312 345-6789' },
  { code: '+51',  label: 'PE (+51)',  placeholder: '912 345-678' },
  { code: '+34',  label: 'ES (+34)',  placeholder: '612 345 678' },
  { code: '+1',   label: 'US (+1)',   placeholder: '212 555-1234' },
  { code: '+52',  label: 'MX (+52)',  placeholder: '55 1234-5678' },
  { code: '+58',  label: 'VE (+58)',  placeholder: '412-345-6789' },
] as const;

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Email inválido')
  .max(254, 'Email demasiado largo');

export const PasswordSchema = z
  .string()
  .min(12, 'Mínimo 12 caracteres')
  .max(72, 'Máximo 72 caracteres')
  .refine((p) => /[A-Z]/.test(p), 'Requiere al menos una mayúscula')
  .refine((p) => /[a-z]/.test(p), 'Requiere al menos una minúscula')
  .refine((p) => /\d/.test(p), 'Requiere al menos un dígito')
  .refine((p) => /[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/.test(p), 'Requiere al menos un carácter especial (!@#$...)');

export const NombreCompletoSchema = z
  .string()
  .trim()
  .min(3, 'Mínimo 3 caracteres')
  .max(80, 'Máximo 80 caracteres')
  .regex(/^[\p{L}\p{M} '\-.]+$/u, 'Solo letras, espacios, apóstrofes y guiones');

export const DireccionSchema = z
  .string()
  .trim()
  .min(5, 'Dirección demasiado corta')
  .max(200, 'Dirección demasiado larga');

export const WhatsAppLocalSchema = z
  .string()
  .regex(INTL_WHATSAPP_LOCAL_RE, 'Número local inválido');

export const WhatsAppE164Schema = z
  .string()
  .regex(INTL_WHATSAPP_E164_RE, 'Número inválido');

export function normalizeWhatsApp(dialCode: string, local: string): string {
  const digits = local.replace(/\D/g, '');
  return digits ? `${dialCode}${digits}` : '';
}

export function parseWhatsApp(e164: string): { dialCode: string; local: string } {
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const c of sorted) {
    if (e164.startsWith(c.code)) {
      return { dialCode: c.code, local: e164.slice(c.code.length) };
    }
  }
  const m = e164.match(/^(\+\d{1,4})(\d+)$/);
  return m ? { dialCode: m[1], local: m[2] } : { dialCode: '+549', local: '' };
}

export const BARRIOS = [
  'El Cantón',
  'San Matías',
  'Puertos',
  'Barrio Abierto Maschwitz',
  'Escobar Centro',
] as const;

export const LOCALIDADES = [
  'Ingeniero Maschwitz',
  'Belén de Escobar',
] as const;

export const SECTORES_CANTON = ['Norte', 'Islas', 'Puerto', 'Golf'] as const;

export type Barrio = typeof BARRIOS[number];
export type Localidad = typeof LOCALIDADES[number];
export type SectorCanton = typeof SECTORES_CANTON[number];

export const BarrioSchema = z.enum(BARRIOS, { error: () => 'Seleccioná un country' });
export const LocalidadSchema = z.enum(LOCALIDADES, { error: () => 'Seleccioná una localidad' });
export const SectorCantonSchema = z.enum(SECTORES_CANTON, { error: () => 'Seleccioná un barrio' });

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Ingresa la contraseña'),
});

export const RegisterSchema = z
  .object({
    name: NombreCompletoSchema,
    email: EmailSchema,
    password: PasswordSchema,
    confirmPassword: z.string(),
    barrio: BarrioSchema,
    sector: z.string().optional(),
    localidad: LocalidadSchema,
    calle: z.string().trim().min(2, 'Mínimo 2 caracteres').max(100, 'Máximo 100 caracteres'),
    numero_altura: z.string().trim().max(20, 'Máximo 20 caracteres').optional(),
    lote: z.string().trim().max(20, 'Máximo 20 caracteres').optional(),
    whatsappLocal: z.union([WhatsAppLocalSchema, z.literal('')]),
    terms: z.literal(true, { message: 'Debes aceptar los términos y condiciones' }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })
  .refine(
    (d) => d.barrio !== 'El Cantón' || (!!d.lote && d.lote.trim().length > 0),
    { message: 'El Lote es obligatorio para El Cantón', path: ['lote'] },
  )
  .refine(
    (d) => d.barrio !== 'El Cantón' || (!!d.sector && SECTORES_CANTON.includes(d.sector as SectorCanton)),
    { message: 'El Barrio es obligatorio para El Cantón', path: ['sector'] },
  );

export const PaymentReferenceSchema = z
  .string()
  .trim()
  .min(3, 'Referencia muy corta')
  .max(50, 'Máximo 50 caracteres')
  .regex(/^[\w\-./ ]+$/, 'Solo letras, números, espacios, guiones, puntos y barras');

export const ProfileUpdateSchema = z.object({
  nombre_completo: NombreCompletoSchema.optional(),
  whatsapp: z.union([WhatsAppE164Schema, z.literal(''), z.null()]).optional(),
});

export const DomicilioUpdateSchema = z
  .object({
    barrio: BarrioSchema,
    sector: z.string().optional(),
    localidad: LocalidadSchema,
    calle: z.string().trim().min(2, 'Mínimo 2 caracteres').max(100, 'Máximo 100 caracteres'),
    numero_altura: z.string().trim().max(20, 'Máximo 20 caracteres').optional(),
    lote: z.string().trim().max(20, 'Máximo 20 caracteres').optional(),
  })
  .refine(
    (d) => d.barrio !== 'El Cantón' || (!!d.lote && d.lote.trim().length > 0),
    { message: 'El Lote es obligatorio para El Cantón', path: ['lote'] },
  )
  .refine(
    (d) => d.barrio !== 'El Cantón' || (!!d.sector && SECTORES_CANTON.includes(d.sector as SectorCanton)),
    { message: 'El Barrio es obligatorio para El Cantón', path: ['sector'] },
  );

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;
export type DomicilioUpdateInput = z.infer<typeof DomicilioUpdateSchema>;

export function flattenZodErrors<T>(
  result: z.ZodSafeParseResult<T>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (result.success) return errors;
  for (const issue of result.error.issues) {
    const key = issue.path[0]?.toString() ?? '_root';
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
