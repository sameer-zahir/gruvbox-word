// sw.js — offline-first service worker for Gruvbox Word.
const CACHE = "gruvbox-word-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./assets/css/app.css",
  "./assets/js/app.js",
  "./assets/js/editor.js",
  "./assets/js/markdown.js",
  "./assets/js/storage.js",
  "./assets/js/export.js",
  "./assets/fonts/JetBrainsMonoNerd-Regular.woff2",
  "./assets/fonts/JetBrainsMonoNerd-Bold.woff2",
  "./assets/fonts/JetBrainsMonoNerd-Italic.woff2",
  "./assets/fonts/JetBrainsMonoNerd-BoldItalic.woff2",
  "./assets/icons/favicon.svg",
  "./manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ||
        fetch(e.request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
            return res;
          })
          .catch(() => cached)
    )
  );
});
