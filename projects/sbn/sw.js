/**
 * Service Worker for Mostamal Hawa PWA
 * بسم الله الرحمن الرحيم
 * Version: 2.0.0 - Unified Mishkah.js Build
 */

const CACHE_VERSION = 'sbn-v2.0.0';
const CACHE_STATIC = 'sbn-static-v2';
const CACHE_DYNAMIC = 'sbn-dynamic-v2';

// Files to cache on install
const STATIC_CACHE_FILES = [
  '/projects/sbn/',
  '/projects/sbn/index.html',
  '/projects/sbn/app.js',
  '/projects/sbn/manifest.json',
  // Updated to unified mishkah.js build
  '/lib/mishkah.js'
];

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log('[SW v2.0] Installing service worker with unified Mishkah.js...');

  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => {
        console.log('[SW v2.0] Caching static files');
        return cache.addAll(STATIC_CACHE_FILES);
      })
      .then(() => {
        console.log('[SW v2.0] Static files cached successfully');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW v2.0] Error caching static files:', err);
        // Continue anyway - network-first will handle it
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW v2.0] Activating service worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete all old cache versions
            if (cacheName !== CACHE_STATIC && cacheName !== CACHE_DYNAMIC) {
              console.log('[SW v2.0] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW v2.0] Old caches cleaned, service worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - Network-first strategy for better updates
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip WebSocket requests
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // API requests - always try network first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache successful API responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_DYNAMIC).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cached API response if available
          return caches.match(request);
        })
    );
    return;
  }

  // Network-first strategy for app files (better for development/updates)
  if (url.pathname.includes('/projects/sbn/') ||
      url.pathname.includes('/lib/mishkah.js')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful responses
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_DYNAMIC).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          console.log('[SW v2.0] Network failed, serving from cache:', url.pathname);
          return caches.match(request);
        })
    );
    return;
  }

  // Cache-first for other static resources (fonts, images, etc.)
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(request)
          .then((response) => {
            // Don't cache errors
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }

            // Cache the response
            const responseClone = response.clone();
            caches.open(CACHE_DYNAMIC).then((cache) => {
              cache.put(request, responseClone);
            });

            return response;
          })
          .catch((err) => {
            console.error('[SW v2.0] Fetch error:', err);
            // Return offline fallback
            return caches.match('/projects/sbn/index.html');
          });
      })
  );
});

// Message event - handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW v2.0] SKIP_WAITING message received');
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[SW v2.0] CLEAR_CACHE message received');
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log('[SW v2.0] Clearing cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }).then(() => {
        console.log('[SW v2.0] All caches cleared');
      })
    );
  }
});

// Background sync event
self.addEventListener('sync', (event) => {
  console.log('[SW v2.0] Background sync:', event.tag);

  if (event.tag === 'sync-data') {
    event.waitUntil(
      fetch('/api/sync')
        .then((response) => response.json())
        .then((data) => {
          console.log('[SW v2.0] Data synced:', data);
        })
        .catch((err) => {
          console.error('[SW v2.0] Sync error:', err);
        })
    );
  }
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[SW v2.0] Push notification received');

  const data = event.data ? event.data.json() : {};
  const title = data.title || 'مستعمل حواء';
  const options = {
    body: data.body || 'لديك إشعار جديد',
    icon: '/projects/sbn/icons/icon-192x192.png',
    badge: '/projects/sbn/icons/badge-72x72.png',
    vibrate: [200, 100, 200],
    data: data,
    actions: [
      {
        action: 'open',
        title: 'فتح'
      },
      {
        action: 'close',
        title: 'إغلاق'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW v2.0] Notification clicked:', event.action);

  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow('/projects/sbn/')
    );
  }
});
