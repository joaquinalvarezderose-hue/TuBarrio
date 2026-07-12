const CACHE_NAME = 'tubarrio-v3';

// Returns a valid offline fallback Response
function getOfflineResponse() {
  return new Response(
    '<html><body style="font-family: sans-serif; padding: 20px;"><h1>Offline</h1><p>You are currently offline. Please check your connection and try again.</p></body></html>',
    { headers: { 'Content-Type': 'text/html' }, status: 503 }
  );
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('supabase.co')) return;

  const url = new URL(event.request.url);

  // Network-first for HTML so the latest index.html (with new asset hashes) is always used
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (!response || !response.ok) {
            return caches.match(event.request).then((cached) => cached || getOfflineResponse());
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || getOfflineResponse())
        )
    );
    return;
  }

  // Cache-first for versioned assets (content-hashed filenames never change)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(event.request)
          .then((response) => {
            if (!response || !response.ok) {
              return getOfflineResponse();
            }
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
          })
          .catch(() => getOfflineResponse());
      })
    );
    return;
  }

  // Default: network with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || !response.ok) {
          return caches.match(event.request).then((cached) => cached || getOfflineResponse());
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || getOfflineResponse())
      )
  );
});
