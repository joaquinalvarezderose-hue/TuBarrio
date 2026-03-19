// MVP fallback: no verificación externa. Devuelve la dirección tal cual.
// Esto elimina la necesidad de SDKs externos y llaves para el MVP.
export const verifyAddress = async (addressQuery: string, location?: { lat: number; lng: number }) => {
  return Promise.resolve({ text: addressQuery, grounding: null });
};