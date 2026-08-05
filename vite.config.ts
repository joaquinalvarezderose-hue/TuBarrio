import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';

  return {
    server: {
      port: 5173,
      host: 'localhost',
      strictPort: true,
    },
    plugins: [react()],
    build: {
      sourcemap: false,
      minify: 'esbuild',
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks: {
            'supabase': ['@supabase/supabase-js'],
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'leaflet-turf': ['leaflet', '@turf/bearing', '@turf/circle', '@turf/destination', '@turf/distance', '@turf/helpers'],
          },
        },
      },
    },
    esbuild: isProd
      ? {
          drop: ['console', 'debugger'],
          legalComments: 'none',
        }
      : undefined,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
