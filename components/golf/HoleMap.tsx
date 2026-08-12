import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
// Side-effect: parchea L.Map/L.Marker para soportar rotacion real (con drag y
// pellizco correctos en cualquier angulo) — ver leaflet-rotate.d.ts para los
// tipos que agrega.
import 'leaflet-rotate';
import distance from '@turf/distance';
import bearing from '@turf/bearing';
import destination from '@turf/destination';
import { point } from '@turf/helpers';
import { useGolfWindData } from '../../hooks/useGolfWindData';

type HoleMapProps = {
  teeLat: number;
  teeLng: number;
  greenLat: number;
  greenLng: number;
  // Frente/fondo del green (opcionales): si estan cargados, habilitan las 3
  // distancias estandar de golf (frente/centro/fondo) en el panel de "tu
  // distancia". Si faltan, ese panel muestra solo la distancia al centro.
  greenFrontLat?: number | null;
  greenFrontLng?: number | null;
  greenBackLat?: number | null;
  greenBackLng?: number | null;
  // Posicion de la bandera (pin del dia): opcional y distinta de
  // greenLat/greenLng (centro fijo de referencia del green). Si esta
  // cargada, se dibuja como un punto aparte en el mapa.
  flagLat?: number | null;
  flagLng?: number | null;
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
// Margen mas alla del punto conocido mas lejano del hoyo (green/frente/fondo/
// bandera), para dejar ver un poco de rough detras sin abrir la vista de mas.
const BUFFER_KM = 0.05;
// Techo de seguridad ante coordenadas mal cargadas (p.ej. un tipeo que deja
// el green a varios km). Con datos reales no deberia activarse nunca: el
// hoyo mas largo sembrado (604 yardas / ~552m) mas el margen de arriba da
// ~602m, bastante por debajo de este techo.
const SAFETY_CAP_KM = 0.75;
// Que tanto de la pantalla (medido en su alto, que es el eje al que el
// hoyo queda alineado tras rotar) ocupa el tramo tee->green al abrir el
// mapa. 0.65 = punto medio del 60%-70% pedido.
const HOLE_FILL_FRACTION = 0.65;
// Tope de alejamiento, pensado al reves de lo que parece: en vez de "hasta
// donde entra toda el area de paneo en pantalla", es "que tan mas grande
// que la pantalla se exige que siga siendo esa area en el punto mas
// alejado". El tamano en pixeles del area de paneo (fija en el mundo real)
// encoge a medida que se aleja el zoom — si en el piso ya mide MENOS que
// la pantalla (fill<1, como el 0.95 que tenia antes), el margen para
// arrastrar sin rebotar es CERO exactamente ahi, y va empeorando a medida
// que te acercas a ese piso desde zooms mas cercanos ("depende de cuanto
// zoom tenga"). Con fill>1 el area de paneo queda mas grande que la
// pantalla en cualquier zoom permitido, asi que siempre queda margen real
// para descentrarse.
const HOLE_FILL_FRACTION_FLOOR = 1.4;
// Margen extra (proporcional al largo tee->green) que se le suma de cada
// lado al area en la que se puede panear, mas alla del encuadre ajustado
// inicial — para que arrastrar el mapa realmente lo despegue/descentre de
// la linea punteada en vez de "rebotar" de vuelta al toque.
const PAN_MARGIN_FACTOR = 0.6;
// Zoom de referencia arbitrario para medir distancias en pixeles via
// map.project(): el resultado de zoomToFitSpan() no depende de cual se
// elija (project()/getScaleZoom() son matematicamente exactos en
// cualquier zoom), asi que no hace falta que el mapa ya tenga vista propia.
const REF_ZOOM = 15;
const RING_COLOR = '#3b82f6';
const TEE_COLOR = '#2563eb';
const GREEN_COLOR = '#4a9c40';
const USER_COLOR = '#1a73e8';
const FLAG_COLOR = '#f59e0b';
const WIND_COLOR = '#38bdf8';

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

// Los marcadores de leaflet-rotate quedan "derechos" por default aunque el
// mapa este rotado (rotateWithView:false es el default del plugin) — no hace
// falta contra-rotar nada a mano aca, solo centrar el texto sobre su punto.
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
  greenFrontLat = null,
  greenFrontLng = null,
  greenBackLat = null,
  greenBackLng = null,
  flagLat = null,
  flagLng = null,
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
  const teeLineRef = useRef<L.Polyline | null>(null);
  // Coordenadas de la bandera que se esta mostrando (pin del dia si esta
  // cargado, si no el centro del green) — es donde se pide el viento para
  // la ficha "Viento" del panel de datos.
  const windLat = flagLat ?? greenLat;
  const windLng = flagLng ?? greenLng;
  const windData = useGolfWindData(windLat, windLng);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Sin esto, el navegador puede tomar un pellizco sobre el mapa como zoom
    // nativo de la pagina entera (Leaflet no llega a interceptar el gesto
    // cuando touchZoom esta apagado). `pan-y` en la vista chica deja pasar el
    // scroll vertical de la pagina pero bloquea el pellizco/doble-tap-zoom;
    // `none` en pantalla completa porque ahi Leaflet maneja todos los gestos.
    el.style.touchAction = interactive ? 'none' : 'pan-y';

    // Rumbo tee->green: se calcula ANTES de crear el mapa para poder pasarlo
    // como `bearing` inicial (leaflet-rotate rota el mapa de verdad — tiles,
    // arrastre y pellizco quedan correctos en cualquier angulo — asi que el
    // green queda siempre "hacia arriba" en las dos vistas sin el hack de
    // CSS que se usaba antes).
    const teePoint = point([teeLng, teeLat]);
    const greenPoint = point([greenLng, greenLat]);
    const bearingToGreen = bearing(teePoint, greenPoint);

    const map = L.map(el, {
      // Zoom control (+/-) solo tiene sentido donde se puede zoomear de
      // verdad: pantalla completa.
      zoomControl: interactive,
      attributionControl: false,
      // El arrastre y el zoom real solo se habilitan en la vista interactiva
      // (pantalla completa). La vista chica queda fija (no compite con el
      // scroll de la pagina que la rodea).
      dragging: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive,
      scrollWheelZoom: false,
      // Rumbo fijo por codigo: sin control visible (rotateControl) ni gesto
      // de dos dedos (touchRotate) para rotarlo a mano, en ninguna vista.
      // OJO con el signo: `bearing` es el angulo que gira el CONTENIDO (en
      // sentido horario), no "hacia donde mirar" — pasarle bearingToGreen
      // tal cual rota el mapa en la MISMA direccion en la que el green ya
      // esta respecto al tee, duplicando el angulo en vez de cancelarlo
      // (a un rumbo de 45° terminaba mostrando el hoyo prácticamente
      // horizontal: 45°+45°=90°). Hay que rotar para el lado contrario.
      rotate: true,
      bearing: -bearingToGreen,
      rotateControl: false,
      touchRotate: false,
      // Sin esto, Leaflet redondea el zoom a numeros enteros (cada nivel es
      // el doble/mitad del anterior) — demasiado grosero para pegarle a un
      // porcentaje de pantalla puntual como el que calcula zoomParaOcupar()
      // mas abajo. Con zoomSnap:0 el zoom queda continuo (Leaflet renderiza
      // tiles en zoom fraccionario sin problema).
      zoomSnap: 0,
    });
    mapRef.current = map;

    // Encuadre acotado a la geometria real del hoyo: un margen chico detras
    // del tee hasta el punto conocido mas lejano (green/frente/fondo/
    // bandera) mas ese mismo margen — asi el centro del encuadre cae en el
    // medio de la linea tee-green (los dos margenes son iguales) en vez de
    // en el tee, y no se desperdicia media pantalla en pasto vacio detras
    // del tee. Techo de seguridad ante coordenadas mal cargadas (p.ej. un
    // tipeo que deja el green a varios km).
    const puntosConocidos: [number, number][] = [[greenLat, greenLng]];
    if (greenFrontLat != null && greenFrontLng != null) puntosConocidos.push([greenFrontLat, greenFrontLng]);
    if (greenBackLat != null && greenBackLng != null) puntosConocidos.push([greenBackLat, greenBackLng]);
    if (flagLat != null && flagLng != null) puntosConocidos.push([flagLat, flagLng]);

    const farthestDistKm = Math.max(
      ...puntosConocidos.map(([lat, lng]) => distance(teePoint, point([lng, lat]), { units: 'kilometers' }))
    );
    const effectiveRadiusKm = Math.min(farthestDistKm + BUFFER_KM, SAFETY_CAP_KM);

    const farPoint = destination(teePoint, effectiveRadiusKm, bearingToGreen, { units: 'kilometers' });
    const nearPoint = destination(teePoint, BUFFER_KM, bearingToGreen + 180, { units: 'kilometers' });
    const [farLng, farLat] = farPoint.geometry.coordinates;
    const [nearLng, nearLat] = nearPoint.geometry.coordinates;
    const bounds = L.latLngBounds([[farLat, farLng], [nearLat, nearLng]]);
    const centro = bounds.getCenter();

    // Area de paneo: el mismo eje tee->green, pero con un margen extra de
    // cada lado (PAN_MARGIN_FACTOR) — mas ancha que el encuadre inicial a
    // proposito, para que arrastrar el mapa lo despegue de verdad de la
    // linea punteada en vez de que el freno de `maxBounds` lo empuje de
    // vuelta al centro apenas se suelta el dedo.
    const panMarginKm = (effectiveRadiusKm + BUFFER_KM) * PAN_MARGIN_FACTOR;
    const panFarPoint = destination(teePoint, effectiveRadiusKm + panMarginKm, bearingToGreen, { units: 'kilometers' });
    const panNearPoint = destination(teePoint, BUFFER_KM + panMarginKm, bearingToGreen + 180, { units: 'kilometers' });
    const [panFarLng, panFarLat] = panFarPoint.geometry.coordinates;
    const [panNearLng, panNearLat] = panNearPoint.geometry.coordinates;
    const panBounds = L.latLngBounds([[panFarLat, panFarLng], [panNearLat, panNearLng]]);

    // Zoom exacto para que el tramo entre `lejos` y `cerca` ocupe
    // `targetFraction` del alto del contenedor — se mide en pixeles via
    // map.project() (matematicamente exacto en cualquier zoom, no depende
    // de que el mapa ya tenga vista) y se convierte con getScaleZoom().
    function zoomParaOcupar(lejos: [number, number], cerca: [number, number], targetFraction: number): number {
      const pLejos = map.project(lejos, REF_ZOOM);
      const pCerca = map.project(cerca, REF_ZOOM);
      const spanPx = pLejos.distanceTo(pCerca);
      if (spanPx === 0) return REF_ZOOM;
      const alturaPx = el.clientHeight || map.getSize().y || 1;
      const scale = (alturaPx * targetFraction) / spanPx;
      return map.getScaleZoom(scale, REF_ZOOM);
    }

    // El encuadre inicial apunta directo al tramo tee->green (la linea
    // punteada, lo que el ojo realmente mide) — no al `bounds` con margen
    // de arriba, que ya incluye el BUFFER_KM de "aire" de cada lado y
    // terminaria dejando el hoyo mas chico que el 60%-70% pedido.
    const zoomInicial = zoomParaOcupar([teeLat, teeLng], [greenLat, greenLng], HOLE_FILL_FRACTION);
    // El piso de zoom (que tan lejos se puede alejar) usa el area de paneo,
    // exigiendole que se quede mas grande que la pantalla (fraction>1 — ver
    // comentario en HOLE_FILL_FRACTION_FLOOR) para que siempre haya margen
    // real de arrastre, en vez de "hasta donde entra toda entera".
    const zoomMinimo = zoomParaOcupar([panFarLat, panFarLng], [panNearLat, panNearLng], HOLE_FILL_FRACTION_FLOOR);

    map.setView(centro, zoomInicial, { animate: false });
    // Se puede acercar el zoom para ver detalle del green, pero no alejarse
    // mas alla del area de paneo calculada arriba.
    map.setMinZoom(zoomMinimo);
    map.setMaxBounds(panBounds);

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

    // Linea de juego: tee -> green, punteada. Se oculta apenas hay una
    // posicion GPS del jugador (segundo effect, mas abajo): a partir de ahi
    // la referencia util es la linea jugador -> green, no esta.
    teeLineRef.current = L.polyline(
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
        html: `<div style="transform:translate(-50%, -40px);color:#fff;font-size:13px;font-weight:800;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.85),0 0 6px rgba(0,0,0,0.5);">Centro</div>`,
        iconSize: [0, 0],
      }),
      interactive: false,
    }).addTo(map);

    // Frente/fondo del green: opcionales. Mismo color que la bandera
    // (GREEN_COLOR) pero mas chicos/tenues que el pin, para que se lean
    // como "bordes del green" y no compitan con el marcador principal. La
    // linea que los une, si estan los dos, da el eje de profundidad del
    // green de un vistazo.
    const tieneFrente = greenFrontLat != null && greenFrontLng != null;
    const tieneFondo = greenBackLat != null && greenBackLng != null;

    if (tieneFrente && tieneFondo) {
      L.polyline(
        [
          [greenFrontLat as number, greenFrontLng as number],
          [greenBackLat as number, greenBackLng as number],
        ],
        { color: GREEN_COLOR, weight: 2, opacity: 0.55, dashArray: '1 6', lineCap: 'round', interactive: false }
      ).addTo(map);
    }
    if (tieneFrente) {
      L.circleMarker([greenFrontLat as number, greenFrontLng as number], {
        radius: 5,
        color: '#ffffff',
        weight: 2,
        fillColor: GREEN_COLOR,
        fillOpacity: 0.65,
        interactive: false,
      }).addTo(map);
      L.marker([greenFrontLat as number, greenFrontLng as number], {
        icon: L.divIcon({
          className: '',
          html: `<div style="transform:translate(-50%, -20px);color:#fff;font-size:11px;font-weight:800;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.85),0 0 6px rgba(0,0,0,0.5);">Frente</div>`,
          iconSize: [0, 0],
        }),
        interactive: false,
      }).addTo(map);
    }
    if (tieneFondo) {
      L.circleMarker([greenBackLat as number, greenBackLng as number], {
        radius: 5,
        color: '#ffffff',
        weight: 2,
        fillColor: GREEN_COLOR,
        fillOpacity: 0.65,
        interactive: false,
      }).addTo(map);
      L.marker([greenBackLat as number, greenBackLng as number], {
        icon: L.divIcon({
          className: '',
          html: `<div style="transform:translate(-50%, 12px);color:#fff;font-size:11px;font-weight:800;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.85),0 0 6px rgba(0,0,0,0.5);">Fondo</div>`,
          iconSize: [0, 0],
        }),
        interactive: false,
      }).addTo(map);
    }

    // Bandera (pin del dia): opcional, distinta del centro fijo del green.
    // Icono en forma de banderin (mismo estilo que la del centro) pero en
    // un color propio (ambar) para que no se confunda con la referencia fija.
    if (flagLat != null && flagLng != null) {
      L.marker([flagLat, flagLng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="transform:translate(-8px, -21px);filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6));">
            <svg width="16" height="22" viewBox="0 0 16 22" style="display:block;">
              <line x1="8" y1="21" x2="8" y2="2" stroke="#1e293b" stroke-width="1.6" stroke-linecap="round" />
              <path d="M8 2 L15 5.5 L8 9 Z" fill="${FLAG_COLOR}" />
            </svg>
          </div>`,
          iconSize: [0, 0],
        }),
        interactive: false,
      }).addTo(map);
      L.marker([flagLat, flagLng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="transform:translate(-50%, -40px);color:#fff;font-size:12px;font-weight:800;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.85),0 0 6px rgba(0,0,0,0.5);">Bandera</div>`,
          iconSize: [0, 0],
        }),
        interactive: false,
      }).addTo(map);
    }

    // Capa aparte para la posicion del jugador: se actualiza en su propio
    // effect (mas abajo) sin volver a montar tee/green/rings.
    userLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      userLayerRef.current = null;
      teeLineRef.current = null;
    };
  }, [teeLat, teeLng, greenLat, greenLng, greenFrontLat, greenFrontLng, greenBackLat, greenBackLng, flagLat, flagLng, interactive]);

  useEffect(() => {
    const layer = userLayerRef.current;
    if (!layer) return;
    // Se borra todo lo dinamico (arcos + etiquetas del punto anterior, mas
    // el marcador de posicion si habia uno) antes de redibujar desde el
    // origen actual — asi nunca quedan arcos viejos superpuestos.
    layer.clearLayers();

    // La linea tee -> green solo tiene sentido de referencia mientras no se
    // conoce la posicion real del jugador; una vez que la hay, el tee queda
    // como un punto mas (mismo marcador, sin la linea) y la referencia pasa
    // a ser la linea jugador -> green de mas abajo.
    const map = mapRef.current;
    const teeLine = teeLineRef.current;
    if (map && teeLine) {
      if (userPosition) {
        if (map.hasLayer(teeLine)) map.removeLayer(teeLine);
      } else if (!map.hasLayer(teeLine)) {
        teeLine.addTo(map);
      }
    }

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

    // Icono de persona (en vez de un punto generico) para que se distinga
    // de un vistazo del pin del green y del punto del tee.
    L.marker([latitude, longitude], {
      icon: L.divIcon({
        className: '',
        html: `<div style="transform:translate(-50%,-50%);filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));">
          <svg width="26" height="26" viewBox="0 0 26 26" style="display:block;">
            <circle cx="13" cy="13" r="12" fill="${USER_COLOR}" stroke="#ffffff" stroke-width="2.5" />
            <circle cx="13" cy="9.5" r="3" fill="#ffffff" />
            <path d="M7 20c0-3.6 2.7-6 6-6s6 2.4 6 6" fill="#ffffff" />
          </svg>
        </div>`,
        iconSize: [0, 0],
      }),
      interactive: false,
    }).addTo(layer);
  }, [userPosition, teeLat, teeLng, greenLat, greenLng]);

  const distanciaRectaYd = Math.round(
    distance(point([teeLng, teeLat]), point([greenLng, greenLat]), { units: 'kilometers' }) / YD_TO_KM
  );

  const distanciaDesdeJugador = (lat: number, lng: number): number | null =>
    userPosition
      ? Math.round(
          distance(point([userPosition.longitude, userPosition.latitude]), point([lng, lat]), {
            units: 'kilometers',
          }) / YD_TO_KM
        )
      : null;

  const distanciaJugadorYd = distanciaDesdeJugador(greenLat, greenLng);
  const distanciaFrenteYd =
    greenFrontLat != null && greenFrontLng != null ? distanciaDesdeJugador(greenFrontLat, greenFrontLng) : null;
  const distanciaFondoYd =
    greenBackLat != null && greenBackLng != null ? distanciaDesdeJugador(greenBackLat, greenBackLng) : null;
  const tieneFrenteFondo = distanciaFrenteYd != null || distanciaFondoYd != null;
  const tieneBandera = flagLat != null && flagLng != null;
  const distanciaBanderaYd = tieneBandera ? distanciaDesdeJugador(flagLat as number, flagLng as number) : null;
  const tieneDetalle = tieneFrenteFondo || tieneBandera;
  const detalleLabel = [
    tieneFrenteFondo ? 'frente' : null,
    'centro',
    tieneBandera ? 'bandera' : null,
    tieneFrenteFondo ? 'fondo' : null,
  ]
    .filter(Boolean)
    .join('/');

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* leaflet-rotate maneja la rotacion internamente (tiles + capas), asi
          que este div se queda simple a pantalla completa del wrapper — el
          primer efecto de arriba solo le toca el touch-action inline. */}
      <div ref={containerRef} className="h-full w-full" />

      {/* top-20 para no chocar con el boton de cerrar (X) de la vista de pantalla completa;
          en compact (mapa embebido, sin ese boton) va pegado arriba y con menos padding
          para que entren todas las etiquetas sin invadir los controles de abajo.
          El z-index alto (1000) es necesario en los dos casos para ganarle a los paneles
          internos de Leaflet (marcadores/tooltips llegan a z-index 700 propio). En compact
          esto es seguro porque el contenedor de la tarjeta (en GolfScorecard) tiene
          `isolate`, que aisla este z-index para que no se filtre hacia paginas afuera y
          compita con la barra sticky de hoyos o la nav inferior de la app. */}
      <div
        className={`absolute right-3 z-[1000] flex flex-col pointer-events-none ${compact ? 'top-3 gap-1.5' : 'top-20 gap-2'}`}
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
        {!userPosition && (
          <div className={`flex flex-col items-center bg-white/90 backdrop-blur-md rounded-xl shadow-sm ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
            <p className={`font-bold uppercase tracking-wide text-slate-400 text-center leading-tight ${compact ? 'text-[7px]' : 'text-[9px]'}`}>
              {compact ? 'Recta' : 'Distancia recta'}
            </p>
            <p className={`font-extrabold tabular-nums text-[#111813] whitespace-nowrap ${compact ? 'text-xs' : 'text-lg'}`}>{distanciaRectaYd} yd</p>
            {!compact && <p className="text-[8px] text-slate-400 leading-tight text-center">tee → green</p>}
          </div>
        )}
        {windData && (
          <div className={`flex flex-col items-center bg-white/90 backdrop-blur-md rounded-xl shadow-sm ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
            <p className={`font-bold uppercase tracking-wide text-slate-400 ${compact ? 'text-[7px]' : 'text-[9px]'}`}>Viento</p>
            <div className="flex items-center gap-1">
              <svg
                width={compact ? 8 : 10}
                height={compact ? 8 : 10}
                viewBox="0 0 24 24"
                style={{ transform: `rotate(${(windData.directionDeg + 180) % 360}deg)`, flexShrink: 0 }}
              >
                <path d="M12 2 L19 21 L12 16.5 L5 21 Z" fill={WIND_COLOR} />
              </svg>
              <p className={`font-extrabold tabular-nums text-[#111813] whitespace-nowrap ${compact ? 'text-xs' : 'text-lg'}`}>
                {Math.round(windData.speedKmh)} km/h
              </p>
            </div>
          </div>
        )}
        {distanciaJugadorYd != null && tieneDetalle && (
          <div className={`rounded-xl shadow-sm ${compact ? 'px-2 py-1' : 'px-3 py-2'}`} style={{ backgroundColor: 'rgba(26,115,232,0.9)' }}>
            <p className={`font-bold uppercase tracking-wide text-white/80 text-center leading-tight ${compact ? 'text-[7px] mb-0.5' : 'text-[9px] mb-1'}`}>
              {compact ? 'Vos' : 'Tu distancia'}
            </p>
            <div className={`flex items-end ${compact ? 'gap-1.5' : 'gap-2'}`}>
              {tieneFrenteFondo && (
                <div className="flex flex-col items-center">
                  <p className={`font-bold uppercase text-white/70 ${compact ? 'text-[6px]' : 'text-[8px]'}`}>Fr</p>
                  <p className={`font-extrabold tabular-nums text-white whitespace-nowrap ${compact ? 'text-[10px]' : 'text-base'}`}>
                    {distanciaFrenteYd ?? '—'}
                  </p>
                </div>
              )}
              <div className="flex flex-col items-center">
                <p className={`font-bold uppercase text-white/70 ${compact ? 'text-[6px]' : 'text-[8px]'}`}>Ce</p>
                <p className={`font-extrabold tabular-nums text-white whitespace-nowrap ${compact ? 'text-[10px]' : 'text-base'}`}>
                  {distanciaJugadorYd}
                </p>
              </div>
              {tieneBandera && (
                <div className="flex flex-col items-center">
                  <p className={`font-bold uppercase ${compact ? 'text-[6px]' : 'text-[8px]'}`} style={{ color: FLAG_COLOR }}>Ba</p>
                  <p className={`font-extrabold tabular-nums text-white whitespace-nowrap ${compact ? 'text-[10px]' : 'text-base'}`}>
                    {distanciaBanderaYd ?? '—'}
                  </p>
                </div>
              )}
              {tieneFrenteFondo && (
                <div className="flex flex-col items-center">
                  <p className={`font-bold uppercase text-white/70 ${compact ? 'text-[6px]' : 'text-[8px]'}`}>Fo</p>
                  <p className={`font-extrabold tabular-nums text-white whitespace-nowrap ${compact ? 'text-[10px]' : 'text-base'}`}>
                    {distanciaFondoYd ?? '—'}
                  </p>
                </div>
              )}
            </div>
            {!compact && <p className="text-[8px] text-white/80 leading-tight text-center mt-1">yd · {detalleLabel}</p>}
          </div>
        )}
        {distanciaJugadorYd != null && !tieneDetalle && (
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
