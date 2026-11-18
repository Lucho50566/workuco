/* Service worker de WorkUco: lo mínimo para que se pueda instalar como app.
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
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return; // el resto va directo a la red, sin pasar por acá
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
