const CACHE_VERSION = "v8";
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
  return r || null;
}

async function cacheIndexFallback() {
  const indexUrl = new URL("/index.html", self.location.origin).href;
  let r = await caches.match(indexUrl);
  if (r) return r;
  return caches.match(new URL("/", self.location.origin).href);
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  /* APIs: rede direta — nunca devolver 503 sintético do SW */
  if (isApiRequest(requestUrl)) return;

  event.respondWith((async () => {
    const isNavigate = event.request.mode === "navigate";

    /* Navegação: prioriza rede para evitar "app preso" em versão antiga */
    if (isNavigate) {
      try {
        const fresh = await fetch(event.request);
        if (fresh && fresh.status === 200 && fresh.type === "basic") {
          try {
            const cache = await caches.open(APP_SHELL_CACHE);
            await cache.put(event.request, fresh.clone());
          } catch {
            /* quota */
          }
        }
        return fresh;
      } catch {
        const cachedNav = await cacheMatchBest(event.request);
        if (cachedNav) return cachedNav;
        const idx = await cacheIndexFallback();
        if (idx) return idx;
        return new Response("", { status: 404, statusText: "Not in cache" });
      }
    }

    /* Assets: cache first + atualização em background */
    const fromCache = await cacheMatchBest(event.request);
    if (fromCache) {
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(event.request);
          if (fresh && fresh.status === 200 && fresh.type === "basic") {
            const cache = await caches.open(APP_SHELL_CACHE);
            await cache.put(event.request, fresh);
          }
        } catch {
          /* offline */
        }
      })());
      return fromCache;
    }

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
      return new Response("", { status: 404, statusText: "Not in cache" });
    }
  })());
});
