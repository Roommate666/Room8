// ==========================================
// SERVICE WORKER - Asset Caching
// Network First Strategie für schnellere Seitenwechsel
// ==========================================

var CACHE_NAME = 'room8-v25';

// Statische Assets die gecacht werden sollen
var STATIC_ASSETS = [
    'style.css',
    'config.js',
    'session-cache.js',
    'navigation.js',
    'notificationBell.js',
    'notificationHelpers.js',
    'push-logic.js',
    'room8-ui.js',
    'room8-utils.js',
    'cities.js',
    'translations.js',
    'lib/supabase.min.js'
];

// Install: Statische Assets vorladen
self.addEventListener('install', function(event) {
    console.log('SW: Install');
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(STATIC_ASSETS);
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

// Activate: Alte Caches löschen
self.addEventListener('activate', function(event) {
    console.log('SW: Activate');
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.filter(function(name) {
                    return name !== CACHE_NAME;
                }).map(function(name) {
                    return caches.delete(name);
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// Fetch: Network First für HTML, Cache First für Assets
self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    // API-Requests (Supabase) NIEMALS cachen
    if (url.hostname.indexOf('supabase') !== -1) {
        return;
    }

    // Externe Requests nicht cachen
    if (url.origin !== self.location.origin) {
        return;
    }

    // HTML-Seiten: Network First (immer aktuell, Cache als Fallback)
    if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
        event.respondWith(
            fetch(event.request).then(function(response) {
                // Erfolgreiche Antwort cachen
                var clone = response.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                    cache.put(event.request, clone);
                });
                return response;
            }).catch(function() {
                // Offline: Aus Cache laden
                return caches.match(event.request);
            })
        );
        return;
    }

    // CSS/JS/Bilder: Cache First (schnell, Netzwerk im Hintergrund aktualisieren)
    event.respondWith(
        caches.match(event.request).then(function(cached) {
            // Immer im Hintergrund aktualisieren (Stale While Revalidate)
            var fetchPromise = fetch(event.request).then(function(response) {
                var clone = response.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                    cache.put(event.request, clone);
                });
                return response;
            }).catch(function() {
                return cached;
            });

            // Sofort aus Cache liefern, falls vorhanden
            return cached || fetchPromise;
        })
    );
});
