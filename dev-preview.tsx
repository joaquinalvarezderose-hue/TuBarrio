import './tailwind.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import HoleMap from './components/golf/HoleMap';

// Coordenadas de prueba (las mismas que se cargaron en Supabase para hoyos
// id=3 y id=18 de "El Canton") para verificar visualmente el encuadre
// acotado + rotacion fija tee->green, sin depender de auth/routing real.
const holeShort = {
  teeLat: -34.6037,
  teeLng: -58.3816,
  greenLat: -34.603293,
  greenLng: -58.38024,
  par: 3,
  yardas: 145,
  indice: 17,
};

const holeLong = {
  teeLat: -34.61,
  teeLng: -58.39,
  greenLat: -34.614663,
  greenLng: -58.392061,
  par: 5,
  yardas: 604,
  indice: 2,
};

function Box({ label, width, height, children }: { label: string; width: number; height: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ color: '#fff', fontFamily: 'sans-serif', fontSize: 12 }}>{label}</span>
      <div style={{ width, height, background: '#333' }}>{children}</div>
    </div>
  );
}

function Preview() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, padding: 24, background: '#111' }}>
      <Box label="compact - hoyo corto (145yd)" width={390} height={506}>
        <HoleMap {...holeShort} className="h-full w-full" compact />
      </Box>
      <Box label="compact - hoyo largo (604yd)" width={390} height={506}>
        <HoleMap {...holeLong} className="h-full w-full" compact />
      </Box>
      <Box label="fullscreen(interactive) - hoyo corto" width={400} height={700}>
        <HoleMap {...holeShort} className="h-full w-full" interactive />
      </Box>
      <Box label="fullscreen(interactive) - hoyo largo" width={400} height={700}>
        <HoleMap {...holeLong} className="h-full w-full" interactive />
      </Box>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<Preview />);
