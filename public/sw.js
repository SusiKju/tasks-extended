// TE-75: Service Worker für den Offline-Modus.
// Commit-SHA und Precache-Liste setzt scripts/build-sw.mjs beim Deploy ein (deploy.yml).
// Jeder Deploy ergibt dadurch einen neuen Worker mit eigenem Cache; alte Caches
// werden beim Aktivieren gelöscht.
const CACHE = 'te-__SHA__';
const PRECACHE = __PRECACHE__;
const BASE = '/tasks-extended/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Einzeln statt addAll: eine fehlende Datei soll nicht den ganzen Worker kippen.
      .then((cache) => Promise.all([BASE, ...PRECACHE].map((u) => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Nur eigene GET-Requests; Firestore, Google-APIs usw. laufen unverändert ins Netz.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE) || url.pathname.startsWith(BASE + 'kinder/')) return;
  // Versions-Check (useAutoReloadOnNewVersion) muss immer echt ins Netz.
  if (url.pathname === BASE + 'version.json') return;

  if (req.mode === 'navigate') {
    // Netz zuerst, damit eine neue Version sofort ankommt; offline die gecachte index.html.
    event.respondWith(fetch(req).catch(() => caches.match(BASE)));
    return;
  }

  // Bundles und Assets tragen einen Hash im Namen → Cache zuerst, sonst Netz + ablegen.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    })),
  );
});
