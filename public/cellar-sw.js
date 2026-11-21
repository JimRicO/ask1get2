// Only cache public app code and client-rendered inventory shells. Never cache
// auth, server functions, API calls, Cloud responses or private tasting audio.
const CACHE = "wv-cellar-shell-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_PRIVATE_MEDIA") {
    event.waitUntil(caches.delete(CACHE));
  }
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("wv-cellar-shell-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const shell = request.mode === "navigate" && (url.pathname === "/cellar" || /^\/wine\/[^/]+$/.test(url.pathname));
  const asset = ["script", "style", "font", "image"].includes(request.destination) && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/_serverFn/");
  if (!shell && !asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok && (!shell || new URL(response.url).pathname === url.pathname)) await cache.put(request, response.clone());
      return response;
    } catch (error) {
      const saved = await cache.match(request);
      if (saved) return saved;
      throw error;
    }
  })());
});