const CACHE_VERSION = "v6";
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const APP_SHELL_FILES = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/auth-gate.js",
  "/manifest.json",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
  "/assets/logotipo.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      for (const url of APP_SHELL_FILES) {
        try {
          await cache.add(url);
        } catch {
          /* um arquivo 404 não derruba o resto */
        }
      }
    })()
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

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

async function cacheMatchBest(request) {
  let r = await caches.match(request);
  if (r) return r;
  r = await caches.match(request, { ignoreSearch: true });
  if (r) return r;
  const indexUrl = new URL("/index.html", self.location.origin).href;
  r = await caches.match(indexUrl);
  if (r) return r;
  return caches.match(new URL("/", self.location.origin).href);
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  /* APIs: rede direta — nunca devolver 503 sintético do SW */
  if (isApiRequest(requestUrl)) return;

  event.respondWith(
    (async () => {
      const fromCache = await cacheMatchBest(event.request);
      if (fromCache) return fromCache;

      try {
        const response = await fetch(event.request);
        if (response && response.status === 200 && response.type === "basic") {
          try {
            const cache = await caches.open(APP_SHELL_CACHE);
            await cache.put(event.request, response.clone());
          } catch {
            /* quota */
          }
        }
        return response;
      } catch {
        const again = await cacheMatchBest(event.request);
        if (again) return again;

        if (event.request.mode === "navigate") {
          const idx = await caches.match(new URL("/index.html", self.location.origin).href);
          if (idx) return idx;
        }

        /* recurso estático sem cache: 404 leve (evita 503 enganoso) */
        return new Response("", { status: 404, statusText: "Not in cache" });
      }
    })()
  );
});
