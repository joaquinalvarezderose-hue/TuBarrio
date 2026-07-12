// This SW simply unregisters itself and clears all caches
// to allow the app to work without Service Worker caching issues

self.addEventListener('install', (event) => {
  console.log('[SW] Installing and skipping waiting...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating and clearing all caches...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      console.log('[SW] Found caches:', cacheNames);
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('[SW] Deleting cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      console.log('[SW] All caches cleared, claiming clients...');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Don't intercept anything, let the browser handle all requests normally
  // This allows the app to work without any caching
});

console.log('[SW] Service Worker loaded - passing through all requests');
