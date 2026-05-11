// ==========================================
// SERVICE WORKER - Asset Caching
// Network First Strategie für schnellere Seitenwechsel
// ==========================================

var CACHE_NAME = 'room8-v46';
var IMAGE_CACHE = 'room8-images-v1';

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
    'lib/supabase.min.js',
    'lib/qrcode.min.js',
    'lib/html5-qrcode.min.js'
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

// Activate: Alte Caches löschen (Image-Cache behalten)
self.addEventListener('activate', function(event) {
    console.log('SW: Activate');
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.filter(function(name) {
                    return name !== CACHE_NAME && name !== IMAGE_CACHE;
                }).map(function(name) {
                    return caches.delete(name);
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// Fetch: Network First für HTML, Cache First für Assets, Stale-While-Revalidate für Bilder
self.addEventListener('fetch', function(event) {
    if (event.request.method !== 'GET') return;
    var url = new URL(event.request.url);

    // Supabase Storage Bilder: Cache-First, ~80% schneller bei Repeat-Visits
    var isSupabaseImage =
        url.hostname.indexOf('supabase.co') !== -1 &&
        (url.pathname.indexOf('/storage/v1/render/image/') !== -1 ||
         url.pathname.indexOf('/storage/v1/object/public/') !== -1);

    if (isSupabaseImage) {
        event.respondWith(
            caches.open(IMAGE_CACHE).then(function(cache) {
                return cache.match(event.request).then(function(cached) {
                    var fetchPromise = fetch(event.request).then(function(response) {
                        if (response && response.ok) {
                            cache.put(event.request, response.clone()).catch(function() {});
                        }
                        return response;
                    }).catch(function() { return cached; });
                    return cached || fetchPromise;
                });
            })
        );
        return;
    }

    // Andere Supabase-Requests (Auth, REST, RPC, Realtime): NIEMALS cachen
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
