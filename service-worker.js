// Service Worker for PWA (App Shell Cache-First, Data Network-First with Fallback)
const CACHE_NAME = 'rubikvault-v2'; // Updated Version
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/imprint.html',
  '/privacy.html',
  '/disclaimer.html'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) {
    // Network-First for Data
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request)) // Fallback to Cache if Offline
    );
  } else {
    // Cache-First for App Shell
    e.respondWith(
      caches.match(e.request).then((response) => response || fetch(e.request))
    );
  }
});