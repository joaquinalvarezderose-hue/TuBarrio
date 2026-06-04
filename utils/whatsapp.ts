/**
 * Converts a raw WhatsApp number (any format) to a wa.me link.
 * Returns null if the input has no digits.
 */
export function toWhatsAppLink(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, '');
  return digits ? `https://wa.me/${digits}` : null;
}
