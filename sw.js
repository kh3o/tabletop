/**
 * Service Worker for Tabletop Data Tracker Engine
 * Handles offline caching and asset management.
 */

const CACHE_NAME = 'tabletop-tracker-v1';
const ASSETS_TO_CACHE = [
    './', // Caches the root (index.html by default if start_url is './')
    './index.html',
    './manifest.json',
    './src/css/core.css',
    './src/css/players.css',
    './src/css/monsters.css',
    './src/js/app.js',
    './src/js/ui-controller.js',
    './src/js/storage.js', // Although not fully implemented, it should be cached
    './src/components/player-card.html',
    './src/components/monster-group.html',
    './src/assets/icons/icon-192x192.png', // Ensure these paths match your manifest
    './src/assets/icons/icon-512x512.png',
    // Game engine specific assets (add these as they become relevant or are created)
    './src/engines/massive-darnkess-2/md2.css', // Typo from blueprint: massive-darnkess-2 vs massive-darkness-2
    './src/engines/massive-darnkess-2/md2.js'
];

// Install event: Caches all static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching all assets.');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .catch((error) => {
                console.error('Service Worker: Caching failed:', error);
            })
    );
});

// Activate event: Cleans up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                    return null;
                }).filter(Boolean)
            );
        })
    );
});

// Fetch event: Serves cached content first, then falls back to network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached response if found
                if (response) {
                    return response;
                }
                // Fallback to network if not in cache
                return fetch(event.request).then((networkResponse) => {
                    // Cache new requests as they come in, but only if they are valid
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                }).catch((error) => {
                    console.error('Service Worker: Fetch failed:', error);
                    // This is where you could serve an offline page
                    // For now, it will just fail.
                });
            })
    );
});