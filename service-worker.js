// Cache strategy: Network-first with fallback
// Esto asegura que siempre busques la última versión del servidor
// IMPORTANTE: sube este número cada vez que la lista de abajo cambie (archivos nuevos,
// renombrados o borrados) — un CACHE_NAME distinto fuerza a borrar el cache viejo en
// el evento 'activate', que es lo único que garantiza que un cliente con la app ya
// instalada como PWA deje de servir archivos que ya no existen (ej. styles.css).
const CACHE_NAME = 'centro-financiero-cache-v5';
const CRITICAL_FILES = [
  '/centro-financiero/index.html',
  '/centro-financiero/manifest.json',
  '/centro-financiero/css/tokens.css',
  '/centro-financiero/css/layout.css',
  '/centro-financiero/css/hero.css',
  '/centro-financiero/css/cards.css',
  '/centro-financiero/css/forms.css',
  '/centro-financiero/css/buttons.css',
  '/centro-financiero/css/entries-list.css',
  '/centro-financiero/css/presupuesto.css',
  '/centro-financiero/css/metricas.css'
];
const JS_FILES = [
  '/centro-financiero/js/constantes.js',
  '/centro-financiero/js/filtros-busqueda.js',
  '/centro-financiero/js/modales.js',
  '/centro-financiero/js/guardado-core.js',
  '/centro-financiero/js/metas.js',
  '/centro-financiero/js/cuentas-carga.js',
  '/centro-financiero/js/balances-formato.js',
  '/centro-financiero/js/movimientos.js',
  '/centro-financiero/js/render-metricas.js',
  '/centro-financiero/js/pendientes-transferencias.js',
  '/centro-financiero/js/movimiento-list-renderer.js',
  '/centro-financiero/js/pendiente-list-renderer.js',
  '/centro-financiero/js/swipe-delete.js',
  '/centro-financiero/js/respaldo.js',
  '/centro-financiero/js/verificacion-sync.js',
  '/centro-financiero/js/offline-sync.js',
  '/centro-financiero/js/auth-arranque.js'
];
const urlsToCache = [...CRITICAL_FILES, ...JS_FILES];

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

// Fetch: Network-first for everything (ensures latest version)
// Falls back to cache only if offline
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Network-first strategy for all requests
  event.respondWith(
    fetch(request)
      .then(response => {
        // Cache successful responses for offline use
        if (response.status === 200 && response.type !== 'error') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fall back to cache if network fails
        return caches.match(request).then(cached => {
          if (cached) return cached;

          // Offline fallback
          if (request.mode === 'navigate') {
            return caches.match('/centro-financiero/index.html');
          }

          return new Response('Offline - recurso no disponible', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' })
          });
        });
      })
  );
});
