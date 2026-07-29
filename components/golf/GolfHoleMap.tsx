import React, { useCallback, useRef, useState } from 'react';

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

// Punto sobre el segmento tee->green más cercano a un punto arbitrario
// (se usa para restringir el arrastre del marcador de layup a la línea).
function proyectarSobreSegmento(p: GolfHoleMapPoint, a: GolfHoleMapPoint, b: GolfHoleMapPoint): GolfHoleMapPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return a;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

type GolfHoleMapProps = {
  data: GolfHoleMapData;
  /** Habilita el punto intermedio arrastrable para calcular un layup. Default: true. */
  layupHabilitado?: boolean;
  className?: string;
};

const GolfHoleMap: React.FC<GolfHoleMapProps> = ({ data, layupHabilitado = true, className }) => {
  const { imageUrl, canvas, tee, green, distancia, unidad = 'm' } = data;

  const svgRef = useRef<SVGSVGElement>(null);
  const [layup, setLayup] = useState<GolfHoleMapPoint | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const distanciaTotal = distanciaEntre(tee, green);
  const escala = distanciaTotal > 0 ? distancia / distanciaTotal : 0; // metros por unidad de Figma

  const centro: GolfHoleMapPoint = {
    x: (tee.x + green.x) / 2,
    y: (tee.y + green.y) / 2,
  };

  // Convierte un evento de puntero (mouse/touch) a coordenadas del
  // viewBox del SVG, sin importar el tamaño real renderizado en pantalla.
  const puntoDesdeEvento = useCallback((e: React.PointerEvent): GolfHoleMapPoint | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!layupHabilitado) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setArrastrando(true);
    const p = puntoDesdeEvento(e);
    if (p) setLayup(proyectarSobreSegmento(p, tee, green));
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!arrastrando) return;
    const p = puntoDesdeEvento(e);
    if (p) setLayup(proyectarSobreSegmento(p, tee, green));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setArrastrando(false);
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  const distLayupDesdeTee = layup ? distanciaEntre(tee, layup) * escala : null;
  const distLayupAGreen = layup ? distanciaEntre(layup, green) * escala : null;

  return (
    <div className={className}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${canvas.width} ${canvas.height}`}
        className="w-full h-auto select-none touch-none"
        style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <image
          href={imageUrl}
          x={0}
          y={0}
          width={canvas.width}
          height={canvas.height}
          preserveAspectRatio="xMidYMid slice"
        />

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

        {/* Marcador Green */}
        <g>
          <circle cx={green.x} cy={green.y} r={9} fill="#16a34a" stroke="#fff" strokeWidth={2.5} />
          <text x={green.x} y={green.y - 16} textAnchor="middle" fontSize={13} fontWeight={700} fill="#fff" stroke="#00000080" strokeWidth={3} paintOrder="stroke">
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

        {/* Punto intermedio arrastrable (layup) */}
        {layupHabilitado && (
          <g
            transform={`translate(${layup?.x ?? centro.x}, ${layup?.y ?? centro.y})`}
            onPointerDown={handlePointerDown}
            style={{ cursor: 'grab' }}
          >
            <circle r={16} fill="transparent" />
            <circle
              r={8}
              fill={layup ? '#2563eb' : '#94a3b8'}
              stroke="#fff"
              strokeWidth={2.5}
            />
          </g>
        )}
      </svg>

      {layup && (
        <div className="mt-2 flex items-center justify-center gap-4 text-xs font-bold text-slate-600">
          <span>Tee → Layup: {Math.round(distLayupDesdeTee!)} {unidad}</span>
          <span>Layup → Green: {Math.round(distLayupAGreen!)} {unidad}</span>
        </div>
      )}
    </div>
  );
};

export default GolfHoleMap;
