// Service worker: keeps the app screens working offline AND makes sure a new version of the app always replaces the old one.
// Maps, search and routes still need the internet.
//
// How updates work:
//  - VERSION below is changed by `npm run stamp` whenever any app file changes, so the browser sees a new sw.js.
//  - The new worker installs, takes over at once (skipWaiting + clients.claim) and deletes every old cache.
//  - The page (src/app.js) notices the new worker and reloads itself once, so nobody keeps looking at an old copy.
//  - Files are fetched from the network first (never from the browser's own cache); the saved copy is only used when offline.
const VERSION = '1.3.0-29283014';
const CACHE = `centreway-${VERSION}`;
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'version.json', 'icons/icon-192.png', 'icons/icon-512.png',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/leaflet/images/marker-icon.png', 'vendor/leaflet/images/marker-icon-2x.png', 'vendor/leaflet/images/marker-shadow.png',
  'vendor/leaflet/images/layers.png', 'vendor/leaflet/images/layers-2x.png', 'src/app.js', 'src/version.js'];

self.addEventListener('install', (e) => {
  // the shell is saved best-effort: a missing file must never stop the new version from installing
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Same-site files: network first (fresh), saved copy only when the network fails. Other sites: not touched.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(new Request(req, { cache: 'no-cache' }));
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      return hit || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
    }
  })());
});
