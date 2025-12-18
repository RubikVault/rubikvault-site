/* RubikVault Service Worker
   - Goal: fast loads + safe updates (avoid "stale CSS breaks layout" after deploys)
*/
const CACHE_NAME = 'rv-cache-v5';

// Cache the bare minimum shell.
// (Keep this list tight so updates are reliable.)
const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/imprint.html',
  '/disclaimer.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop old caches so new deploys don't keep old CSS/JS around.
    const keys = await caches.keys();
    await Promise.all(
      keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 1) Navigations: network-first, fallback to cached shell.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('/index.html', fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  // 2) Critical assets (CSS/JS): network-first to avoid "stale layout" after deploy.
  // Cloudflare Pages updates fast; this makes UI changes show up immediately.
  const isCriticalAsset =
    req.destination === 'style' ||
    req.destination === 'script' ||
    req.url.endsWith('.css') ||
    req.url.endsWith('.js');

  if (isCriticalAsset) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(req)) || Response.error();
      }
    })());
    return;
  }

  // 3) Everything else: cache-first, then network (good for images/icons).
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;

    const fresh = await fetch(req);
    // Only cache successful basic/opaque responses
    if (fresh && (fresh.status === 200 || fresh.type === 'opaque')) {
      cache.put(req, fresh.clone());
    }
    return fresh;
  })());
});