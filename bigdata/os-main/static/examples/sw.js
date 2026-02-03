// Service Worker for Mishkah Drawing Board
const CACHE_NAME = 'mishkah-drawing-v3';
const urlsToCache = [
  './drawing.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Caching app resources');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Network First for HTML, Cache First for others
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network First strategy for HTML files to ensure fresh content
  if (event.request.headers.get('accept').includes('text/html') || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone and cache the response
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(event.request);
        })
    );
  } else {
    // Cache First strategy for other resources (CSS, JS, images)
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          if (response) {
            return response;
          }

          const fetchRequest = event.request.clone();
          return fetch(fetchRequest).then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });

            return response;
          }).catch(() => {
            return new Response(
              '<h1>Offline</h1><p>You are currently offline. Please check your internet connection.</p>',
              { headers: { 'Content-Type': 'text/html' } }
            );
          });
        })
    );
  }
});

// Background sync for saving drawings
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-drawings') {
    event.waitUntil(syncDrawings());
  }
});

async function syncDrawings() {
  // Placeholder for syncing drawings when online
  console.log('🔄 Syncing drawings...');
}

// Push notifications (future feature)
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New update available',
    icon: '/static/examples/icon-192.png',
    badge: '/static/examples/badge-72.png'
  };

  event.waitUntil(
    self.registration.showNotification('Mishkah Drawing Board', options)
  );
});
