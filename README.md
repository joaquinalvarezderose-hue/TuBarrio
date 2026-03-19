<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1Swl0SmnOHQFX690voAIaJuF55cDg9m32

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Nota — MVP sin servicios de Google

- Para el MVP se eliminaron las integraciones con los servicios de Google (Gemini / geocoding) para simplificar el despliegue y evitar dependencias y claves en el cliente.
- Ahora la verificación de dirección utiliza el valor que el usuario ingresa tal cual (sin geocodificación externa). Esto mantiene el flujo de registro simple y evita configuraciones de API keys.

Acciones importantes al desplegar:
- Elimina las variables de entorno relacionadas con Google de tu panel de Vercel (por ejemplo `GEMINI_API_KEY` o `VITE_GEMINI_API_KEY`).
- Asegúrate de tener las variables necesarias para Supabase si usas esa integración: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

Revertir o mejorar más adelante:
- Si luego quieres reactivar la verificación con un servicio externo, puedes:
   1. Reimplementar un endpoint server-side que llame al proveedor de geocodificación (p. ej. Nominatim, Google Maps) y devolver sólo el texto/coords al cliente.
   2. Añadir la API key como variable de entorno en Vercel (no en el cliente).
   3. Actualizar `services/geminiService.ts` para llamar al endpoint server-side.

Esta decisión reduce la complejidad para el MVP y evita exponer claves o incluir SDKs server-only en el bundle del cliente.
