// Llama a un endpoint serverless que envuelve la llamada al SDK de Gemini.
// Esto evita que el bundler incluya `@google/generative-ai` en el frontend
// (causa común de fallos en `npm run build` en Vercel).
export const verifyAddress = async (addressQuery: string, location?: { lat: number; lng: number }) => {
  const res = await fetch('/api/verify-address', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: addressQuery, location }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || 'Error verificando dirección');
  }

  return res.json();
};