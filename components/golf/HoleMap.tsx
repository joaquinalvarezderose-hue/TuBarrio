import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import circle from '@turf/circle';
import distance from '@turf/distance';
import bearing from '@turf/bearing';
import destination from '@turf/destination';
import { point } from '@turf/helpers';

type HoleMapProps = {
  teeLat: number;
  teeLng: number;
  greenLat: number;
  greenLng: number;
  par?: number | null;
  yardas?: number | null;
  indice?: number | null;
  className?: string;
  // Si es false (default), el mapa no responde a arrastre de un dedo/mouse —
  // pensado para verse embebido en una pantalla con scroll propio (el gesto
  // de swipe vertical debe scrollear la pagina, no panear el mapa). Pasar
  // true solo en vistas de pantalla completa, sin scroll de pagina alrededor.
  interactive?: boolean;
};

// Range rings de referencia alrededor del TEE (ayuda para el golpe de
// salida), en yardas.
const RING_RADII_YD = [50, 100, 150];
const YD_TO_KM = 0.0009144;
const RING_COLOR = '#3b82f6';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

const HoleMap: React.FC<HoleMapProps> = ({
  teeLat,
  teeLng,
  greenLat,
  greenLng,
  par,
  yardas,
  indice,
  className = '',
  interactive = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: interactive,
      scrollWheelZoom: false,
    });
    mapRef.current = map;

    // Leaflet no puede rotar el mapa (no hay "arriba = hacia el green"), asi
    // que en cambio centramos la vista exactamente en el tee: el green
    // reflejado a traves del tee da un punto simetrico, y encuadrar
    // [green, reflejo] dentro del viewport garantiza que el centro resultante
    // sea el tee (es el punto medio de ambos por construccion) con el zoom
    // mas ajustado que igual deja ver el green completo. Ademas esto tiene
    // que pasar ANTES de agregar capas vectoriales (circleMarker, geoJSON):
    // sin una vista valida, el renderer interno de Leaflet (_clipPoints)
    // explota leyendo bounds en pixeles que todavia no existen.
    const reflejo = L.latLng(2 * teeLat - greenLat, 2 * teeLng - greenLng);
    const bounds = L.latLngBounds([[greenLat, greenLng], reflejo]);
    map.fitBounds(bounds, { padding: [40, 40] });

    if (MAPBOX_TOKEN) {
      L.tileLayer(
        `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}{r}.jpg90?access_token=${MAPBOX_TOKEN}`,
        { maxZoom: 19, tileSize: 256, detectRetina: true, attribution: '&copy; Mapbox &copy; OpenStreetMap' }
      ).addTo(map);
    } else {
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
      ).addTo(map);

      // Esri World Imagery sale bastante plana/desaturada — este filtro la
      // realza para que se acerque un poco mas al look "vivido" de Mapbox/Google.
      const tilePane = map.getPane('tilePane');
      if (tilePane) tilePane.style.filter = 'saturate(1.4) contrast(1.1) brightness(1.03)';
    }

    const teePoint = point([teeLng, teeLat]);
    const greenPoint = point([greenLng, greenLat]);
    // Rumbo tee->green: los rings se centran en el tee, y su etiqueta de
    // distancia se ubica sobre la linea de juego (hacia el green), no en
    // un punto arbitrario del circulo.
    const rumbo = bearing(teePoint, greenPoint);

    RING_RADII_YD.forEach((yd) => {
      const radioKm = yd * YD_TO_KM;
      const ring = circle(teePoint, radioKm, { units: 'kilometers', steps: 64 });
      L.geoJSON(ring as any, {
        style: { color: RING_COLOR, weight: 2, opacity: 0.9, fill: false },
      }).addTo(map);

      const labelPoint = destination(teePoint, radioKm, rumbo, { units: 'kilometers' });
      const [labelLng, labelLat] = labelPoint.geometry.coordinates;
      L.marker([labelLat, labelLng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="transform:translate(-50%,-50%);background:${RING_COLOR};color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:9999px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.4);">${yd} yd</div>`,
          iconSize: [0, 0],
        }),
        interactive: false,
      }).addTo(map);
    });

    L.circleMarker([teeLat, teeLng], {
      radius: 7,
      color: '#1e293b',
      weight: 2,
      fillColor: '#f8fafc',
      fillOpacity: 1,
    })
      .bindTooltip('Tee', { permanent: false })
      .addTo(map);

    L.circleMarker([greenLat, greenLng], {
      radius: 7,
      color: '#166534',
      weight: 2,
      fillColor: '#4a9c40',
      fillOpacity: 1,
    })
      .bindTooltip('Green', { permanent: false })
      .addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [teeLat, teeLng, greenLat, greenLng, interactive]);

  const distanceYd = Math.round(distance(point([teeLng, teeLat]), point([greenLng, greenLat]), { units: 'kilometers' }) / YD_TO_KM);

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="h-full w-full" />

      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2 pointer-events-none">
        {par != null && (
          <div className="flex flex-col items-center bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Par</p>
            <p className="text-lg font-extrabold tabular-nums text-[#111813]">{par}</p>
          </div>
        )}
        {indice != null && (
          <div className="flex flex-col items-center bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Indice</p>
            <p className="text-lg font-extrabold tabular-nums text-[#111813]">{indice}</p>
          </div>
        )}
        {yardas != null && (
          <div className="flex flex-col items-center bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Yardas</p>
            <p className="text-lg font-extrabold tabular-nums text-[#111813]">{yardas}</p>
          </div>
        )}
        <div className="flex flex-col items-center bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 shadow-sm">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Distancia</p>
          <p className="text-lg font-extrabold tabular-nums text-[#111813] whitespace-nowrap">{distanceYd} yd</p>
        </div>
      </div>
    </div>
  );
};

export default HoleMap;
