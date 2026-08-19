const GAMEDAY_ASSET_CACHE = "gameday-pwa-assets-v1";
const APP_ASSETS = ["/manifest.webmanifest", "/icon", "/apple-icon"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(GAMEDAY_ASSET_CACHE).then((cache) => cache.addAll(APP_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Keep authenticated pages network-only. The worker exists to make the app
// installable without caching private picks or pool data.
self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || !APP_ASSETS.includes(requestUrl.pathname)) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
