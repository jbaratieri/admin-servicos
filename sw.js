const CACHE_VERSION = "v4";
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const APP_SHELL_FILES = ["/", "/index.html", "/style.css", "/app.js", "/auth-gate.js", "/manifest.json"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then(cache => cache.addAll(APP_SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith("app-shell-") && key !== APP_SHELL_CACHE)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        const cached = await caches.match(event.request);
        if (cached) return cached;

        const response = await fetch(event.request);
        if (response && response.status === 200 && response.type === "basic") {
          try {
            const cache = await caches.open(APP_SHELL_CACHE);
            await cache.put(event.request, response.clone());
          } catch {
            /* quota / storage */
          }
        }
        return response;
      } catch {
        const fallback = await caches.match(event.request);
        if (fallback) return fallback;
        return new Response("Sem rede", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=UTF-8" }
        });
      }
    })()
  );
});
