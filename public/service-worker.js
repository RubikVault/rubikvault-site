/**
 * RubikVault Service Worker v3.1
 * 
 * Features:
 * - Offline-first for critical data
 * - Cache manifest + last_good snapshots
 * - Network-first with fallback for API
 * - Background sync ready
 */

const CACHE_VERSION = 'rv-v3.2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DATA_CACHE = `${CACHE_VERSION}-data`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Static assets (UI)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/stock',
  '/stock.html',
  '/market-clock.js',
  '/manifest.json',
  '/assets/rv-icon.png',
  '/assets/rv-favicon.png'
];

// Critical data (always cache last_good)
const CRITICAL_DATA = [
  '/data/manifest.json',
  '/data/provider-state.json',
  '/data/snapshots/market-health/latest.json',
  '/data/snapshots/stocks/latest.json'
];

/**
 * Install: Pre-cache critical assets
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v3.1...');
  
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE).then(cache => {
        return cache.addAll(STATIC_ASSETS).catch(err => {
          console.warn('[SW] Failed to cache some static assets:', err);
        });
      }),
      
      // Cache critical data
      caches.open(DATA_CACHE).then(cache => {
        return Promise.all(
          CRITICAL_DATA.map(url => 
            fetch(url)
              .then(response => cache.put(url, response))
              .catch(err => console.warn(`[SW] Failed to cache ${url}:`, err))
          )
        );
      })
    ]).then(() => {
      console.log('[SW] Installation complete!');
      self.skipWaiting();
    })
  );
});

/**
 * Activate: Clean old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v3.1...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('rv-') && name !== STATIC_CACHE && name !== DATA_CACHE && name !== API_CACHE)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Activation complete!');
      return self.clients.claim();
    })
  );
});

/**
 * Fetch: Handle requests with offline-first strategy
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // 1) API REQUESTS (/api/*)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleAPIRequest(request));
    return;
  }
  
  // 2) DATA REQUESTS (/data/*)
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(handleDataRequest(request));
    return;
  }
  
  // 3) NAVIGATION (HTML)
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }
  
  // 4) STATIC ASSETS
  event.respondWith(handleStaticRequest(request));
});

/**
 * Handle API requests: Network-first with cache fallback
 */
async function handleAPIRequest(request) {
  try {
    const response = await fetch(request);
    
    // Cache successful responses
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    
    return response;
  } catch (error) {
    // Network failed, try cache
    const cached = await caches.match(request);
    if (cached) {
      console.log('[SW] Serving API from cache (offline):', request.url);
      return cached;
    }
    
    // Return offline envelope
    return new Response(
      JSON.stringify({
        schema_version: '3.0',
        metadata: {
          served_from: 'SERVICE_WORKER_OFFLINE',
          offline: true
        },
        data: [],
        error: {
          class: 'OFFLINE',
          message: 'Network unavailable. Please check connection.',
          user_message: 'You are offline. Showing cached data.'
        }
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Handle data requests: Cache-first for last_good
 */
async function handleDataRequest(request) {
  const url = new URL(request.url);
  const isCritical = CRITICAL_DATA.some(path => url.pathname === path);
  
  if (isCritical) {
    // Cache-first for critical data
    const cached = await caches.match(request);
    if (cached) {
      // Update cache in background
      fetch(request).then(response => {
        if (response.ok) {
          caches.open(DATA_CACHE).then(cache => cache.put(request, response.clone()));
        }
      }).catch(() => {});
      
      return cached;
    }
  }
  
  // Network-first for non-critical
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DATA_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

/**
 * Handle navigation: Network-first with fallback
 */
async function handleNavigationRequest(request) {
  const url = new URL(request.url);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    const cache = await caches.open(STATIC_CACHE);
    if (response.ok && !url.pathname.startsWith('/analyze/')) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    if (url.pathname.startsWith('/analyze/')) {
      return caches.match('/stock') || caches.match('/stock.html') || fetch('/stock', { cache: 'no-store' });
    }
    return caches.match('/index.html') || fetch('/index.html', { cache: 'no-store' });
  }
}

/**
 * Handle static assets: Cache-first with network fallback
 */
async function handleStaticRequest(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    throw error;
  }
}

/**
 * Message handler for cache updates
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(names => {
        return Promise.all(names.map(name => caches.delete(name)));
      })
    );
  }
});

console.log('[SW] RubikVault Service Worker v3.1 loaded!');
