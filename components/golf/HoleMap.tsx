import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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

// Arcos de distancia de referencia (ayuda para el golpe de salida),
// centrados en el TEE y orientados hacia el green — no son circulos
// completos, solo el sector que cae sobre la linea de juego.
const RING_RADII_YD = [50, 100, 150, 200, 250];
const ARCO_APERTURA_GRADOS = 55;
const YD_TO_KM = 0.0009144;
const RING_COLOR = '#3b82f6';
const TEE_COLOR = '#2563eb';
const GREEN_COLOR = '#4a9c40';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// Punto medio de un arco centrado en `centro`, abierto `aperturaGrados`
// alrededor de `rumboCentral`, a `radioKm` de distancia.
function puntosDeArco(
  centro: ReturnType<typeof point>,
  radioKm: number,
  rumboCentral: number,
  aperturaGrados: number,
  pasos = 32
): [number, number][] {
  const mitad = aperturaGrados / 2;
  const puntos: [number, number][] = [];
  for (let i = 0; i <= pasos; i++) {
    const angulo = rumboCentral - mitad + (aperturaGrados * i) / pasos;
    const p = destination(centro, radioKm, angulo, { units: 'kilometers' });
    const [lng, lat] = p.geometry.coordinates;
    puntos.push([lat, lng]);
  }
  return puntos;
}

function etiquetaTexto(texto: string, color = '#ffffff'): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="transform:translate(-50%,-50%);color:${color};font-size:12px;font-weight:800;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.85),0 0 6px rgba(0,0,0,0.5);">${texto}</div>`,
    iconSize: [0, 0],
  });
}

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
    // que pasar ANTES de agregar capas vectoriales (circleMarker, polyline):
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

      // La imagen "cruda" de mapbox.satellite sale mas apagada que el
      // procesado que muestra Google Maps — este filtro la acerca un poco
      // mas a ese look (mas saturada, con un pelin de calidez).
      const tilePane = map.getPane('tilePane');
      if (tilePane) tilePane.style.filter = 'saturate(1.25) contrast(1.08) brightness(1.02) sepia(0.06)';
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
    // Rumbo tee->green: los arcos se centran en el tee y se abren hacia el
    // green, no son circulos completos.
    const rumbo = bearing(teePoint, greenPoint);

    RING_RADII_YD.forEach((yd) => {
      const radioKm = yd * YD_TO_KM;

      L.polyline(puntosDeArco(teePoint, radioKm, rumbo, ARCO_APERTURA_GRADOS), {
        color: RING_COLOR,
        weight: 4,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
      }).addTo(map);

      const labelPoint = destination(teePoint, radioKm, rumbo, { units: 'kilometers' });
      const [labelLng, labelLat] = labelPoint.geometry.coordinates;
      L.marker([labelLat, labelLng], { icon: etiquetaTexto(String(yd)), interactive: false }).addTo(map);
    });

    // Linea de juego: tee -> green, punteada.
    L.polyline(
      [
        [teeLat, teeLng],
        [greenLat, greenLng],
      ],
      { color: '#ffffff', weight: 3, opacity: 0.9, dashArray: '2 10', lineCap: 'round', interactive: false }
    ).addTo(map);

    L.circleMarker([teeLat, teeLng], {
      radius: 9,
      color: '#ffffff',
      weight: 3,
      fillColor: TEE_COLOR,
      fillOpacity: 1,
      interactive: false,
    }).addTo(map);
    L.marker([teeLat, teeLng], {
      icon: L.divIcon({
        className: '',
        html: `<div style="transform:translate(-50%, 22px);color:#fff;font-size:13px;font-weight:800;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.85),0 0 6px rgba(0,0,0,0.5);">Tee</div>`,
        iconSize: [0, 0],
      }),
      interactive: false,
    }).addTo(map);

    L.circleMarker([greenLat, greenLng], {
      radius: 8,
      color: '#ffffff',
      weight: 3,
      fillColor: GREEN_COLOR,
      fillOpacity: 1,
      interactive: false,
    }).addTo(map);
    // Bandera minimalista (asta + banderin), con la base del asta plantada
    // justo en el centro del punto del green.
    L.marker([greenLat, greenLng], {
      icon: L.divIcon({
        className: '',
        html: `<div style="transform:translate(-8px, -21px);filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6));">
          <svg width="16" height="22" viewBox="0 0 16 22" style="display:block;">
            <line x1="8" y1="21" x2="8" y2="2" stroke="#1e293b" stroke-width="1.6" stroke-linecap="round" />
            <path d="M8 2 L15 5.5 L8 9 Z" fill="#ef4444" />
          </svg>
        </div>`,
        iconSize: [0, 0],
      }),
      interactive: false,
    }).addTo(map);
    L.marker([greenLat, greenLng], {
      icon: L.divIcon({
        className: '',
        html: `<div style="transform:translate(-50%, -40px);color:#fff;font-size:13px;font-weight:800;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.85),0 0 6px rgba(0,0,0,0.5);">Green</div>`,
        iconSize: [0, 0],
      }),
      interactive: false,
    }).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [teeLat, teeLng, greenLat, greenLng, interactive]);

  const distanciaRectaYd = Math.round(
    distance(point([teeLng, teeLat]), point([greenLng, greenLat]), { units: 'kilometers' }) / YD_TO_KM
  );

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="h-full w-full" />

      {/* top-20 para no chocar con el boton de cerrar (X) de la vista de pantalla completa */}
      <div className="absolute top-20 right-3 z-[1000] flex flex-col gap-2 pointer-events-none">
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
            <p className="text-[8px] text-slate-400 leading-tight text-center">total scorecard</p>
          </div>
        )}
        <div className="flex flex-col items-center bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 shadow-sm">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 text-center leading-tight">Distancia recta</p>
          <p className="text-lg font-extrabold tabular-nums text-[#111813] whitespace-nowrap">{distanciaRectaYd} yd</p>
          <p className="text-[8px] text-slate-400 leading-tight text-center">tee → green</p>
        </div>
      </div>
    </div>
  );
};

export default HoleMap;
