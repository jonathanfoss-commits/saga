/* SAGA service worker – cache app shell so the app opens offline (API calls still need network). */
const CACHE = "saga-v1";
const SHELL = [
  ".",
  "index.html",
  "manifest.webmanifest",
  "../icons/icon-192.png",
  "../icons/icon-512.png",
  "../icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never intercept API calls
  if (url.origin !== location.origin) return;
  // HTML/JS/CSS: always revalidate with the server (cheap ETag check) so
  // deployed fixes take effect on the next open instead of after cache expiry.
  const dest = e.request.destination;
  const revalidate = e.request.mode === "navigate" || dest === "document" || dest === "script" || dest === "style";
  const request = revalidate ? new Request(e.request, { cache: "no-cache" }) : e.request;
  e.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
