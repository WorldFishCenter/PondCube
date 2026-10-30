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
const isBuildFile = (url) => url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");

// Pages: network first, so with signal the page is always current; kept under its path.
const page = (event, request, path) =>
  fetch(request).then((response) => {
    if (response.ok) keep(event, path, response.clone());
    return response;
  });

// Build files: cache first, keeping only those served immutable (never `next dev`'s).
const buildFile = (event, request) =>
  caches.match(request).then(
    (hit) =>
      hit ??
      fetch(request).then((response) => {
        if (response.ok && response.headers.get("cache-control")?.includes("immutable"))
          keep(event, request, response.clone());
        return response;
      }),
  );

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Downloads (/api/) aren't pages: never kept, so no signal never hands over an old file.
  if (request.mode === "navigate" && !url.pathname.startsWith("/api/"))
    event.respondWith(
      page(event, request, url.pathname).catch(async () => (await caches.match(url.pathname)) ?? Response.error()),
    );
  else if (isBuildFile(url)) event.respondWith(buildFile(event, request));
});

// The app asks when this worker didn't see it load as the signed-in app (a first load, a sign-in).
self.addEventListener("message", (event) => {
  if (!Array.isArray(event.data?.keep)) return;
  const path = new URL(event.source.url).pathname;
  const files = event.data.keep.map((name) => new URL(name)).filter(isBuildFile);
  event.waitUntil(
    Promise.all([page(event, path, path), ...files.map((url) => buildFile(event, url.href))]).catch(() => {}), // no signal: keep what's there
  );
});
