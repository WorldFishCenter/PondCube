// Keeps the last page and its build files so the installed app opens with no signal (docs/architecture.md).
const CACHE = "pondcube-v1"; // bump to drop everything kept so far

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  ),
);

const keep = (event, key, response) => event.waitUntil(caches.open(CACHE).then((cache) => cache.put(key, response)));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Pages: network first, so with signal the page is always current; offline, the last one loaded.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) keep(event, url.pathname, response.clone());
          return response;
        })
        .catch(async () => (await caches.match(url.pathname)) ?? Response.error()),
    );
    return;
  }

  // Build files: cache first, keeping only those served immutable (never `next dev`'s).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok && response.headers.get("cache-control")?.includes("immutable"))
              keep(event, request, response.clone());
            return response;
          }),
      ),
    );
  }
});
