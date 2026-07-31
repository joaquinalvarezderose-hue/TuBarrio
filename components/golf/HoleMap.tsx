import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import circle from '@turf/circle';
import distance from '@turf/distance';
import { point } from '@turf/helpers';

type HoleMapProps = {
  teeLat: number;
  teeLng: number;
  greenLat: number;
  greenLng: number;
  className?: string;
};

// Range rings de referencia alrededor del green, en yardas.
const RING_RADII_YD = [50, 100, 150];
const YD_TO_KM = 0.0009144;

const HoleMap: React.FC<HoleMapProps> = ({ teeLat, teeLng, greenLat, greenLng, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
    });
    mapRef.current = map;

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
    ).addTo(map);

    const teePoint = point([teeLng, teeLat]);
    const greenPoint = point([greenLng, greenLat]);

    RING_RADII_YD.forEach((yd) => {
      const ring = circle(greenPoint, yd * YD_TO_KM, { units: 'kilometers', steps: 64 });
      L.geoJSON(ring as any, {
        style: { color: '#ffffff', weight: 1, opacity: 0.6, fill: false, dashArray: '4 4' },
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

    const bounds = L.latLngBounds([
      [teeLat, teeLng],
      [greenLat, greenLng],
    ]);
    map.fitBounds(bounds, { padding: [40, 40] });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [teeLat, teeLng, greenLat, greenLng]);

  const distanceYd = Math.round(distance(point([teeLng, teeLat]), point([greenLng, greenLat]), { units: 'kilometers' }) / YD_TO_KM);

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-md pointer-events-none">
        {distanceYd} yd tee → green
      </div>
    </div>
  );
};

export default HoleMap;
