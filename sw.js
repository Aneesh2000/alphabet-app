// Cache-first service worker. Bump VERSION whenever any file changes so devices pick up the
// new files on the next launch (old caches are deleted on activate).
const VERSION = 'abc-owl-v2';
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'css/styles.css',
  'fonts/Andika-Bold.ttf',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/data.js',
  'js/storage.js',
  'js/engine.js',
  'js/speech.js',
  'js/sfx.js',
  'js/rewards.js',
  'js/app.js',
  // Add recorded clips here when you create them, e.g. 'audio/a.mp3'.
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          // Runtime-cache anything else same-origin (e.g. audio clips added later).
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()));
    })
  );
});
