console.log('[index.tsx] v1 - Starting');

import React from 'react';
import ReactDOM from 'react-dom/client';

console.log('[index.tsx] v2 - React imported');

try {
  const rootElement = document.getElementById('root');
  console.log('[index.tsx] v3 - Root element found:', !!rootElement);

  if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      React.createElement('div', {
        style: { padding: '20px', fontSize: '24px', fontWeight: 'bold', color: 'green' }
      }, '✅ ADMIN PANEL FUNCIONA - index.tsx cargó correctamente')
    );
    console.log('[index.tsx] v4 - Rendered successfully');
  } else {
    console.error('[index.tsx] Root element not found!');
  }
} catch (error) {
  console.error('[index.tsx] ERROR:', error);
  document.body.innerHTML = `<div style="color: red; padding: 20px; font-size: 18px;">ERROR: ${String(error)}</div>`;
}
