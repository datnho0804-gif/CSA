/* Service worker – cho phép cài app và mở lại khi mất mạng.
 * Trang (index.html): ưu tiên mạng, mất mạng thì dùng bản đã lưu.
 * File tĩnh (js, css, thư viện, icon): dùng bản đã lưu và cập nhật ngầm từ mạng.
 * Thư viện PDF/Excel được lưu khi dùng lần đầu. Đổi VERSION khi phát hành bản mới. */
const VERSION = 'v1.0.0';
const CACHE = `khung-bang-hieu-${VERSION}`;
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'assets/style.css',
  'assets/js/core.js', 'assets/js/cutting.js', 'assets/js/design.js', 'assets/js/drawing.js',
  'assets/js/export.js', 'assets/js/app.js', 'assets/icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('khung-bang-hieu-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match('index.html'))),
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
        .catch(() => cached);
      return cached || net;
    }),
  );
});
