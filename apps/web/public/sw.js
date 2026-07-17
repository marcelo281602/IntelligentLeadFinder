/*
 * Minimal service worker: enables PWA installability. Network-first for
 * everything — authenticated SaaS data must never be served stale from a
 * cache. Only the offline fallback shell is precached.
 */
const CACHE = 'leadfinder-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  // Pass-through: the network is authoritative for an authenticated app.
  event.respondWith(fetch(event.request));
});
