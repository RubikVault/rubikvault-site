/* Minimal SW: do NOT aggressively cache /api/* to keep news fresh */

const STATIC_CACHE = "rv-static-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Network-first for HTML, cache-first only for known static assets, always network for /api/*
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.pathname.toLowerCase().startsWith("/api/")) {
    event.respondWith(fetch(req).catch(() => new Response(JSON.stringify({ error: "offline" }), { status: 503 })));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(STATIC_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  const isStaticAsset = STATIC_ASSETS.includes(url.pathname);
  if (isStaticAsset) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(STATIC_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }))
    );
    return;
  }

  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
