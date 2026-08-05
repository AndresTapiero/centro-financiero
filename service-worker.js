const CACHE_NAME = 'centro-financiero-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/js/constantes.js',
  '/js/filtros-busqueda.js',
  '/js/modales.js',
  '/js/guardado-core.js',
  '/js/metas.js',
  '/js/cuentas-carga.js',
  '/js/balances-formato.js',
  '/js/movimientos.js',
  '/js/render-metricas.js',
  '/js/pendientes-transferencias.js',
  '/js/movimiento-list-renderer.js',
  '/js/pendiente-list-renderer.js',
  '/js/respaldo.js',
  '/js/verificacion-sync.js',
  '/js/auth-arranque.js'
];

// Install: precache files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache).catch(err => {
        console.log('Cache addAll error (some files may not be available):', err);
        // Don't fail the install if some resources are missing
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first for API calls, cache-first for assets
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Network-first for Supabase API calls (must be fresh)
  if (url.hostname.includes('supabase') || url.hostname.includes('googleapis')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful responses for offline fallback
          if (response.status === 200) {
            const cache = caches.open(CACHE_NAME);
            cache.then(c => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          // Fall back to cache if network fails
          return caches.match(request);
        })
    );
    return;
  }

  // Cache-first for static assets (faster load)
  event.respondWith(
    caches.match(request).then(response => {
      if (response) return response;

      return fetch(request).then(response => {
        // Cache successful responses
        if (response.status === 200 && request.method === 'GET') {
          const cache = caches.open(CACHE_NAME);
          cache.then(c => c.put(request, response.clone()));
        }
        return response;
      }).catch(() => {
        // Return a basic offline page if available
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('Offline - recurso no disponible', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain'
          })
        });
      });
    })
  );
});
