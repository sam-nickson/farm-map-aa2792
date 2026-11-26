/* Bandurrias service worker: app shell + data stale-while-revalidate, tiles cache-first, full offline download on request. */
const SHELL = 'bandurrias-shell';
const CORE = ['./', 'index.html', 'style.css', 'app.js', 'geo.js', 'i18n.js', 'vault.js', 'build.json', 'manifest.webmanifest', 'vendor/leaflet.js', 'vendor/leaflet-rotate.js', 'vendor/leaflet.css',
  'icons/icon-192.png', 'icons/icon-180.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png'];
const DATA = ['meta', 'pampas', 'pois', 'golf', 'quests', 'terrain', 'boundary', 'rivers', 'waters', 'contours_wide', 'relief', 'names', 'canopy', 'trails'];      // data/<name>.json, or .json.enc when build.json says enc:true
const ext = (b) => (b.enc ? '.enc' : '');
const tilesName = (v) => 'bandurrias-tiles-' + v;

async function getMeta() {      // build.json is public: { enc, layers, grid, tiles_v, ... }
  try { return await (await fetch('build.json', { cache: 'no-store' })).json(); } catch (_) { const hit = await caches.match('build.json'); if (hit) return hit.json(); throw _; }
}
function tileUrls(meta) {
  const out = [];
  for (const layer of meta.layers) for (const z of Object.keys(meta.grid)) { const [nx, ny] = meta.grid[z]; for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) out.push(new URL(`tiles/${layer}/${z}/${x}/${y}.webp${ext(meta)}?v=${meta.tiles_v}`, self.registration.scope).href); }
  return out;
}
async function broadcast(msg) { for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(msg); }

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const b = await getMeta(), c = await caches.open(SHELL);
    await c.addAll([...CORE, ...DATA.map((n) => `data/${n}.json${ext(b)}`), `data/relief.webp${ext(b)}`, `data/canopy_field.webp${ext(b)}`, `data/canopy_tex_a.webp${ext(b)}`, `data/canopy_tex_b.webp${ext(b)}`].map((u) => new Request(u, { cache: 'reload' })));
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const meta = await getMeta().catch(() => null);
    for (const k of await caches.keys()) if (k.startsWith('bandurrias-tiles-') && (!meta || k !== tilesName(meta.tiles_v))) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/tiles/')) {
    e.respondWith((async () => {
      const cache = await caches.open(tilesName(url.searchParams.get('v') || '0')), hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || new Response('offline', { status: 503 });
  })());
});

async function status(meta) {
  const cache = await caches.open(tilesName(meta.tiles_v)), urls = tileUrls(meta);
  const have = (await cache.keys()).length;
  return { urls, cache, done: Math.min(have, urls.length), total: urls.length };
}
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'status') e.waitUntil((async () => { const m = await getMeta(), s = await status(m); broadcast({ type: 'status', done: s.done, total: s.total }); })());
  if (d.type === 'cache-all') e.waitUntil((async () => {
    const m = await getMeta(), s = await status(m);
    const missing = []; for (const u of s.urls) if (!(await s.cache.match(u))) missing.push(u);
    let done = s.total - missing.length, i = 0;
    const worker = async () => { while (i < missing.length) { const u = missing[i++]; try { const r = await fetch(u); if (r.ok) { await s.cache.put(u, r); done++; } } catch (_) { /* offline: leave for next time */ } if (done % 25 === 0) broadcast({ type: 'progress', done, total: s.total }); } };
    await Promise.all(Array.from({ length: 4 }, worker));
    for (let pass = 0; pass < 2 && done < s.total; pass++) {      // a tile that failed once (flaky signal) gets two more tries, so the download can still finish
      const left = []; for (const u of s.urls) if (!(await s.cache.match(u))) left.push(u);
      for (const u of left) { try { const r = await fetch(u); if (r.ok) { await s.cache.put(u, r); done++; } } catch (_) { /* still offline */ } }
    }
    broadcast({ type: 'progress', done, total: s.total });
  })());
});
