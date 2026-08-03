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

const BURST_READINGS = 5;
const BURST_WINDOW_MS = 3000;
const ACCEPTABLE_ACCURACY_M = 20;
const MAX_ATTEMPTS = 2;

// Recolecta lecturas de geolocalizacion durante una ventana corta usando
// watchPosition (no getCurrentPosition en loop): watchPosition entrega cada
// fix a medida que el chip GPS lo va afinando, asi que el burst captura la
// mejora natural desde el "cold fix" inicial sin tener que re-disparar la
// adquisicion a mano en cada lectura. Se corta apenas se junta el numero de
// lecturas pedido o se vence la ventana, lo que pase primero.
function collectBurstReadings(
  windowMs: number,
  maxReadings: number
): Promise<{ readings: BurstPosition[]; denied: boolean }> {
  return new Promise((resolve) => {
    const readings: BurstPosition[] = [];
    let denied = false;
    let watchId: number | null = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      resolve({ readings, denied });
    };

    const timeoutId = setTimeout(finish, windowMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        readings.push({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        if (readings.length >= maxReadings) {
          clearTimeout(timeoutId);
          finish();
        }
      },
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
