/* KILL-SWITCH SERVICE WORKER
   This worker replaces the old 'njm-static-v3' worker. It does not
   cache anything. On activation it wipes every cache and unregisters
   itself so the site always loads fresh files from the server. */
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }).then(function () {
      self.clients.claim();
      self.registration.unregister();
    })
  );
});
