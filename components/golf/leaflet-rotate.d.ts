// leaflet-rotate no trae tipos propios: es un side-effect import que parchea
// L.Map/L.Marker en tiempo de ejecucion (ver HoleMap.tsx). Estos son solo los
// pedazos de esa API que este proyecto usa.
// El `export {}` es necesario para que TS trate este archivo como modulo: sin
// eso, el `declare module 'leaflet'` de abajo REEMPLAZA los tipos de
// @types/leaflet en vez de solo agregarles estos campos (augmentation).
export {};

declare module 'leaflet-rotate';

declare module 'leaflet' {
  interface MapOptions {
    // Habilita el motor de rotacion del plugin (necesario para que `bearing`,
    // `touchRotate` y `setBearing` tengan efecto).
    rotate?: boolean;
    // Rumbo inicial del mapa en grados (0 = norte arriba), aplicado al montar.
    bearing?: number;
    // false = sin boton de rotacion manual (el rumbo queda fijo, seteado por codigo).
    rotateControl?: boolean | Record<string, unknown>;
    // false = sin gesto de rotar con dos dedos (el rumbo queda fijo).
    touchRotate?: boolean;
  }

  interface Map {
    setBearing(theta: number): void;
    getBearing(): number;
  }
}
