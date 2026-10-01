const CACHE = 'cmu-doctrack-v14-consistent-save-status';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/app-icon.svg',
  './css/style.css',
  './js/app.js',
  './js/api.js',
  './js/support.js',
  './css/workspace.css',
  './css/home.css',
  './js/home.js',
  './icons/cmuaa-logo.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
