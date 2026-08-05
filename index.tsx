import './tailwind.css';
import './material-symbols.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

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

async function bootstrap() {
  try {
    const hadStaleServiceWorker = await killStaleServiceWorkers();

    if (hadStaleServiceWorker && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
      return;
    }

    const rootElement = document.getElementById('root');
    if (rootElement) {
      const root = ReactDOM.createRoot(rootElement);
      root.render(React.createElement(App));
    }
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
}

void bootstrap();
