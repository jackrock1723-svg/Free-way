const CACHE = 'fc-react-shell-v2';
const CACHE_PREFIX = 'fc-react-shell-';
const STATIC_ASSET_PATH = /\.(?:css|js|mjs|png|jpe?g|gif|svg|webmanifest|ico|woff2?|ttf|otf)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET'
    || request.mode === 'navigate'
    || request.destination === 'document'
    || url.origin !== self.location.origin
    || url.search
    || url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/preview/')
    || !STATIC_ASSET_PATH.test(url.pathname)
  ) return;

  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) return response;
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
        return response;
      })
      .catch(async () => (await caches.match(request)) || Response.error()),
  );
});
