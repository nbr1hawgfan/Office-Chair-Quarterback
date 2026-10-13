/* Office Chair QB service worker — caches the app shell only; live data always comes from the network */
const VERSION = 'ocq-v1';
const SHELL = ['./', './index.html', './css/app.css', './manifest.json', './icons/icon-192.png', './icons/icon-512.png',
  './js/config.js', './js/core.js', './js/scores.js', './js/team.js', './js/players.js', './js/more.js', './js/pickem.js', './js/app.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request).then(m => m || caches.match('./index.html'))));
});
