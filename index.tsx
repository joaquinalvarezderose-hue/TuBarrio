console.log('[index.tsx] Loading...');

import './tailwind.css';
import 'material-symbols/outlined.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log('[index.tsx] Imports complete, finding root...');

const rootElement = document.getElementById('root');
console.log('[index.tsx] Root element:', rootElement);
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('[index.tsx] SW registered successfully');
    }).catch(err => {
      console.error('[index.tsx] SW registration failed:', err);
    });
  });
}
