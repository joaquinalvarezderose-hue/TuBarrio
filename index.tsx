import './tailwind.css';
import './material-symbols.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { CurrentUserProvider } from './hooks/useCurrentUser';

const RELOAD_FLAG = 'tubarrio_sw_cleanup_reloaded';

async function killStaleServiceWorkers(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;

  const wasControlled = !!navigator.serviceWorker.controller;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((reg) => reg.unregister()));

  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  }

  return wasControlled && registrations.length > 0;
}

function mount() {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(React.createElement(CurrentUserProvider, null, React.createElement(App)));
  }
}

// Corre en paralelo al mount, no antes: para la enorme mayoria de visitas (sin
// service worker viejo instalado) esto no encuentra nada que limpiar, asi que
// no tiene sentido demorar el primer render esperando esta verificacion.
async function cleanupStaleServiceWorkers() {
  try {
    const hadStaleServiceWorker = await killStaleServiceWorkers();
    if (hadStaleServiceWorker && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
    }
  } catch (error) {
    console.error('[index.tsx] SW cleanup error:', error);
  }
}

try {
  mount();
} catch (error) {
  console.error('[index.tsx] ERROR:', error);
  document.body.innerHTML = `<div style="color: red; padding: 20px; font-size: 16px;">
    <strong>ERROR:</strong><br/>
    ${String(error)}<br/><br/>
    <pre style="overflow: auto; background: #f0f0f0; padding: 10px;">
    ${error instanceof Error ? error.stack : 'No stack trace'}
    </pre>
  </div>`;
}

void cleanupStaleServiceWorkers();
