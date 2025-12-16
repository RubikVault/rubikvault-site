const CACHE_NAME = 'rubikvault-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/imprint.html',
  '/privacy.html',
  '/disclaimer.html',
  // WICHTIG: Externe Bibliotheken cachen, damit Charts offline/schnell laden
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Strategie für APIs (News, RSS Proxy): Network First, Fallback to Cache (wenn möglich) oder Fail
  if (url.hostname.includes('api.allorigins.win') || url.hostname.includes('rss2json')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  } 
  // Strategie für statische Assets & App Shell: Cache First
  else {
    e.respondWith(
      caches.match(e.request).then((response) => response || fetch(e.request))
    );
  }
});