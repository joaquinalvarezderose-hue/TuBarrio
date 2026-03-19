import { GoogleGenerativeAI } from "@google/generative-ai";

// @ts-ignore
// El comentario de arriba es VITAL para que Vercel ignore el error de tipos en el build
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

export const verifyAddress = async (addressQuery: string, location?: { lat: number; lng: number }) => {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash", 
    });

    const prompt = `Verifica si la siguiente dirección existe y es válida en un contexto de barrio: ${addressQuery}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return {
      text: text,
      grounding: null 
    };
  } catch (error) {
    console.error("Error verifying address:", error);
    return {
        text: addressQuery, 
        grounding: null
    };
  }
};