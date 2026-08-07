export type BurstPosition = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export type BurstLocationResult =
  | { status: 'ok'; position: BurstPosition; weakSignal: boolean }
  | { status: 'denied' }
  | { status: 'timeout' }
  | { status: 'unsupported' };

function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

// El texto "habilitalo en la configuracion del navegador" solo tiene sentido
// si el usuario esta viendo la barra del navegador. Cuando la app corre
// instalada como PWA (icono en el inicio, sin barra de navegador visible)
// ese permiso vive en los ajustes del sistema operativo, no en un navegador,
// asi que el mensaje tiene que apuntar ahi para no confundir al jugador.
export function getLocationDeniedMessage(): string {
  if (!isStandalonePwa()) {
    return 'Permiso de ubicación denegado. Habilitalo en la configuración del navegador.';
  }
  if (isIOS()) {
    return 'Permiso de ubicación denegado. Andá a Ajustes del iPhone → Privacidad y seguridad → Localización, buscá Tu Barrio y habilitalo.';
  }
  return 'Permiso de ubicación denegado. Andá a Ajustes del teléfono → Apps → Tu Barrio → Permisos → Ubicación, y habilitalo.';
}

const BURST_READINGS = 5;
const BURST_WINDOW_MS = 3000;
const ACCEPTABLE_ACCURACY_M = 20;
const MAX_ATTEMPTS = 2;
// Lecturas de precalentado mas viejas que esto se descartan: si el jugador
// dejo el mapa abierto varios minutos sin pedir su posicion, esas lecturas
// ya no representan un fix "en caliente".
const WARM_BUFFER_MS = 5000;

type TimedReading = BurstPosition & { at: number };

let warmWatchId: number | null = null;
let warmBuffer: TimedReading[] = [];
const warmSubscribers = new Set<(reading: BurstPosition) => void>();

function pruneWarmBuffer() {
  const cutoff = Date.now() - WARM_BUFFER_MS;
  warmBuffer = warmBuffer.filter((r) => r.at >= cutoff);
}

// Mantiene el chip GPS "despierto" con lecturas continuas mientras el
// jugador esta mirando un hoyo con coordenadas, para que cuando pida su
// posicion el burst arranque desde un fix ya afinado en vez de un cold
// start (los primeros segundos de un watchPosition nuevo suelen traer
// 50-100m de error hasta que el chip afina la triangulacion).
export function startGpsWarmup(): void {
  if (warmWatchId !== null) return;
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;

  warmWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      warmBuffer.push({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        at: Date.now(),
      });
      pruneWarmBuffer();
      warmSubscribers.forEach((cb) =>
        cb({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy })
      );
    },
    (err) => {
      // Si el permiso esta denegado no tiene sentido seguir escuchando;
      // el burst on-demand va a volver a intentar y reportar el error a la UI.
      if (err.code === err.PERMISSION_DENIED) stopGpsWarmup();
    },
    { enableHighAccuracy: true, maximumAge: 0 }
  );
}

export function stopGpsWarmup(): void {
  if (warmWatchId !== null) {
    navigator.geolocation.clearWatch(warmWatchId);
    warmWatchId = null;
  }
  warmBuffer = [];
}

// Recolecta lecturas de geolocalizacion durante una ventana corta. Si el
// precalentado esta activo, reusa ese mismo watchPosition (sumando lo que
// ya tenia acumulado en el buffer) en vez de abrir una segunda adquisicion;
// si no, arranca una propia como antes.
function collectBurstReadings(
  windowMs: number,
  maxReadings: number
): Promise<{ readings: BurstPosition[]; denied: boolean }> {
  return new Promise((resolve) => {
    pruneWarmBuffer();
    const readings: BurstPosition[] = warmBuffer.map(({ at, ...r }) => r);
    let denied = false;
    let settled = false;
    let ownWatchId: number | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      warmSubscribers.delete(onReading);
      if (ownWatchId !== null) navigator.geolocation.clearWatch(ownWatchId);
      resolve({ readings, denied });
    };

    const timeoutId = setTimeout(finish, windowMs);

    function onReading(r: BurstPosition) {
      readings.push(r);
      if (readings.length >= maxReadings) {
        clearTimeout(timeoutId);
        finish();
      }
    }

    if (readings.length >= maxReadings) {
      clearTimeout(timeoutId);
      finish();
      return;
    }

    if (warmWatchId !== null) {
      warmSubscribers.add(onReading);
    } else {
      ownWatchId = navigator.geolocation.watchPosition(
        (pos) =>
          onReading({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            denied = true;
            clearTimeout(timeoutId);
            finish();
          }
          // POSITION_UNAVAILABLE / TIMEOUT de una lectura puntual se ignoran:
          // la siguiente lectura del burst puede resolver igual.
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: windowMs }
      );
    }
  });
}

// Toma un burst de lecturas GPS y devuelve la de mejor precision
// (`accuracy` mas bajo). Si la mejor lectura del burst no llega al umbral
// aceptable, reintenta una vez mas antes de devolver el resultado igual
// (con weakSignal=true) para que la UI pueda avisar.
export async function getBurstPosition(): Promise<BurstLocationResult> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return { status: 'unsupported' };
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { readings, denied } = await collectBurstReadings(BURST_WINDOW_MS, BURST_READINGS);
    if (denied) return { status: 'denied' };
    if (readings.length === 0) continue;

    const best = readings.reduce((a, b) => (b.accuracy < a.accuracy ? b : a));
    const isLastAttempt = attempt === MAX_ATTEMPTS - 1;
    if (best.accuracy <= ACCEPTABLE_ACCURACY_M || isLastAttempt) {
      return { status: 'ok', position: best, weakSignal: best.accuracy > ACCEPTABLE_ACCURACY_M };
    }
  }

  return { status: 'timeout' };
}
