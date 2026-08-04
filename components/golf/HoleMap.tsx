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
  // Posicion GPS puntual del jugador (resultado de un burst, no tracking
  // continuo). null/undefined = no mostrar nada.
  userPosition?: { latitude: number; longitude: number; accuracy: number } | null;
  // Panel de datos (par/indice/yardas/distancia) mas chico y pegado al borde
  // superior — pensado para el mapa embebido, que no tiene el boton de
  // cerrar (X) de la vista de pantalla completa con el que evitar chocar.
  compact?: boolean;
};

// Arcos de distancia de referencia, orientados hacia el green — no son
// circulos completos, solo el sector que cae sobre la linea de juego.
// Se centran en el tee hasta que el jugador actualiza su posicion GPS; a
// partir de ahi se recentran en esa posicion (y se vuelven a recentrar en
// cada actualizacion posterior).
const RING_RADII_YD = [50, 100, 150, 200, 250];
const ARCO_APERTURA_GRADOS = 55;
const YD_TO_KM = 0.0009144;
const RING_COLOR = '#3b82f6';
const TEE_COLOR = '#2563eb';
const GREEN_COLOR = '#4a9c40';
const USER_COLOR = '#1a73e8';

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
  userPosition = null,
  compact = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);

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

    // Capa aparte para la posicion del jugador: se actualiza en su propio
    // effect (mas abajo) sin volver a montar tee/green/rings.
    userLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      userLayerRef.current = null;
    };
  }, [teeLat, teeLng, greenLat, greenLng, interactive]);

  useEffect(() => {
    const layer = userLayerRef.current;
    if (!layer) return;
    // Se borra todo lo dinamico (arcos + etiquetas del punto anterior, mas
    // el marcador de posicion si habia uno) antes de redibujar desde el
    // origen actual — asi nunca quedan arcos viejos superpuestos.
    layer.clearLayers();

    const origenLat = userPosition ? userPosition.latitude : teeLat;
    const origenLng = userPosition ? userPosition.longitude : teeLng;
    const origenPoint = point([origenLng, origenLat]);
    const greenPoint = point([greenLng, greenLat]);
    const rumbo = bearing(origenPoint, greenPoint);

    RING_RADII_YD.forEach((yd) => {
      const radioKm = yd * YD_TO_KM;

      L.polyline(puntosDeArco(origenPoint, radioKm, rumbo, ARCO_APERTURA_GRADOS), {
        color: RING_COLOR,
        weight: 4,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
      }).addTo(layer);

      const labelPoint = destination(origenPoint, radioKm, rumbo, { units: 'kilometers' });
      const [labelLng, labelLat] = labelPoint.geometry.coordinates;
      L.marker([labelLat, labelLng], { icon: etiquetaTexto(String(yd)), interactive: false }).addTo(layer);
    });

    if (!userPosition) return;

    const { latitude, longitude, accuracy } = userPosition;

    L.circle([latitude, longitude], {
      radius: accuracy,
      color: USER_COLOR,
      weight: 1,
      fillColor: USER_COLOR,
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(layer);

    L.polyline(
      [
        [latitude, longitude],
        [greenLat, greenLng],
      ],
      { color: USER_COLOR, weight: 3, opacity: 0.9, dashArray: '4 6', lineCap: 'round', interactive: false }
    ).addTo(layer);

    L.circleMarker([latitude, longitude], {
      radius: 8,
      color: '#ffffff',
      weight: 3,
      fillColor: USER_COLOR,
      fillOpacity: 1,
      interactive: false,
    }).addTo(layer);
  }, [userPosition, teeLat, teeLng, greenLat, greenLng]);

  const distanciaRectaYd = Math.round(
    distance(point([teeLng, teeLat]), point([greenLng, greenLat]), { units: 'kilometers' }) / YD_TO_KM
  );

  const distanciaJugadorYd = userPosition
    ? Math.round(
        distance(point([userPosition.longitude, userPosition.latitude]), point([greenLng, greenLat]), {
          units: 'kilometers',
        }) / YD_TO_KM
      )
    : null;

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="h-full w-full" />

      {/* top-20 para no chocar con el boton de cerrar (X) de la vista de pantalla completa;
          en compact (mapa embebido, sin ese boton) va pegado arriba y con menos padding
          para que entren todas las etiquetas sin invadir los controles de abajo.
          z-index mas bajo en compact: el mapa embebido convive en la misma pagina que
          la barra de navegacion inferior (z-50) y no debe taparla; en pantalla completa
          en cambio ya vive dentro de un overlay fixed con z-[2000] propio, por encima de
          la nav de todos modos. */}
      <div
        className={`absolute right-3 flex flex-col pointer-events-none ${
          compact ? 'top-3 gap-1.5 z-20' : 'top-20 gap-2 z-[1000]'
        }`}
      >
        {par != null && (
          <div className={`flex flex-col items-center bg-white/90 backdrop-blur-md rounded-xl shadow-sm ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
            <p className={`font-bold uppercase tracking-wide text-slate-400 ${compact ? 'text-[7px]' : 'text-[9px]'}`}>Par</p>
            <p className={`font-extrabold tabular-nums text-[#111813] ${compact ? 'text-xs' : 'text-lg'}`}>{par}</p>
          </div>
        )}
        {indice != null && (
          <div className={`flex flex-col items-center bg-white/90 backdrop-blur-md rounded-xl shadow-sm ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
            <p className={`font-bold uppercase tracking-wide text-slate-400 ${compact ? 'text-[7px]' : 'text-[9px]'}`}>Indice</p>
            <p className={`font-extrabold tabular-nums text-[#111813] ${compact ? 'text-xs' : 'text-lg'}`}>{indice}</p>
          </div>
        )}
        {yardas != null && (
          <div className={`flex flex-col items-center bg-white/90 backdrop-blur-md rounded-xl shadow-sm ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
            <p className={`font-bold uppercase tracking-wide text-slate-400 ${compact ? 'text-[7px]' : 'text-[9px]'}`}>Yardas</p>
            <p className={`font-extrabold tabular-nums text-[#111813] ${compact ? 'text-xs' : 'text-lg'}`}>{yardas}</p>
            {!compact && <p className="text-[8px] text-slate-400 leading-tight text-center">total scorecard</p>}
          </div>
        )}
        <div className={`flex flex-col items-center bg-white/90 backdrop-blur-md rounded-xl shadow-sm ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
          <p className={`font-bold uppercase tracking-wide text-slate-400 text-center leading-tight ${compact ? 'text-[7px]' : 'text-[9px]'}`}>
            {compact ? 'Recta' : 'Distancia recta'}
          </p>
          <p className={`font-extrabold tabular-nums text-[#111813] whitespace-nowrap ${compact ? 'text-xs' : 'text-lg'}`}>{distanciaRectaYd} yd</p>
          {!compact && <p className="text-[8px] text-slate-400 leading-tight text-center">tee → green</p>}
        </div>
        {distanciaJugadorYd != null && (
          <div className={`flex flex-col items-center rounded-xl shadow-sm ${compact ? 'px-2 py-1' : 'px-3 py-2'}`} style={{ backgroundColor: 'rgba(26,115,232,0.9)' }}>
            <p className={`font-bold uppercase tracking-wide text-white/80 text-center leading-tight ${compact ? 'text-[7px]' : 'text-[9px]'}`}>
              {compact ? 'Vos' : 'Tu distancia'}
            </p>
            <p className={`font-extrabold tabular-nums text-white whitespace-nowrap ${compact ? 'text-xs' : 'text-lg'}`}>{distanciaJugadorYd} yd</p>
            {!compact && <p className="text-[8px] text-white/80 leading-tight text-center">al green</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default HoleMap;
