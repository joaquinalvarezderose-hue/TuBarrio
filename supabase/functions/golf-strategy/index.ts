// Edge Function: golf-strategy
//
// Genera una estrategia de golpe en tiempo real (club, objetivo, riesgo,
// tip) usando Claude Haiku 4.5, en base a la posicion GPS actual del
// jugador y los datos del hoyo. Cachea el resultado en
// public.golf_estrategias_ia por (ronda_id, hoyo_id, distancia_bucket_yd)
// para no volver a llamar a la IA por el mismo tiro.
//
// Auth: el cliente de Supabase se crea con el JWT del caller (nunca
// service-role), asi que toda lectura/escritura queda gateada por las
// RLS de golf_estrategias_ia / rondas_golf / hoyos.

import { createClient } from 'npm:@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const ALLOWED_ORIGINS = new Set([
  'https://www.tubarrioapp.com.ar',
  'https://tubarrioapp.com.ar',
  'http://localhost:5173',
]);

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.tubarrioapp.com.ar',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

const BUCKET_YD = 15;
const WEAK_GPS_ACCURACY_M = 20; // mismo umbral que ACCEPTABLE_ACCURACY_M en golfBurstLocation.ts
const HARD_REJECT_ACCURACY_M = 150; // por encima de esto no vale la pena ni llamar a la IA
const MODEL = 'claude-haiku-4-5-20251001';
const YD_PER_M = 1.0936133;

function jsonResponse(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function haversineYd(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * R * Math.asin(Math.sqrt(a));
  return Math.round(meters * YD_PER_M);
}

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    club_recomendado: {
      type: 'string',
      description: "Palo sugerido para este golpe puntual (ej. 'Hierro 7', 'Driver', 'Wedge de aproximacion').",
    },
    objetivo: { type: 'string', description: 'Donde apuntar el golpe, en una frase breve.' },
    riesgo: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Advertencia tactica breve, o null si no hay ninguna relevante que mencionar.',
    },
    tip: { type: 'string', description: 'Un consejo corto y accionable, una sola frase.' },
  },
  required: ['club_recomendado', 'objetivo', 'riesgo', 'tip'],
  additionalProperties: false,
};

type Estrategia = { club_recomendado: string; objetivo: string; riesgo: string | null; tip: string };

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: { code: 'method_not_allowed', message: 'Solo POST.' } }, origin);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse(401, { error: { code: 'unauthorized', message: 'Falta autenticacion.' } }, origin);
  }

  let body: { ronda_id?: string; hoyo_id?: number; posicion?: { latitude?: number; longitude?: number; accuracy?: number } };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: { code: 'bad_request', message: 'Body invalido.' } }, origin);
  }

  const { ronda_id, hoyo_id, posicion } = body;
  if (
    typeof ronda_id !== 'string' ||
    typeof hoyo_id !== 'number' ||
    !posicion ||
    typeof posicion.latitude !== 'number' ||
    typeof posicion.longitude !== 'number' ||
    typeof posicion.accuracy !== 'number'
  ) {
    return jsonResponse(
      400,
      { error: { code: 'bad_request', message: 'Faltan ronda_id, hoyo_id o posicion (latitude/longitude/accuracy).' } },
      origin,
    );
  }
  if (posicion.accuracy > HARD_REJECT_ACCURACY_M) {
    return jsonResponse(
      422,
      {
        error: {
          code: 'weak_gps',
          message: 'Señal GPS insuficiente para calcular tu distancia. Volvé a intentar en un lugar más despejado.',
        },
      },
      origin,
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse(401, { error: { code: 'unauthorized', message: 'Sesión inválida.' } }, origin);
  }
  const callerId = userData.user.id;

  const { data: ronda, error: rondaErr } = await supabase
    .from('rondas_golf')
    .select('id, jugador_id, cancha_id, torneo_id')
    .eq('id', ronda_id)
    .maybeSingle();
  if (rondaErr || !ronda) {
    return jsonResponse(404, { error: { code: 'not_found', message: 'Ronda no encontrada.' } }, origin);
  }
  if (ronda.jugador_id !== callerId) {
    return jsonResponse(403, { error: { code: 'forbidden', message: 'Esta ronda no te pertenece.' } }, origin);
  }

  const { data: hoyo, error: hoyoErr } = await supabase
    .from('hoyos')
    .select(
      'id, cancha_id, numero_hoyo, par, yardas, indice_dificultad, categoria_dificultad, estrategia_sugerida, green_lat, green_lng, flag_lat, flag_lng',
    )
    .eq('id', hoyo_id)
    .maybeSingle();
  if (hoyoErr || !hoyo || hoyo.cancha_id !== ronda.cancha_id) {
    return jsonResponse(404, { error: { code: 'not_found', message: 'El hoyo no pertenece a esta ronda.' } }, origin);
  }
  if (hoyo.green_lat == null || hoyo.green_lng == null) {
    return jsonResponse(
      422,
      { error: { code: 'sin_coordenadas', message: 'Este hoyo todavía no tiene coordenadas cargadas.' } },
      origin,
    );
  }

  const distanciaCentroYd = haversineYd(posicion.latitude, posicion.longitude, hoyo.green_lat, hoyo.green_lng);
  const distanciaBanderaYd =
    hoyo.flag_lat != null && hoyo.flag_lng != null
      ? haversineYd(posicion.latitude, posicion.longitude, hoyo.flag_lat, hoyo.flag_lng)
      : null;
  const distanciaObjetivoYd = distanciaBanderaYd ?? distanciaCentroYd;
  const distanciaBucketYd = Math.round(distanciaObjetivoYd / BUCKET_YD) * BUCKET_YD;
  const senalDebil = posicion.accuracy > WEAK_GPS_ACCURACY_M;

  // 1. Cache hit -> no llamada a la IA.
  const { data: cached } = await supabase
    .from('golf_estrategias_ia')
    .select('club_recomendado, objetivo, riesgo, tip, distancia_objetivo_yd, senal_debil, updated_at')
    .eq('ronda_id', ronda_id)
    .eq('hoyo_id', hoyo_id)
    .eq('distancia_bucket_yd', distanciaBucketYd)
    .maybeSingle();

  if (cached) {
    return jsonResponse(
      200,
      {
        cached: true,
        estrategia: {
          club_recomendado: cached.club_recomendado,
          objetivo: cached.objetivo,
          riesgo: cached.riesgo,
          tip: cached.tip,
        },
        distancia_objetivo_yd: cached.distancia_objetivo_yd,
        senal_debil: cached.senal_debil,
        generado_en: cached.updated_at,
      },
      origin,
    );
  }

  if (!ANTHROPIC_API_KEY) {
    return jsonResponse(500, { error: { code: 'config_error', message: 'Falta configurar ANTHROPIC_API_KEY.' } }, origin);
  }

  const { data: perfil } = await supabase.from('perfiles').select('handicap').eq('id', callerId).maybeSingle();

  const systemPrompt =
    'Sos un caddie experto ayudando a un jugador amateur a decidir su PROXIMO golpe durante un torneo de golf. ' +
    'Respondé siempre en español rioplatense, tono directo y práctico, como si estuvieras parado al lado del ' +
    'jugador en la cancha. No inventes obstáculos (bunkers, agua, rough, arboles) que no te fueron informados ' +
    'explícitamente: si no tenés datos de peligros puntuales, hablá en términos generales de riesgo apoyándote ' +
    'solo en la categoría de dificultad y la nota del hoyo que te paso. Sé breve — esto se lee en un celular, ' +
    'antes de pegarle a la pelota.\n\n' +
    'El campo mas importante de tu respuesta es club_recomendado: siempre tenés que indicar un palo concreto ' +
    '(nunca una respuesta vaga como "un hierro corto"). Elegilo en base a la distancia al objetivo que te paso ' +
    'y el handicap del jugador. Como referencia de alcance para un jugador amateur (ajustá unas yardas menos ' +
    'si el handicap es alto, es decir un jugador menos consistente, y unas yardas mas si es bajo):\n' +
    '- Driver: 200+ yardas (tee de un par 4 o 5 largo)\n' +
    '- Madera 3 / Hibrido: 180-200 yardas\n' +
    '- Hierro 4-5: 160-180 yardas\n' +
    '- Hierro 6-7: 140-160 yardas\n' +
    '- Hierro 8-9: 115-140 yardas\n' +
    '- Wedge de approach (PW): 95-115 yardas\n' +
    '- Wedge de arena / lob: menos de 95 yardas, y siempre que haya que levantar la pelota rapido cerca del green\n' +
    '- Para putts sobre el green (unos pocos metros/yardas al hoyo) recomendá "Putter".\n' +
    'Estos rangos son orientativos, no una tabla exacta: usalos como referencia pero primero razoná con criterio ' +
    'de golf real (viento, si es cuesta arriba/abajo si te lo mencionan, etc. cuando haya datos).';

  const userContent = [
    `Hoyo ${hoyo.numero_hoyo} · Par ${hoyo.par} · ${hoyo.yardas ?? '?'} yardas totales · Índice de dificultad ${hoyo.indice_dificultad} (1=más difícil del recorrido, 18=más fácil).`,
    hoyo.categoria_dificultad ? `Categoría de dificultad: ${hoyo.categoria_dificultad}.` : null,
    hoyo.estrategia_sugerida ? `Nota del organizador sobre el hoyo: "${hoyo.estrategia_sugerida}"` : null,
    `Handicap del jugador: ${perfil?.handicap ?? 'no informado'}.`,
    `Distancia actual del jugador al centro del green: ${distanciaCentroYd} yardas.`,
    distanciaBanderaYd != null ? `Distancia a la bandera (posición del día): ${distanciaBanderaYd} yardas.` : null,
    senalDebil ? `Ojo: la señal GPS es débil (±${Math.round(posicion.accuracy)}m), las distancias son aproximadas.` : null,
    'Generá la recomendación para este golpe puntual, no para todo el hoyo.',
  ]
    .filter(Boolean)
    .join('\n');

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      }),
    });
  } catch (e) {
    console.error('golf-strategy: fetch a Anthropic fallo', e);
    return jsonResponse(502, { error: { code: 'ai_unavailable', message: 'No se pudo contactar al servicio de IA.' } }, origin);
  }

  if (!anthropicRes.ok) {
    const status = anthropicRes.status === 429 ? 429 : 502;
    const detail = await anthropicRes.text().catch(() => '');
    console.error('golf-strategy: Anthropic respondio', anthropicRes.status, detail);
    return jsonResponse(
      status,
      {
        error: {
          code: status === 429 ? 'rate_limited' : 'ai_error',
          message: status === 429 ? 'Demasiados pedidos, esperá unos segundos.' : 'No se pudo generar la estrategia. Intentá de nuevo.',
        },
      },
      origin,
    );
  }

  const anthropicJson = await anthropicRes.json();
  if (anthropicJson.stop_reason === 'refusal') {
    console.error('golf-strategy: refusal de Anthropic', anthropicJson.stop_details);
    return jsonResponse(502, { error: { code: 'ai_refused', message: 'No se pudo generar la estrategia. Intentá de nuevo.' } }, origin);
  }

  const textBlock = (anthropicJson.content ?? []).find((b: { type: string }) => b.type === 'text');
  let estrategia: Estrategia;
  try {
    estrategia = JSON.parse(textBlock?.text ?? '');
  } catch (e) {
    console.error('golf-strategy: no se pudo parsear la respuesta de Anthropic', textBlock?.text, e);
    return jsonResponse(502, { error: { code: 'ai_bad_response', message: 'No se pudo generar la estrategia. Intentá de nuevo.' } }, origin);
  }

  const { error: upsertErr } = await supabase.from('golf_estrategias_ia').upsert(
    {
      ronda_id,
      hoyo_id,
      gps_lat: posicion.latitude,
      gps_lng: posicion.longitude,
      gps_accuracy_m: posicion.accuracy,
      distancia_centro_yd: distanciaCentroYd,
      distancia_bandera_yd: distanciaBanderaYd,
      distancia_objetivo_yd: distanciaObjetivoYd,
      distancia_bucket_yd: distanciaBucketYd,
      club_recomendado: estrategia.club_recomendado,
      objetivo: estrategia.objetivo,
      riesgo: estrategia.riesgo,
      tip: estrategia.tip,
      respuesta_ia: anthropicJson,
      modelo: MODEL,
      senal_debil: senalDebil,
    },
    { onConflict: 'ronda_id,hoyo_id,distancia_bucket_yd' },
  );
  if (upsertErr) {
    // No es fatal para el jugador (ya tiene la respuesta), pero se pierde el cache.
    console.error('golf-strategy: no se pudo guardar la estrategia', upsertErr);
  }

  return jsonResponse(
    200,
    {
      cached: false,
      estrategia,
      distancia_objetivo_yd: distanciaObjetivoYd,
      senal_debil: senalDebil,
      generado_en: new Date().toISOString(),
    },
    origin,
  );
});
