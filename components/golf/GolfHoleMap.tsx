import React from 'react';

// ------------------------------------------------------------
// Estructura de datos de un hoyo (lo que hoy es "figma data").
// canvas.width/height = tamaño base del lienzo en Figma.
// tee/green en las mismas unidades que canvas (px de Figma), no
// en porcentaje: el escalado proporcional lo resuelve el SVG
// viewBox, no hace falta convertir nada a mano.
// ------------------------------------------------------------
export type GolfHoleMapPoint = { x: number; y: number };

export type GolfHoleMapData = {
  imageUrl: string;
  canvas: { width: number; height: number };
  tee: GolfHoleMapPoint;
  green: GolfHoleMapPoint;
  distancia: number; // metros (o yardas), distancia total tee -> green
  unidad?: 'm' | 'yd';
};

// Ejemplo real para el hoyo adjunto (hoyo_01.jpg):
export const HOYO_01_EJEMPLO: GolfHoleMapData = {
  imageUrl: '/mapas/hoyo_01.jpg',
  canvas: { width: 390, height: 844 },
  tee: { x: 166, y: 761 },
  green: { x: 164, y: 51 },
  distancia: 391,
  unidad: 'm',
};

function distanciaEntre(a: GolfHoleMapPoint, b: GolfHoleMapPoint) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// Arcos de distancia (ayuda para el golpe de salida), centrados en el tee.
// Radios fijos en la unidad del hoyo (m o yd), con su color de referencia.
const ARCOS_DISTANCIA: { radio: number; color: string }[] = [
  { radio: 250, color: '#f59e0b' },
  { radio: 200, color: '#3b82f6' },
  { radio: 150, color: '#cbd5e1' },
  { radio: 100, color: '#ef4444' },
  { radio: 50, color: '#38bdf8' },
];

const APERTURA_ARCO_RAD = (90 * Math.PI) / 180; // apertura angular total del arco

// Path SVG de un arco circular centrado en `centro`, orientado hacia `anguloCentroRad`.
function pathArco(centro: GolfHoleMapPoint, radio: number, anguloCentroRad: number): string {
  const a1 = anguloCentroRad - APERTURA_ARCO_RAD / 2;
  const a2 = anguloCentroRad + APERTURA_ARCO_RAD / 2;
  const p1 = { x: centro.x + radio * Math.cos(a1), y: centro.y + radio * Math.sin(a1) };
  const p2 = { x: centro.x + radio * Math.cos(a2), y: centro.y + radio * Math.sin(a2) };
  return `M ${p1.x} ${p1.y} A ${radio} ${radio} 0 0 1 ${p2.x} ${p2.y}`;
}

type GolfHoleMapProps = {
  data: GolfHoleMapData;
  className?: string;
  /**
   * Si es true, el SVG ocupa el 100% del alto/ancho del contenedor y deja que su
   * propio viewBox (preserveAspectRatio="xMidYMid meet") contenga la imagen sin
   * recortarla, sin importar la relación de aspecto del contenedor. Pensado para
   * cajas de alto fijo (ej. la tarjeta del scorecard). Default: false, que respeta
   * el comportamiento anterior (ancho 100%, alto automático según el aspect-ratio).
   */
  fill?: boolean;
};

const GolfHoleMap: React.FC<GolfHoleMapProps> = ({ data, className, fill = false }) => {
  const { imageUrl, canvas, tee, green, distancia, unidad = 'm' } = data;

  const distanciaTotal = distanciaEntre(tee, green);
  const escala = distanciaTotal > 0 ? distancia / distanciaTotal : 0; // metros por unidad de Figma

  const centro: GolfHoleMapPoint = {
    x: (tee.x + green.x) / 2,
    y: (tee.y + green.y) / 2,
  };

  // Angulo tee -> green, para orientar los arcos de distancia hacia el green.
  const anguloTeeGreen = Math.atan2(green.y - tee.y, green.x - tee.x);
  const arcosVisibles = escala > 0
    ? ARCOS_DISTANCIA.filter((a) => a.radio < distancia - 10)
    : [];

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${canvas.width} ${canvas.height}`}
        preserveAspectRatio="xMidYMid meet"
        className={fill ? 'w-full h-full select-none' : 'w-full h-auto select-none'}
        style={fill ? undefined : { aspectRatio: `${canvas.width} / ${canvas.height}` }}
      >
        <image
          href={imageUrl}
          x={0}
          y={0}
          width={canvas.width}
          height={canvas.height}
          preserveAspectRatio="xMidYMid slice"
        />

        {/* Arcos de distancia desde el tee (ayuda para el golpe de salida) */}
        {arcosVisibles.map(({ radio, color }) => {
          const radioCanvas = radio / escala;
          // Etiqueta corrida sobre el propio arco (desplazamiento tangencial fijo en px de
          // canvas), lejos de la linea central tee->green y de la pastilla de distancia total.
          const DESPLAZAMIENTO_ETIQUETA = 34;
          const puntoArco = {
            x: tee.x + radioCanvas * Math.cos(anguloTeeGreen),
            y: tee.y + radioCanvas * Math.sin(anguloTeeGreen),
          };
          const tangente = { x: -Math.sin(anguloTeeGreen), y: Math.cos(anguloTeeGreen) };
          const labelPos = {
            x: puntoArco.x + tangente.x * DESPLAZAMIENTO_ETIQUETA,
            y: puntoArco.y + tangente.y * DESPLAZAMIENTO_ETIQUETA,
          };
          return (
            <g key={radio} style={{ pointerEvents: 'none' }}>
              <path
                d={pathArco(tee, radioCanvas, anguloTeeGreen)}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                strokeLinecap="round"
                opacity={0.9}
              />
              <text
                x={labelPos.x}
                y={labelPos.y}
                textAnchor="middle"
                fontSize={12}
                fontWeight={800}
                fill="#fff"
                stroke="#00000090"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {radio}
              </text>
            </g>
          );
        })}

        {/* Linea tee -> green */}
        <line
          x1={tee.x}
          y1={tee.y}
          x2={green.x}
          y2={green.y}
          stroke="#ffffff"
          strokeWidth={3}
          strokeDasharray="8 6"
          strokeLinecap="round"
          opacity={0.9}
        />

        {/* Marcador Tee */}
        <g>
          <circle cx={tee.x} cy={tee.y} r={9} fill="#ea580c" stroke="#fff" strokeWidth={2.5} />
          <text x={tee.x} y={tee.y + 22} textAnchor="middle" fontSize={13} fontWeight={700} fill="#fff" stroke="#00000080" strokeWidth={3} paintOrder="stroke">
            Tee
          </text>
        </g>

        {/* Marcador Green, con bandera */}
        <g>
          <line x1={green.x} y1={green.y - 8} x2={green.x} y2={green.y - 28} stroke="#fff" strokeWidth={2} strokeLinecap="round" />
          <path d={`M ${green.x} ${green.y - 28} L ${green.x + 15} ${green.y - 23} L ${green.x} ${green.y - 18} Z`} fill="#16a34a" stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
          <circle cx={green.x} cy={green.y} r={9} fill="#16a34a" stroke="#fff" strokeWidth={2.5} />
          <text x={green.x} y={green.y - 34} textAnchor="middle" fontSize={13} fontWeight={700} fill="#fff" stroke="#00000080" strokeWidth={3} paintOrder="stroke">
            Green
          </text>
        </g>

        {/* Etiqueta de distancia total, centrada en la linea */}
        <g transform={`translate(${centro.x}, ${centro.y})`}>
          <rect x={-34} y={-14} width={68} height={28} rx={14} fill="#111813" opacity={0.85} />
          <text x={0} y={5} textAnchor="middle" fontSize={13} fontWeight={800} fill="#fff">
            {Math.round(distancia)} {unidad}
          </text>
        </g>
      </svg>
    </div>
  );
};

export default GolfHoleMap;
