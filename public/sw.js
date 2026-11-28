/* Service worker de WorkUco: lo mínimo para que se pueda instalar como app, y los avisos en el celular.
   No guarda páginas ni datos (todo sale siempre del servidor, nada viejo); sólo una página
   "sin conexión" para cuando se abre la app sin internet. */
'use strict';
const CACHE = 'wk-offline-v1';
const OFFLINE = '/offline.html';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, '/icon-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('wk-offline-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
/* avisos en el celular: el servidor manda { title, body, url } cifrado; acá se muestra */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const url = typeof d.url === 'string' && /^\/(?!\/)/.test(d.url) ? d.url : '/';
  e.waitUntil(self.registration.showNotification(d.title || 'WorkUco', {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', data: { url }, lang: 'es-AR', tag: url, renotify: true,
  }));
});
/* al tocarla: si WorkUco ya está abierto, lo trae al frente en esa página; si no, lo abre */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const same = list.find((c) => new URL(c.url).origin === self.location.origin);
    if (same) return same.navigate(url).then((c) => (c || same).focus()).catch(() => self.clients.openWindow(url));
    return self.clients.openWindow(url);
  }));
});
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return; // el resto va directo a la red, sin pasar por acá
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
