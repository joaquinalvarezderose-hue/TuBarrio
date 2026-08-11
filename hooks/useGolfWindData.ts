import { useEffect, useState } from 'react';

export type WindData = { speedKmh: number; directionDeg: number };

// Cache module-level (fuera del ciclo de render), igual patron que
// useGolfMapaUrl.ts: HoleMap se remonta en cada cambio de hoyo, y hoyos
// vecinos de la misma cancha caen en la misma celda de grilla (~1km,
// redondeo a 2 decimales), asi que navegar entre hoyos reusa el mismo dato
// de viento sin volver a pedirlo. Vencido el TTL, el proximo mount refetchea.
const windCache = new Map<string, WindData & { fetchedAt: number }>();
const TTL_MS = 15 * 60 * 1000;

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

export function useGolfWindData(lat: number | null | undefined, lng: number | null | undefined): WindData | null {
  const key = lat != null && lng != null ? cacheKey(lat, lng) : null;
  const [wind, setWind] = useState<WindData | null>(() => {
    if (!key) return null;
    const cached = windCache.get(key);
    return cached && Date.now() - cached.fetchedAt < TTL_MS ? cached : null;
  });

  useEffect(() => {
    if (lat == null || lng == null || key == null) {
      setWind(null);
      return;
    }

    const cached = windCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
      setWind(cached);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('open-meteo request failed');
        const json = await res.json();
        const speedKmh = json?.current?.wind_speed_10m;
        const directionDeg = json?.current?.wind_direction_10m;
        if (cancelled) return;
        if (typeof speedKmh !== 'number' || typeof directionDeg !== 'number') return;
        const data: WindData = { speedKmh, directionDeg };
        windCache.set(key, { ...data, fetchedAt: Date.now() });
        setWind(data);
      } catch {
        // Dato no bloqueante: si falla, la etiqueta de viento simplemente no se dibuja.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, lat, lng]);

  return wind;
}
