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
const RING_COLOR = '#3b82f6';
const TEE_COLOR = '#2563eb';
const GREEN_COLOR = '#4a9c40';
const USER_COLOR = '#1a73e8';
const FLAG_COLOR = '#f59e0b';

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

// `rotationDeg` contra-rota la etiqueta para que quede derecha pese a que el
// contenedor del mapa esta rotado (ver comentario sobre rotacion en el
// primer efecto, mas abajo): rotar primero y recien despues centrar hace que
// el contra-giro tambien "enderece" el propio desplazamiento del translate.
function etiquetaTexto(texto: string, rotationDeg: number, color = '#ffffff'): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="transform:rotate(${rotationDeg}deg) translate(-50%,-50%);color:${color};font-size:12px;font-weight:800;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.85),0 0 6px rgba(0,0,0,0.5);">${texto}</div>`,
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
  // Rumbo tee->green en grados, calculado en el primer efecto: rota el
  // contenedor del mapa y contra-rota cada etiqueta de texto. Vive en un ref
  // (en vez de recalcularse) para que el segundo efecto (arcos + posicion
  // del jugador) lo reuse sin duplicar el calculo.
  const rotationRef = useRef<number>(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // El div persiste entre montajes del mapa (solo el mapa interno se
    // destruye/reconstruye cuando cambian las coordenadas), asi que hay que
    // resetear el tamano/rotacion inline que le haya dejado un montaje
    // anterior antes de volver a medirlo mas abajo.
    el.style.position = '';
    el.style.top = '';
    el.style.left = '';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.transform = '';

    const map = L.map(el, {
      zoomControl: false,
      attributionControl: false,
      // El arrastre libre se saca siempre: con el encuadre acotado al hoyo
      // (mas abajo) y la rotacion fija tee->green, ya no hace falta poder
      // panear, y evita que el arrastre se sienta "desalineado" respecto a
      // lo que se ve (Leaflet sigue calculando el drag en el espacio sin
      // rotar). El zoom (para ver el green de cerca) se mantiene disponible
      // solo en la vista interactiva (pantalla completa).
      dragging: false,
      touchZoom: interactive,
      doubleClickZoom: interactive,
      scrollWheelZoom: false,
    });
    mapRef.current = map;

    // Encuadre acotado a la geometria real del hoyo, orientado sobre el
    // rumbo tee->green (en vez de un cuadro isotropico, un rectangulo
    // angosto en esa direccion, para no desperdiciar zoom). La distancia se
    // arma con el punto conocido mas lejano (green/frente/fondo/bandera) mas
    // un margen fijo, con un techo de seguridad ante coordenadas mal
    // cargadas — asi el cuadro nunca se abre mas de lo que el hoyo requiere.
    // Este mismo rumbo es el angulo que rota visualmente el contenedor mas
    // abajo, para que el green quede siempre "hacia arriba".
    const teePoint = point([teeLng, teeLat]);
    const greenPoint = point([greenLng, greenLat]);
    const bearingToGreen = bearing(teePoint, greenPoint);
    rotationRef.current = bearingToGreen;

    const puntosConocidos: [number, number][] = [[greenLat, greenLng]];
    if (greenFrontLat != null && greenFrontLng != null) puntosConocidos.push([greenFrontLat, greenFrontLng]);
    if (greenBackLat != null && greenBackLng != null) puntosConocidos.push([greenBackLat, greenBackLng]);
    if (flagLat != null && flagLng != null) puntosConocidos.push([flagLat, flagLng]);

    const farthestDistKm = Math.max(
      ...puntosConocidos.map(([lat, lng]) => distance(teePoint, point([lng, lat]), { units: 'kilometers' }))
    );
    const effectiveRadiusKm = Math.min(farthestDistKm + BUFFER_KM, SAFETY_CAP_KM);

    const farPoint = destination(teePoint, effectiveRadiusKm, bearingToGreen, { units: 'kilometers' });
    const nearPoint = destination(teePoint, effectiveRadiusKm, bearingToGreen + 180, { units: 'kilometers' });
    const [farLng, farLat] = farPoint.geometry.coordinates;
    const [nearLng, nearLat] = nearPoint.geometry.coordinates;
    const bounds = L.latLngBounds([[farLat, farLng], [nearLat, nearLng]]);

    // Este fitBounds (y el getBoundsZoom de abajo) tienen que correr ANTES
    // de agrandar el contenedor para la rotacion: ambos miden el tamano
    // *actual* del contenedor, y Leaflet no deja pasarle un tamano distinto
    // a mano. Ademas esto tiene que pasar ANTES de agregar capas vectoriales
    // (circleMarker, polyline): sin una vista valida, el renderer interno de
    // Leaflet (_clipPoints) explota leyendo bounds en pixeles que todavia no
    // existen.
    map.fitBounds(bounds, { padding: [40, 40], animate: false });
    const encuadreCentro = map.getCenter();
    const encuadreZoom = map.getZoom();
    const zoomMinimo = map.getBoundsZoom(bounds, false, L.point(40, 40));

    // Leaflet no puede rotar tiles: en cambio se rota el propio contenedor
    // via CSS. Para que la rotacion no deje bordes sin cubrir en las
    // esquinas, el contenedor pasa a ser un cuadrado tan grande como la
    // diagonal del area realmente visible (con un margen chico), centrado y
    // rotado sobre si mismo — cualquier angulo de rotacion sigue cubriendo
    // el area visible por completo. El costo es pedir mas teselas de las que
    // se ven en pantalla (~2-2.3x el area visible segun el aspect ratio).
    const rect = el.getBoundingClientRect();
    const ladoRotado = Math.sqrt(rect.width ** 2 + rect.height ** 2) * 1.05;
    el.style.position = 'absolute';
    el.style.top = '50%';
    el.style.left = '50%';
    el.style.width = `${ladoRotado}px`;
    el.style.height = `${ladoRotado}px`;
    el.style.transform = `translate(-50%, -50%) rotate(${-bearingToGreen}deg)`;

    map.invalidateSize({ animate: false });
    map.setView(encuadreCentro, encuadreZoom, { animate: false });
    // Limite duro: se puede acercar el zoom para ver detalle del green, pero
    // no alejarse ni panear mas alla del cuadro del hoyo calculado arriba.
    map.setMinZoom(zoomMinimo);
    map.setMaxBounds(bounds);

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
        html: `<div style="transform:rotate(${bearingToGreen}deg) translate(-50%, 22px);color:#fff;font-size:13px;font-weight:800;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.85),0 0 6px rgba(0,0,0,0.5);">Tee</div>`,
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
        html: `<div style="transform:rotate(${bearingToGreen}deg) translate(-8px, -21px);filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6));">
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
        html: `<div style="transform:rotate(${bearingToGreen}deg) translate(-50%, -40px);color:#fff;font-size:13px;font-weight:800;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.85),0 0 6px rgba(0,0,0,0.5);">Centro</div>`,
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
          html: `<div style="transform:rotate(${bearingToGreen}deg) translate(-50%, -20px);color:#fff;font-size:11px;font-weight:800;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.85),0 0 6px rgba(0,0,0,0.5);">Frente</div>`,
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
          html: `<div style="transform:rotate(${bearingToGreen}deg) translate(-50%, 12px);color:#fff;font-size:11px;font-weight:800;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.85),0 0 6px rgba(0,0,0,0.5);">Fondo</div>`,
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
          html: `<div style="transform:rotate(${bearingToGreen}deg) translate(-8px, -21px);filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6));">
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
          html: `<div style="transform:rotate(${bearingToGreen}deg) translate(-50%, -40px);color:#fff;font-size:12px;font-weight:800;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.85),0 0 6px rgba(0,0,0,0.5);">Bandera</div>`,
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
      L.marker([labelLat, labelLng], { icon: etiquetaTexto(String(yd), rotationRef.current), interactive: false }).addTo(layer);
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
        html: `<div style="transform:rotate(${rotationRef.current}deg) translate(-50%,-50%);filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));">
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
      {/* El tamano/posicion/rotacion de este div los pisa el primer efecto de
          arriba via style inline: arranca a pantalla completa del wrapper,
          y pasa a ser un cuadrado sobredimensionado y rotado (ver comentario
          sobre la rotacion por CSS en ese efecto). El wrapper de afuera
          tiene overflow-hidden para recortarlo de vuelta al tamano visible. */}
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
