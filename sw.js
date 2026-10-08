/* Offline shell: cache app files, streams stay live. */
const C = "radio-si-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(C).then((c) => c.addAll(["./", "index.html", "styles.css", "app.js", "stations.js", "manifest.json"])).then(() => self.skipWaiting()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.url.includes("radio-browser") || e.request.url.startsWith("http://") && e.request.url.includes(":.mp3") || /\.(mp3|aac|ogg|m3u|pls)([?;]|$)/.test(e.request.url)) return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).catch(() => caches.match("index.html"))));
});
