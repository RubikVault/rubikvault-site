// D12. Service Worker (PWA Setup)

const CACHE_NAME = 'rubikvault-v2-1'; // Versionierung wegen neuer Features
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/imprint.html',
  '/privacy.html',
  '/disclaimer.html',
  '/manifest.json'
  // ANNAHME: Assets/Icons sind vorhanden
];
const API_CACHE_NAME = 'rubikvault-data-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: App Shell Cached');
      return cache.addAll(ASSETS); // Cache-First für Shell
    })
  );
});

self.addEventListener('activate', (event) => {
  // Löscht alte Caches
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME && key !== API_CACHE_NAME) {
          console.log('Service Worker: Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // D12. Network-First für API-Daten (Aktualität > Cache)
  if (url.pathname.startsWith('/api/') || url.hostname.includes('tradingview.com')) {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          // Cache API-Daten nach erfolgreichem Abruf
          const responseToCache = response.clone();
          caches.open(API_CACHE_NAME).then(cache => {
            cache.put(e.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // Fallback auf den letzten Cache bei Offline/Fehler
          return caches.match(e.request);
        })
    );
    return;
  }

  // Cache-First für die App Shell (Schnelligkeit)
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request).catch(() => {
        // Fallback für HTML-Seiten, wenn offline
        if (e.request.mode === 'navigate') {
            return caches.match('/index.html'); // Offline-Fallback auf die Hauptseite
        }
    }))
  );
});