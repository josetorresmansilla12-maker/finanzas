// Service worker de Mis Finanzas.
// Estrategia: "red primero, caché como respaldo" — la app instalada siempre
// muestra la versión más nueva cuando hay internet, y el caché solo se usa
// si el teléfono está sin conexión.

var CACHE_NAME = "finanzas-cache-v25";
var CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./js/constants.js",
  "./js/utils.js",
  "./js/storage.js",
  "./js/undo.js",
  "./js/tabs.js",
  "./js/trash.js",
  "./js/personas.js",
  "./js/tarjetas.js",
  "./js/compras.js",
  "./js/deudas.js",
  "./js/sueldo.js",
  "./js/estadisticas.js",
  "./js/informes.js",
  "./js/calculadora.js",
  "./js/alerts.js",
  "./js/backup.js",
  "./js/sync.js",
  "./js/main.js"
];

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(CORE_ASSETS);
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_NAME; })
          .map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, copy);
        });
        return response;
      })
      .catch(function () {
        return caches.match(event.request);
      })
  );
});
