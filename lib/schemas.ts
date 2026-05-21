import { z } from 'zod';

const ARG_WHATSAPP_E164_RE = /^\+549\d{10}$/;
const ARG_WHATSAPP_LOCAL_RE = /^\d[\d\s\-]{7,11}$/;

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
  .regex(ARG_WHATSAPP_LOCAL_RE, 'Número local inválido (ej: 11 1234-5678)');

export const WhatsAppE164Schema = z
  .string()
  .regex(ARG_WHATSAPP_E164_RE, 'Formato esperado: +549XXXXXXXXXX');

export function normalizeWhatsApp(local: string): string {
  const digits = local.replace(/\D/g, '');
  return digits ? `+549${digits}` : '';
}

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
    address: DireccionSchema,
    whatsappLocal: z.union([WhatsAppLocalSchema, z.literal('')]),
    terms: z.literal(true, { message: 'Debes aceptar los términos y condiciones' }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

export const PaymentReferenceSchema = z
  .string()
  .trim()
  .min(3, 'Referencia muy corta')
  .max(50, 'Máximo 50 caracteres')
  .regex(/^[\w\-./ ]+$/, 'Solo letras, números, espacios, guiones, puntos y barras');

export const ProfileUpdateSchema = z.object({
  nombre_completo: NombreCompletoSchema.optional(),
  whatsapp: z.union([WhatsAppE164Schema, z.literal(''), z.null()]).optional(),
  direccion: DireccionSchema.optional(),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;

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
