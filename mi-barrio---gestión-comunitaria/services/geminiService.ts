
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

export const verifyAddress = async (addressQuery: string, location?: { lat: number; lng: number }) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Verifica si la siguiente dirección existe y es válida en un contexto de barrio/vecindario. Si es posible, devuélvela formateada correctamente: ${addressQuery}`,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: location ? {
              latitude: location.lat,
              longitude: location.lng
            } : undefined
          }
        }
      },
    });

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    return {
      text: response.text,
      grounding: groundingChunks
    };
  } catch (error) {
    console.error("Error verifying address:", error);
    throw error;
  }
};
