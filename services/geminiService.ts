import { GoogleGenerativeAI } from "@google/generative-ai";

// Usamos import.meta.env que es el estándar de Vite/Vercel
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || "");

export const verifyAddress = async (addressQuery: string, location?: { lat: number; lng: number }) => {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash", // Usamos una versión estable compatible con la web
    });

    const prompt = `Verifica si la siguiente dirección existe y es válida en un contexto de barrio: ${addressQuery}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return {
      text: text,
      grounding: null // Simplificamos para evitar errores de compilación
    };
  } catch (error) {
    console.error("Error verifying address:", error);
    return {
        text: addressQuery, // Si falla la IA, devolvemos la dirección tal cual para no trabar al vecino
        grounding: null
    };
  }
};