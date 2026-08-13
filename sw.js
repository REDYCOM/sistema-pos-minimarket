// Service worker del POS Minimarket.
// Cachea el "app shell" (HTML/CSS/JS locales) y el SDK de Firebase para que la
// app abra sin conexión. Las llamadas de datos a Firestore/Auth NO se cachean:
// Firestore tiene su propia persistencia offline (IndexedDB) y se sincroniza sola.

const VERSION = 'pos-minimarket-v16';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './icon.svg',
  './manifest.json',
  './js/vendor/xlsx.full.min.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(c => c !== VERSION).map(c => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

// ¿Debe cachearse esta petición? Sí para lo propio de la app y el SDK de Firebase;
// no para las APIs dinámicas de Google (datos, auth), que van siempre a la red.
function esCacheable(url) {
  if (url.hostname.includes('googleapis.com')) return false; // Firestore/Auth/etc.
  if (url.hostname.includes('firebaseio.com')) return false;
  const mismoOrigen = url.origin === self.location.origin;
  const sdkFirebase = url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/');
  return mismoOrigen || sdkFirebase;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!esCacheable(url)) return; // deja que el navegador/Firestore lo maneje

  // Cache-first con actualización en segundo plano.
  event.respondWith(
    caches.match(req).then(cacheado => {
      const red = fetch(req).then(resp => {
        if (resp && resp.status === 200) {
          const copia = resp.clone();
          caches.open(VERSION).then(cache => cache.put(req, copia));
        }
        return resp;
      }).catch(() => cacheado);
      return cacheado || red;
    })
  );
});
