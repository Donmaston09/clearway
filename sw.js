// Offline support: pre-cache the app shell so it works with no connection.
const CACHE = 'clearway-v1';
const SHELL = [
  './', 'index.html', 'css/app.css', 'js/app.js', 'js/store.js', 'js/hazard.js',
  'data/questions.json', 'data/topics.json', 'manifest.webmanifest', 'img/icon.svg',
  ...['give-way', 'stop', 'no-entry', 'national-speed-limit', 'clearway', 'no-waiting', 'min-30', 'max-30', 'ahead-only'].map(n => `img/signs/${n}.svg`),
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network first (so updates arrive straight away), falling back to the cache when offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
