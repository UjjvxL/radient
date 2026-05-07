/**
 * Radient — Service Worker
 * Network-first for API, Cache-first for assets, Offline fallback
 */

const CACHE_NAME = 'radient-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/db.js',
  '/js/player.js',
  '/js/search.js',
  '/js/playlists.js',
  '/js/spotify-import.js',
  '/js/ui.js',
  '/js/app.js',
  '/manifest.json',
  '/icon-512.png'
];

// ─── Install: cache essential assets ───
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching core assets...');
        return cache.addAll(ASSETS_TO_CACHE).catch(err => {
          console.warn('[SW] Some assets failed to cache:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// ─── Activate: delete old caches ───
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch: smart routing ───
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and non-http(s)
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) return;

  // Audio streams: always network, never cache (large binary files)
  if (
    url.hostname.includes('jiosaavn') ||
    url.hostname.includes('akamaized') ||
    url.hostname.includes('saavncdn') ||
    url.pathname.includes('.mp3') ||
    url.pathname.includes('.aac')
  ) {
    return; // Let browser handle directly
  }

  // API calls: network-first, fallback to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Google Fonts / CDN: cache-first
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Static assets: cache-first, network fallback
  event.respondWith(
    caches.match(request)
      .then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        });
      })
      .catch(() => {
        // Offline fallback for page navigations
        if (request.destination === 'document') {
          return caches.match('/index.html');
        }
        return new Response('Offline', { status: 503 });
      })
  );
});

// ─── Background sync (future: sync history) ───
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-history') {
    event.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(client =>
          client.postMessage({ type: 'SYNC_HISTORY' })
        )
      )
    );
  }
});

console.log('[SW] Radient Service Worker v2 loaded');
