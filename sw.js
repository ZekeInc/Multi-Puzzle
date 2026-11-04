// Service worker: caches the app so it works offline once installed.
// Bump CACHE when files change so phones pick up the new version.
const CACHE = 'sudoku-v4';
const FILES = [
  './',
  'index.html',
  'style.css',
  'sudoku.js',
  'app.js',
  'modes.js',
  'scores.js',
  'groups.js',
  'groups-app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network first so updates show up when online; fall back to the cache offline.
// 'no-cache' makes the browser check with the server instead of reusing a
// stale copy from its own HTTP cache, so a new page never gets old files.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return response;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
