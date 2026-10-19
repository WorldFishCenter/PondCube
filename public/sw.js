// Lets the installed app open with no signal: the last page that loaded, plus its build files.
// Saving still needs signal; a save made offline fails and its draft stays on the device.
// Registered by components/service-worker.tsx. Bump CACHE to drop everything kept so far.
const CACHE = "pondcube-v1";

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

  // Pages: network first, so with signal the page (and who is signed in) is always current.
  // ponytail: the last page stays on the device after sign-out until the next load with signal;
  // saves are still checked against whoever is signed in.
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

  // Build files are content-hashed and served immutable, so cache first. Dev builds aren't immutable,
  // so `next dev` never gets stale files.
  // ponytail: old deploys' files pile up until CACHE is bumped; prune them if storage ever matters.
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
