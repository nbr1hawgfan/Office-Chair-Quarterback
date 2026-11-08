/* Office Chair QB service worker — caches the app shell only; live data always comes from the network */
const VERSION = 'ocq-v27';
const SHELL = ['./', './index.html', './css/app.css', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-256.png', './icons/icon-384.png', './icons/icon-maskable-192.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png', './icons/icon.svg',
  './js/config.js', './js/core.js', './js/watch.js', './js/links.js', './js/share.js', './js/myffl.js', './js/alerts.js', './js/gamecast.js', './js/scores.js', './js/titles.js', './js/team.js', './js/players.js', './js/more.js', './js/pickem.js', './js/fantasy.js', './js/rivalry.js', './js/brief.js', './js/gameday.js', './js/profile.js', './js/ticker.js', './js/history.js', './js/clips.js', './js/stats.js', './js/sync.js', './js/postseason.js', './js/bracket.js', './js/survivor.js', './js/race.js', './js/weekend.js', './js/awards.js', './js/app.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});
/* ---------- score alerts ---------- */
self.addEventListener('push', e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (er) { m = { title: 'Office Chair QB', body: e.data && e.data.text() }; }
  const url = new URL(m.path || '', self.registration.scope).href;
  e.waitUntil(self.registration.showNotification(m.title || 'Office Chair QB', {
    body: m.body || '', tag: m.tag || undefined, renotify: !!m.tag, icon: './icons/icon-192.png', badge: './icons/icon-maskable-192.png', data: { url }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open) { open.postMessage({ type: 'openUrl', url }); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => list.forEach(c => c.postMessage({ type: 'resubscribe' }))));
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request).then(m => m || caches.match('./index.html'))));
});
