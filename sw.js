/**
 * AlpineNav Service Worker
 * - Caches the app shell so it loads offline
 * - Caches map tiles automatically as you browse (cache-first)
 * - Supports the "Download Area" tile pre-caching feature
 */

const APP_CACHE = 'alpinenav-app-v1';
const TILE_CACHE = 'alpinenav-tiles-v1';

// Files that make up the app shell
const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/storage.js',
  '/gpxParser.js',
  '/manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
];

// ── Install: cache the app shell ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== APP_CACHE && k !== TILE_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: serve from cache, fall back to network ───────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Map tiles — cache-first (tiles don't change)
  if (url.hostname.endsWith('tile.opentopomap.org')) {
    event.respondWith(
      caches.open(TILE_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request, { mode: 'no-cors' }).then((response) => {
            // Only cache valid responses (opaque status=0 is fine for tiles)
            if (response.status === 200 || response.type === 'opaque') {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => cached); // if network fails return nothing (tile stays grey)
        })
      )
    );
    return;
  }

  // App shell — cache-first for assets, network-first for HTML
  if (url.origin === self.location.origin) {
    if (event.request.mode === 'navigate') {
      // HTML: try network, fall back to cached index.html
      event.respondWith(
        fetch(event.request).catch(() =>
          caches.match('/index.html')
        )
      );
    } else {
      // Assets (CSS, JS): cache-first
      event.respondWith(
        caches.match(event.request).then((cached) =>
          cached || fetch(event.request).then((response) => {
            caches.open(APP_CACHE).then((c) => c.put(event.request, response.clone()));
            return response;
          })
        )
      );
    }
    return;
  }

  // Leaflet CDN assets — cache-first
  if (url.hostname === 'unpkg.com') {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached || fetch(event.request).then((response) => {
          caches.open(APP_CACHE).then((c) => c.put(event.request, response.clone()));
          return response;
        })
      )
    );
    return;
  }
});

// ── Message: handle tile pre-download from app ───────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CACHE_TILES') {
    const { urls } = event.data;
    cacheTilesBatch(urls, event.source);
  }
});

async function cacheTilesBatch(urls, client) {
  const cache = await caches.open(TILE_CACHE);
  let done = 0;
  // Fetch tiles in batches of 6 to avoid overwhelming the tile server
  for (let i = 0; i < urls.length; i += 6) {
    const batch = urls.slice(i, i + 6);
    await Promise.allSettled(
      batch.map(async (url) => {
        const existing = await cache.match(url);
        if (!existing) {
          try {
            const res = await fetch(url, { mode: 'no-cors' });
            await cache.put(url, res);
          } catch (_) { /* tile server unreachable, skip */ }
        }
      })
    );
    done += batch.length;
    client.postMessage({ type: 'TILE_PROGRESS', done, total: urls.length });
    // Small delay to be respectful to the tile server
    await new Promise((r) => setTimeout(r, 150));
  }
  client.postMessage({ type: 'TILE_DONE', total: urls.length });
}
