console.log('[index.tsx] v1 - Starting');

import './tailwind.css';
import 'material-symbols/outlined.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log('[index.tsx] v2 - All imports successful');

try {
  const rootElement = document.getElementById('root');
  console.log('[index.tsx] v3 - Root element:', !!rootElement);

  if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(React.createElement(App));
    console.log('[index.tsx] v4 - App rendered');
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
