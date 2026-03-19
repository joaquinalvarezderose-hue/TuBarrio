// Serverless endpoint for Vercel: wraps @google/generative-ai calls
// Keeps the API key on the server and returns a safe, small payload to the client.
import { GoogleGenerativeAI } from "@google/generative-ai";

// @ts-ignore - runtime-only environment variables
const genAI = new GoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '' });

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { address, location } = req.body || {};
  if (!address) return res.status(400).json({ error: 'Missing address' });

  try {
    const prompt = `Verifica si la siguiente dirección existe y es válida en un contexto de barrio: ${address}`;

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Intenta varias firmas posibles del SDK y extrae texto de forma segura
    let result: any;
    try {
      result = await model.generateContent(prompt);
    } catch (e) {
      // Algunas versiones aceptan un objeto de entrada
      result = await model.generateContent({ input: prompt });
    }

    // Extraer texto de forma segura
    let text = '';
    try {
      const response = (result && result.response) ? await result.response : result;
      if (response) {
        if (typeof response.text === 'function') {
          text = await response.text();
        } else if (typeof response.text === 'string') {
          text = response.text;
        }
      }
    } catch (e) {
      // ignore
    }

    if (!text && result?.candidates?.[0]) {
      const c = result.candidates[0];
      if (c.content) text = c.content.map((p: any) => p.text || '').join('');
      if (!text && c.text) text = c.text;
    }

    if (!text) text = address;

    const grounding = result?.candidates?.[0]?.groundingMetadata?.groundingChunks || null;

    res.status(200).json({ text, grounding });
  } catch (error) {
    console.error('verify-address error', error);
    res.status(500).json({ error: 'Error verifying address' });
  }
}
