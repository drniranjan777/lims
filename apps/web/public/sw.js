/*
 * NLIMS service worker — makes the app installable and gives it a fast start and an offline page.
 * It caches only static app files (hashed Next.js bundles, fonts, icons, images). Pages and /api data
 * are never cached: lab data always comes live from the server, and nothing sensitive is kept on disk.
 */
const VERSION = 'nlims-v1';
const STATIC = `${VERSION}-static`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Static files that are safe to serve from cache: content-hashed bundles and public assets. */
const isStaticAsset = (url) =>
  url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || /\.(?:png|svg|ico|webp|woff2)$/.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // Pages: always from the network; show the offline page only when the server cannot be reached.
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (isStaticAsset(url)) {
    // Hashed bundles never change: cache-first. Other public files (logo, icons) may change between
    // releases: serve the cached copy and refresh it in the background.
    const immutable = url.pathname.startsWith('/_next/static/');
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(request);
        const refresh = fetch(request).then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        });
        if (hit) {
          if (!immutable) event.waitUntil(refresh.catch(() => undefined));
          return hit;
        }
        return refresh;
      }),
    );
  }
});
