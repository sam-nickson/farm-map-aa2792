/* Bandurrias farm map: Leaflet (flat CRS) over pre-rendered tile layers + interactive pampas / sites / action items / GPS. */
(function () {
  'use strict';
  var P = function (n) { if (window.__perf) window.__perf.mark(n); };      // performance-check hook (see profile.js): does nothing unless the address ends in #profile
  P('app-start');
  var STR = I18N.STR;
  var EMOJI = { waterfall: '💦', fishing: '🎣', dunny: '🚽', camp: '⛺', vista: '🔭', tower_m: '🐗', tower_n: '🐗', intake_falls: '💦', hangar: '🛩️',
    residence: '🏡', greenhouse: '🌱', orchard: '🍎', tennis: '🎾', solar: '☀️', battery: '🔋', hydro: '⚡', runway: '🛬', pond: '', hot_spring: '♨️', raft_start: '🚣' };
  var ICONS = {      // site icons for places outside the art (no sprite there): drawn here; the raft carries a small black arrow that points downstream (rotated by the site's heading and the map's turn)
    hot_spring: '<svg viewBox="0 0 48 48"><g fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"><path d="M15 21c-3-4 3-6 0-10M24 20c-3-4 3-6 0-11M33 21c-3-4 3-6 0-10"/></g><g fill="none" stroke="#9a8f86" stroke-width="1.2" stroke-linecap="round"><path d="M15 21c-3-4 3-6 0-10M24 20c-3-4 3-6 0-11M33 21c-3-4 3-6 0-10"/></g><ellipse cx="24" cy="34" rx="20" ry="10" fill="#8b7b6b" stroke="#5c4a3a" stroke-width="1.6"/><ellipse cx="24" cy="33" rx="15.5" ry="7" fill="#7fd6e8" stroke="#3a8fa8" stroke-width="1.2"/><path d="M14 33c3-2 6-2 9 0" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/><g fill="#a89887" stroke="#5c4a3a" stroke-width="1"><circle cx="7" cy="36" r="3"/><circle cx="12" cy="42" r="3.2"/><circle cx="24" cy="44" r="3"/><circle cx="37" cy="42" r="3.2"/><circle cx="42" cy="35" r="3"/></g></svg>',
    raft: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#7fd6e8" stroke="#3a8fa8" stroke-width="1.5"/><path d="M6 14c4-3 7 3 11 0s7 3 11 0 7 3 11 0M6 36c4-3 7 3 11 0s7 3 11 0 7 3 11 0" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/><g transform="rotate(-20 24 24)"><rect x="14" y="7" width="20" height="34" rx="10" fill="{gold}" stroke="#7a4a12" stroke-width="2"/><rect x="19" y="12" width="10" height="24" rx="5" fill="{cream}" stroke="#7a4a12" stroke-width="1.2"/><g fill="#6e4524" stroke="#fff" stroke-width="1"><circle cx="19" cy="17" r="3.2"/><circle cx="29" cy="17" r="3.2"/><circle cx="19" cy="29" r="3.2"/><circle cx="29" cy="29" r="3.2"/></g><path d="M9 14l8 6M39 14l-8 6" stroke="#6e4524" stroke-width="2" stroke-linecap="round"/></g><g class="raft-dir" transform="translate(37 37) rotate({heading}) scale(.7)"><path d="M0-6l4.6 5.4h-2.8v6.6h-3.6v-6.6h-2.8z" fill="#000" stroke="#fff" stroke-width=".9" stroke-linejoin="round"/></g></svg>' };
  var $ = function (id) { return document.getElementById(id); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('bandurrias.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('bandurrias.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  var state = {
    lang: store.get('lang', (navigator.language || 'en').slice(0, 2) === 'es' ? 'es' : 'en'),
    mode: 'existing',      // always opens in Existing (the language choice is the only remembered preference besides layer toggles)
    tilt: null,      // property view: 'tilted' (always the better tilt), 'auto' (tilt only if it helps enough) or 'north' (north up); the default comes from config.json
    layers: Object.assign({ quests: true }, store.get('layers3', {})),      // action areas are ON by default (layers3: the old key held the earlier default 'off')
    trails: { pampa: false, property: true },      // Gaia trail per view (like the terrain): on in the property view, off in the pampa view; the 🥾 button toggles the current view
    terrain: { pampa: false, property: true },      // terrain (lines; + height tint in the pampa view) per view: off in the pampa view, on in the property view; the mountain button toggles the current view's
    view: null
  };
  var clamping = false, cfg, trailData, canopyInfo, canopyLayer, placeNames, reliefInfo, reliefLayer, underRenderer, meta, pampas, pois, golf, quests, terrain, boundary, rivers, waters, wideContours, bbounds, closeFitZoom, zoneBounds, transitioning = false, transTimer, lastPortrait, G, map, tiles = {}, groups = {}, badgeMarkers = {}, tintRenderer, pampaPolys = {}, questPolys = {}, sitePills = [], gps = null;

  var t = function (k) { return STR[state.lang][k] || STR.en[k] || k; };
  var nm = function (o) { return I18N.pick(o, state.lang); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function load() {
    P('data-request');
    return Promise.all(['meta', 'pampas', 'pois', 'golf', 'quests', 'terrain', 'boundary', 'rivers', 'waters', 'contours_wide', 'relief', 'names', 'canopy', 'trails', 'config'].map(function (n) { return Vault.json('data/' + n + '.json'); })).then(function (d) {
      meta = d[0]; pampas = d[1]; pois = d[2]; golf = d[3]; quests = d[4]; terrain = d[5]; boundary = d[6]; rivers = d[7]; waters = d[8]; wideContours = d[9]; reliefInfo = d[10]; placeNames = d[11]; canopyInfo = d[12]; trailData = d[13]; cfg = d[14]; state.tilt = cfg.tilt.default;
      P('data-loaded'); init(); P('init-done');
    }).catch(loadError);
  }
  /* ---------- lock screen: show/hide passphrase + attempt limit ----------
     Limit: MAX_TRIES wrong attempts in a row lock the form on THIS device for LOCK_HOURS. It stops casual guessing at the lock screen only; it cannot stop someone who
     downloads the encrypted files and tries passphrases offline (the passphrase strength does that), and clearing the site data resets it. */
  var MAX_TRIES = window.__MAX_TRIES || 10, LOCK_MS = (window.__LOCK_HOURS || 168) * 3600 * 1000;
  function lockState() { var l = store.get('lock', { n: 0, until: 0 }); return { n: l.n || 0, until: l.until || 0 }; }
  function fmtWait(ms) {
    var m = Math.ceil(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24); m = m % 60; h = h % 24;
    if (d) return d + ' ' + t('days') + (h ? ' ' + h + ' h' : '');
    return h ? (h + ' h' + (m ? ' ' + m + ' min' : '')) : m + ' min';
  }
  function lockText() {
    $('lock-hint').textContent = t('lock_hint'); $('lock-btn').textContent = t('lock_btn'); $('lock-pass').placeholder = t('lock_pass'); $('lock-lang').textContent = t('lang');
    $('lock-eye').textContent = $('lock-pass').type === 'password' ? t('lock_show') : t('lock_hide');
    paintLock();
  }
  function paintLock() {      // message + enabled state from the stored attempt counter
    var l = lockState(), now = Date.now(), msg = $('lock-msg'), locked = l.until > now;
    $('lock-btn').disabled = locked; $('lock-pass').disabled = locked;
    if (locked) msg.textContent = t('lock_locked').replace('{t}', fmtWait(l.until - now));
    else if (l.n > 0) msg.textContent = t('lock_wrong') + ' · ' + t('lock_left').replace('{n}', MAX_TRIES - l.n);
    else msg.textContent = '';
  }
  function showLock() {
    var el = $('lock'); el.hidden = false; lockText(); if (!$('lock-pass').disabled) $('lock-pass').focus();
    $('lock-lang').onclick = function () { state.lang = state.lang === 'en' ? 'es' : 'en'; store.set('lang', state.lang); lockText(); };
    $('lock-eye').onclick = function () { var p = $('lock-pass'); p.type = p.type === 'password' ? 'text' : 'password'; $('lock-eye').setAttribute('aria-pressed', p.type === 'text'); lockText(); p.focus(); };
    setInterval(function () { if (!el.hidden) { var l = lockState(); if (l.until && l.until <= Date.now()) { store.set('lock', { n: 0, until: 0 }); } paintLock(); } }, 30000);
    $('lock-form').onsubmit = function (ev) {
      ev.preventDefault();
      var l = lockState(); if (l.until > Date.now()) { paintLock(); return; }
      if (l.until) { l = { n: 0, until: 0 }; store.set('lock', l); }      // a finished lock-out gives a fresh set of attempts
      var v = $('lock-pass').value; if (!v) return;
      $('lock-msg').textContent = t('lock_working'); $('lock-btn').disabled = true;
      var fail = function () {
        var cur = lockState(); cur.n += 1; if (cur.n >= MAX_TRIES) cur.until = Date.now() + LOCK_MS;
        store.set('lock', cur); $('lock-pass').disabled = false; $('lock-btn').disabled = false; paintLock(); if (!cur.until) $('lock-pass').select();
      };
      P('unlock-submitted');
      Vault.unlock(v).then(function (ok) {
        if (ok) { P('unlocked'); store.set('lock', { n: 0, until: 0 }); el.hidden = true; $('lock-pass').value = ''; $('lock-pass').type = 'password'; load(); } else fail();
      }).catch(fail);
    };
  }
  Vault.init().then(function (st) { if (st === 'locked') showLock(); else load(); }).catch(loadError);
  function loadError(e) {
    toast(location.protocol === 'file:' ? 'Open this through a web server (http://localhost:8000), not as a file.' : 'Could not load map data: ' + e.message, 8000);
  }

  /* ---------- map ---------- */
  function init() {
    G = Geo.make(meta);
    var b = G.bounds();
    map = L.map('map', { crs: L.CRS.Simple, zoomControl: false, attributionControl: false, zoomSnap: cfg.zoom_snap, zoomDelta: 0.5, wheelPxPerZoomLevel: 90,
      maxZoom: meta.zmax + 1, inertia: true, bounceAtZoomLimits: false, tap: true,
      rotate: true, bearing: 0, touchRotate: false, shiftKeyRotate: false, rotateControl: false });      // rotation (leaflet-rotate) is driven by the app only: the property view tilts to fit the screen
    var fit = map.getBoundsZoom(b, false); closeFitZoom = fit;
    bbounds = L.latLngBounds(pathLL(boundary.ring));      // the whole property
    var zn = boundary.zone;      // coverage zone = everything the default property view can show on any supported screen, plus a margin (computed in export_data.py)
    zoneBounds = L.latLngBounds(G.m2ll(zn[0], zn[1]), G.m2ll(zn[2], zn[3]));
    updateMinZoom();
    map.fitBounds(b);
    var TileLayer = Vault.enc ? VaultTileLayer() : L.TileLayer;      // encrypted builds fetch .enc tiles and decrypt them in the browser
    meta.layers.forEach(function (n) {      // one opaque tile set per mode (bare | existing | prospective)
      tiles[n] = new TileLayer('tiles/' + n + '/{z}/{x}/{y}.webp' + (Vault.enc ? '.enc' : '') + '?v=' + meta.tiles_v, { tileSize: meta.tile, minNativeZoom: 0, maxNativeZoom: meta.zmax - (L.Browser.retina ? 1 : 0), detectRetina: true,
        bounds: b, noWrap: true, keepBuffer: 4, className: 'tile-base' });      // retina screens load the next zoom level's tiles (half-size) for crisp art
      tiles[n].options.minZoom = -10;      // draw (scaled down from the z0 tile) at every zoom: the default minZoom 0 made the art vanish in the property view; must be set AFTER construction because detectRetina resets it to >= 0
      tiles[n].on('tileloadstart', function (e) { var s = tiles[n].getTileSize(); e.tile.style.width = (s.x + 1) + 'px'; e.tile.style.height = (s.y + 1) + 'px'; });      // 1px overlap hides sub-pixel seams
      tiles[n].on('add', function () { tiles[n].__ready = false; });          // a (re)added set is not ready until its tiles have loaded
      tiles[n].on('load', function () { tiles[n].__ready = true; P('first-art-tiles'); settleTiles(false); });
    });
    map.createPane('tint'); map.getPane('tint').style.zIndex = 250; map.getPane('tint').style.pointerEvents = 'none';      // blended with the tiles in CSS (mix-blend-mode: color) so map detail shows through
    tintRenderer = L.svg({ pane: 'tint' });
    map.createPane('under', map._rotatePane); map.getPane('under').style.zIndex = 150; map.getPane('under').style.pointerEvents = 'none';      // below the art (tile pane 200): rivers / lakes / contours outside the frame show through the art's soft edge and never draw over it
    underRenderer = L.svg({ pane: 'under' });
    map.createPane('sprites', map._rotatePane); map.getPane('sprites').style.zIndex = 410; map.getPane('sprites').style.pointerEvents = 'none';      // drawn icons of sites outside the art: like the art's sprites they sit in front of the footpaths and rivers; inside the rotating pane, so they turn with the map
    map.createPane('relief', map._rotatePane); map.getPane('relief').style.zIndex = 140; map.getPane('relief').style.pointerEvents = 'none';      // soft hillshade of the whole zone, below everything else (the art, rivers, contours)
    map.createPane('canopy', map._rotatePane); map.getPane('canopy').style.zIndex = 130; map.getPane('canopy').style.pointerEvents = 'none';      // forest cover for the rest of the property: below the relief shading (140), the rivers / contours (150) and the art (200)
    buildRelief(); buildCanopy();
    ['boundary', 'zone', 'waters', 'watersIn', 'wideContours', 'wideContoursIn', 'wideContoursMid', 'wideLabelsMid', 'wideLabels', 'names', 'tint', 'contourMajor', 'contourMinor', 'contourLabels', 'pampas', 'golf', 'sites', 'badges', 'quests', 'footpaths', 'trails', 'gps'].forEach(function (n) { groups[n] = L.layerGroup().addTo(map); });
    buildBoundary(); buildWaters(); buildNames(); buildFootpaths(); buildTrails(); buildTerrain(); buildPampas(); buildGolf(); buildSites(); buildQuests();
    var farZoom = fit + 0.9;
    var minorZoom = fit + 0.6;      // 10 m contour lines appear from a normal working zoom (only if the terrain-lines layer is on)
    var zoomClass = function () { map.getContainer().classList.toggle('far', map.getZoom() < farZoom); applyMinorContours(map.getZoom() >= minorZoom); };
    map.on('zoomend', zoomClass); zoomClass();
    map.on('zoom', updateScale); updateScale();
    map.on('move zoom', clampToZone); map.on('moveend zoomend', function () { updateMinZoom(); }); map.on('zoomend', updateView); map.on('zoomend', restyleWaters); map.on('zoomend', restyleFootpaths); map.on('zoomend', sizeHits); map.on('resize', onResize); lastPortrait = map.getSize().y >= map.getSize().x; updateView();
    map.on('rotate', function () { var br = map.getBearing(), sv = document.querySelector('#compass svg'); if (sv) sv.style.transform = 'rotate(' + br + 'deg)'; });      // the needle keeps pointing at true north
    buildMiniMap(); map.on('move zoom', updateMiniMap);
    map.on('click', function () { closeSheet(); });
    wireUI();
    applyLang(); applyMode(); applyLayers();
    openFromHash();
    registerSW();
    window.__app = { cfg: function () { return cfg; }, tileLayers: function () { return tiles; }, ppm: pxPerMetre, trails: function () { return trailData; }, footpaths: function () { return footpathLayers; }, canopy: function () { return canopyLayer; }, canopyInfo: function () { return canopyInfo; }, terrainData: function () { return terrain; }, names: function () { return placeNames; }, reliefInfo: function () { return reliefInfo; }, under: function () { return underRenderer; }, contoursWide: function () { return wideContours; }, waters: function () { return waters; }, chooseBearing: chooseBearing, fitFor: fitFor, tiltAngles: tiltAngles, isTransitioning: function () { return transitioning; }, sites: function () { return pois; }, golf: function () { return golf; }, boundary: boundary, bbounds: bbounds, terrain: terrain, map: map, G: G, state: state, meta: meta };       // for tests / debugging
  }

  function VaultTileLayer() {
    return L.TileLayer.extend({
      createTile: function (coords, done) {
        var tile = document.createElement('img'); tile.alt = ''; tile.setAttribute('role', 'presentation');
        tile.onerror = L.bind(this._tileOnError, this, done, tile);
        Vault.blobURL(this.getTileUrl(coords)).then(function (u) { tile.onload = function () { URL.revokeObjectURL(u); L.bind(this._tileOnLoad, this, done, tile)(); }.bind(this); tile.src = u; }.bind(this)).catch(function (e) { done(e, tile); });
        return tile;
      }
    });
  }

  function pathLL(pts) { return pts.map(function (c) { return G.m2ll(c[0], c[1]); }); }      // [[x, y] metres, ...] -> Leaflet lat/lngs
  function polyLatLngs(polys) {
    return polys.map(function (rings) { return rings.map(pathLL); });
  }

  function buildPampas() {
    Object.keys(pampas).forEach(function (k) {
      var p = pampas[k];
      var poly = L.polygon(polyLatLngs(p.polygon), { stroke: false, fillColor: cfg.colours.pampa_highlight, fillOpacity: 0.001, interactive: true }).addTo(groups.pampas);
      poly.on('click', function (e) { L.DomEvent.stopPropagation(e); selectPampa(k); });
      pampaPolys[k] = poly;
      var m = L.marker(G.m2ll(p.label[0], p.label[1]), { icon: L.divIcon({ className: '', html: '<div class="badge-m">' + k + '</div>', iconSize: [26, 26], iconAnchor: [13, 13] }), keyboard: false, zIndexOffset: 600 })      // badges stay above quest markers
        .on('click', function (e) { L.DomEvent.stopPropagation(e); selectPampa(k); }).addTo(groups.badges);
      badgeMarkers[k] = m;
    });
  }

  function buildGolf() {
    golf.holes.forEach(function (h) {
      var ll = [G.m2ll(h.tee[0], h.tee[1]), G.m2ll(h.green[0], h.green[1])];
      L.polyline(ll, { color: '#fff', opacity: 0.001, weight: 18, className: 'golf-hit', interactive: true }).addTo(groups.golf)
        .on('click', function (e) { L.DomEvent.stopPropagation(e); showView({ type: 'hole', id: h.n }); });
    });
  }

  function buildSites() {
    sitePills = [];
    pois.forEach(function (p) {
      var grp = L.layerGroup();
      var kind = p.kind === 'label' ? 'label' : p.layer;
      var pill = L.marker(G.m2ll(p.x, p.y), { icon: pillIcon(p, kind), keyboard: false, interactive: false });
      grp.addLayer(pill);
      if (p.icon && ICONS[p.icon]) grp.addLayer(spriteOverlay(p));      // sites outside the art: the icon is drawn on the map itself (scales, turns and moves with it like the art's sprites)
      if (p.kind !== 'label') {
        var d = 2 * hitRadius(p), hit = L.marker(G.m2ll(hitOf(p)[0], hitOf(p)[1]), { icon: L.divIcon({ className: 'site-hit', iconSize: [d, d], iconAnchor: [d / 2, d / 2] }), zIndexOffset: 10000 - Math.round(hitOf(p)[2]), keyboard: false });      // an invisible round tap area as big as the sprite it covers (p.hit = centre + radius in metres, measured when the art is drawn); a marker, so it is in front of the letter badges and bubbles; smaller areas above bigger ones
        hit.on('click', function (e) { L.DomEvent.stopPropagation(e); showView({ type: 'site', id: p.id }); });
        grp.addLayer(hit);
      }
      sitePills.push({ poi: p, pill: pill, grp: grp, kind: kind, hit: hit });
    });
  }
  function hitOf(p) { return p.hit || [p.x, p.y + 6, 0]; }      // sites without a measured sprite (runway, pond) keep a small round area
  function hitRadius(p) { return Math.max(12, hitOf(p)[2] * pxPerMetre()); }
  function sizeHits() {      // tap areas follow the zoom (sprite size, never smaller than 12 px)
    if (!map || !sitePills) return;
    sitePills.forEach(function (s) { if (s.hit && s.hit._icon) { var hd = 2 * hitRadius(s.poi), hs = s.hit._icon.style; hs.width = hs.height = hd + 'px'; hs.marginLeft = hs.marginTop = -hd / 2 + 'px'; } });
  }
  function spriteOverlay(p) {      // an SVG image over cfg.site_icon_m metres, in the 'sprites' pane (in front of the vector layers, behind the markers); Leaflet zooms it with the map, so it never lags behind the background
    var svg = ICONS[p.icon].replace('{cream}', cfg.colours.cream).replace('{gold}', cfg.colours.pampa_highlight).replace('{heading}', p.heading || 0), h = cfg.site_icon_m / 2;
    var el = new DOMParser().parseFromString(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '), 'image/svg+xml').documentElement;
    return L.svgOverlay(el, [G.m2ll(p.x - h, p.y - h), G.m2ll(p.x + h, p.y + h)], { pane: 'sprites', interactive: false });
  }
  function pillIcon(p, kind) {
    var e = EMOJI[p.id] ? EMOJI[p.id] + ' ' : '';
    return L.divIcon({ className: 'pill ' + kind, html: '<span>' + e + esc(nm(p.name)) + '</span>', iconSize: [0, 0] });
  }

  function buildQuests() {
    quests.forEach(function (q) {
      var col = { now: '#d9482f', next: '#f08c00', later: '#8a8a8a' }[q.priority];      // area colour follows priority: now red, next orange, later grey
      var poly = L.polygon(polyLatLngs(q.polygon), { stroke: true, color: col, weight: 3, fillColor: col, fillOpacity: 0.22, className: 'quest-poly', interactive: true }).addTo(groups.quests);
      poly.on('click', function (e) { L.DomEvent.stopPropagation(e); selectQuest(q.id); });
      questPolys[q.id] = poly;
      L.marker(G.m2ll(q.centroid[0], q.centroid[1]), { icon: L.divIcon({ className: '', html: '<div class="q-bubble ' + (q.status === 'done' ? 'done' : q.priority) + '">' + (q.status === 'done' ? '✓' : '!') + '</div>', iconSize: [34, 34], iconAnchor: [17, 46] }), keyboard: false })
        .on('click', function (e) { L.DomEvent.stopPropagation(e); selectQuest(q.id); }).addTo(groups.quests);
    });
    var open = quests.filter(function (q) { return q.status !== 'done'; }).length;
    $('quest-count').textContent = open ? String(open) : '';
  }


  /* ---------- terrain: height tint on the pampas + contours + legend ---------- */
  var RAMP = [[0, [52, 160, 118]], [0.5, [185, 224, 106]], [1, [255, 241, 168]]];      // low = cool sea-green (not river cyan), mid = green, high = sunlit yellow
  function rampRGB(t) {
    t = Math.max(0, Math.min(1, t));
    for (var i = 1; i < RAMP.length; i++) if (t <= RAMP[i][0]) { var a = RAMP[i - 1], b = RAMP[i], f = (t - a[0]) / (b[0] - a[0]); return [0, 1, 2].map(function (k) { return Math.round(a[1][k] + (b[1][k] - a[1][k]) * f); }); }
    return RAMP[RAMP.length - 1][1];
  }
  function rampCSS(t) { return 'rgb(' + rampRGB(t).join(',') + ')'; }
  function tFor(z) { return (z - terrain.range[0]) / (terrain.range[1] - terrain.range[0]); }
  /* ---------- property view: rivers + lakes (reconciled set) and 50 m / 100 m contours across the coverage zone ---------- */
  var RIVER_PX = { major: 8, river: 4.2 }, RIVER_M = { major: 14, river: 6 }, waterLayers = [];      // Rio Blanco clearly bigger; every other river the same width. px minimums at the property zoom, real metres when zoomed in (so they meet the art's rivers)
  function waterWeights(cls) { var ppm = pxPerMetre(), core = Math.max(RIVER_PX[cls], RIVER_M[cls] * ppm); return { core: core, bank: core + Math.max(3, 7 * ppm), hl: Math.max(1.1, core * 0.13) }; }
  function trimPts(pts, t0, t1) {      // pts [[x,y]...] in metres, cut t0 from the start and t1 from the end (never more than 40% of the length in all)
    var len = 0, i; for (i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    var k = Math.min(1, 0.4 * len / Math.max(1e-6, t0 + t1)); t0 *= k; t1 *= k;
    function cut(arr, d) {      // drop d metres from the start of arr
      arr = arr.slice();
      while (arr.length > 2 && d > 0) { var seg = Math.hypot(arr[1][0] - arr[0][0], arr[1][1] - arr[0][1]); if (seg > d) break; d -= seg; arr.shift(); }
      var sg = Math.hypot(arr[1][0] - arr[0][0], arr[1][1] - arr[0][1]); if (d > 0 && sg > d) arr[0] = [arr[0][0] + (arr[1][0] - arr[0][0]) * d / sg, arr[0][1] + (arr[1][1] - arr[0][1]) * d / sg];
      return arr;
    }
    return cut(cut(pts, t0).reverse(), t1).reverse();
  }
  function restyleWaters() {
    if (!map) return;
    var ppm = pxPerMetre();
    waterLayers.forEach(function (o) {
      var w = waterWeights(o.cls);
      if (o.dot) { o.l.setRadius(w[o.part] / 2); return; }
      o.l.setStyle({ weight: w[o.part] });
      if (o.part === 'bank' && (o.r.j[0] || o.r.j[1])) {      // at a junction the tan border stops where the other river's blue begins (half a river width from its centre line)
        var tm = (w.core / 2 + 1) / ppm;
        o.l.setLatLngs(pathLL(trimPts(o.r.pts, o.r.j[0] ? tm : 0, o.r.j[1] ? tm : 0)));
      }
    });
  }
  function buildWaters() {
    var ll = pathLL;
    waters.tarns.forEach(function (t2) { L.polygon(ll(t2.pts), { fillColor: cfg.colours.lake, fillOpacity: 1, color: cfg.colours.river_bank, weight: 2.5, className: 'tarn', interactive: false, renderer: underRenderer }).addTo(groups.waters); });
    ['bank', 'core', 'hl'].forEach(function (part) {      // all banks first, then all cores, then the pale centre dashes (as in the art's rivers), so rivers join cleanly where they meet
      waters.rivers.forEach(function (r) {
        var joined = r.j && (r.j[0] || r.j[1]), grp = r.f ? groups.watersIn : groups.waters, rend = r.f ? undefined : underRenderer, col = part === 'bank' ? cfg.colours.river_bank : part === 'core' ? cfg.colours.river_core : cfg.colours.river_hl_app;
        var l = L.polyline(ll(r.pts), { color: col, weight: waterWeights(r.cls)[part], opacity: part === 'hl' ? 0.85 : 1, lineCap: part === 'hl' || joined ? 'butt' : 'round', lineJoin: 'round', dashArray: part === 'hl' ? '10 14' : null, className: 'river-' + part + (r.cls === 'major' ? ' river-major' : ''), interactive: false, renderer: rend }).addTo(grp);      // f=0: outside the close-up frame (both views); f=1: inside it (user-drawn rivers the art does not have; both views)
        waterLayers.push({ l: l, cls: r.cls, part: part, r: r });
        if (joined && part !== 'hl') [0, 1].forEach(function (k) {      // flat ends where it joins another river; round caps only on the free ends
          if (r.j[k]) return;
          var c = r.pts[k ? r.pts.length - 1 : 0], d = L.circleMarker(G.m2ll(c[0], c[1]), { radius: waterWeights(r.cls)[part] / 2, stroke: false, fill: true, fillColor: col, fillOpacity: 1, interactive: false, renderer: rend, className: 'river-' + part + '-dot' }).addTo(grp);
          waterLayers.push({ l: d, cls: r.cls, part: part, dot: true });
        });
      });
    });
    restyleWaters();
    wideContours.levels.forEach(function (lv) {
      var major = lv.z % wideContours.major === 0;
      var style = { color: cfg.colours.wide_contour, weight: major ? 1.3 : 0.7, opacity: major ? 0.75 : 0.4, interactive: false }, ll = pathLL;
      lv.lines.forEach(function (ln) { L.polyline(ll(ln), L.extend({ renderer: underRenderer, className: 'wide-contour' + (major ? ' wide-major' : '') }, style)).addTo(groups.wideContours); });      // outside the close-up frame: under the art
      (lv.lines_mid || []).forEach(function (ln) { L.polyline(ll(ln), L.extend({ renderer: underRenderer, className: 'wide-contour wide-contour-mid' + (major ? ' wide-major' : '') }, style)).addTo(groups.wideContoursMid); });      // around the close-up frame: only where the pampa view has no fine contours of its own (property view)
      (lv.labels_mid || []).forEach(function (p) { L.marker(G.m2ll(p[0], p[1]), { icon: L.divIcon({ className: 'wide-contour-label', html: '<span>' + lv.z + ' m</span>', iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(groups.wideLabelsMid); });
      (lv.lines_in || []).forEach(function (ln) { L.polyline(ll(ln), L.extend({ className: 'wide-contour wide-contour-in' + (major ? ' wide-major' : '') }, style)).addTo(groups.wideContoursIn); });      // inside it: over the art, property view only (same surface as the close-up contours, so they continue each other)
      (lv.labels || []).forEach(function (p) { L.marker(G.m2ll(p[0], p[1]), { icon: L.divIcon({ className: 'wide-contour-label', html: '<span>' + lv.z + ' m</span>', iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(groups.wideLabels); });
    });
  }
  function buildBoundary() {
    var ll = pathLL(boundary.ring);
    L.polygon(ll, { fill: false, color: cfg.colours.cream, weight: 4, opacity: 0.85, interactive: false }).addTo(groups.boundary);                          // cream halo so the line reads on every background
    L.polygon(ll, { fill: false, color: cfg.colours.boundary, weight: 1.5, opacity: 1, dashArray: '8 6', className: 'boundary-line', interactive: false }).addTo(groups.boundary);
    // the edge of the mapped coverage zone: a firm thin line in both views (scrolling past it is not possible, see clampToZone)
    L.rectangle(zoneBounds, { fill: false, color: cfg.colours.zone_line, weight: 2, opacity: 0.9, className: 'zone-line', interactive: false }).addTo(groups.zone);
  }
  function insideProperty(x, y) {      // ray casting on the outline (map metres)
    var r = boundary.ring, inside = false;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
      if (((r[i][1] > y) !== (r[j][1] > y)) && (x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0])) inside = !inside;
    }
    return inside;
  }
  function buildTerrain() {
    Object.keys(pampas).forEach(function (k) {
      L.polygon(polyLatLngs(pampas[k].polygon), { stroke: false, fillColor: rampCSS(tFor(pampas[k].elev.mean)), fillOpacity: 0.85, interactive: false, renderer: tintRenderer }).addTo(groups.tint);
    });
    var line = function (lines, style, grp) { lines.forEach(function (l) { L.polyline(pathLL(l), style).addTo(grp); }); };
    terrain.major.forEach(function (m) {
      line(m.lines, { color: cfg.colours.ink, weight: 1.6, opacity: 0.55, interactive: false }, groups.contourMajor);
      (m.labels || []).forEach(function (p) { L.marker(G.m2ll(p[0], p[1]), { icon: L.divIcon({ className: 'contour-label', html: '<span>' + m.z + ' m</span>', iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(groups.contourLabels); });
    });
    terrain.minor.forEach(function (m) { line(m.lines, { color: cfg.colours.ink, weight: 0.8, opacity: 0.4, interactive: false }, groups.contourMinor); });
  }
  var minorWanted = false;
  function curView() { return map.getContainer().classList.contains('wide') ? 'property' : 'pampa'; }
  function applyMinorContours(wanted) { minorWanted = wanted; if (!map) return; if (wanted && state.terrain.pampa && curView() === 'pampa') groups.contourMinor.addTo(map); else map.removeLayer(groups.contourMinor); }
  function applyTerrain() {
    var v = curView(), on = state.terrain[v], pampaOn = on && v === 'pampa';
    ['tint', 'contourMajor', 'contourLabels'].forEach(function (n) { if (pampaOn) groups[n].addTo(map); else map.removeLayer(groups[n]); });      // pampa view: close-up contours + height tint + legend
    ['wideContours', 'wideLabels'].forEach(function (n) { if (on) groups[n].addTo(map); else map.removeLayer(groups[n]); });
    ['wideContoursIn', 'wideContoursMid', 'wideLabelsMid'].forEach(function (n) { if (on && v === 'property') groups[n].addTo(map); else map.removeLayer(groups[n]); });      // across the pampa area too in the property view; the pampa view shows the close-up contours there                        // 50 / 100 m contours across the zone (outside the close-up frame) in either view when terrain is on
    applyMinorContours(minorWanted);
    $('btn-terrain').classList.toggle('on', on);
    groups.waters.addTo(map);      // rivers and lakes outside the close-up frame: always, in both views, no toggle
    groups.watersIn.addTo(map);      // the user-drawn rivers' parts inside the frame (the art does not draw them) in both views, so they connect with the outside rivers
  }
  function elevText(elev, rel) {      // 'N m above/below the average cleared ground (248 m)'
    var d = Math.round(elev - terrain.cleared_mean), ad = Math.abs(d), nb = '\u00a0', avg = ' (' + terrain.cleared_mean + nb + t('m') + ')';
    if (ad < 3) return t('about_same') + avg;
    return ad + nb + t('m') + ' ' + t(d > 0 ? 'above_avg' : 'below_avg') + avg;
  }

  /* ---------- compass (north is always up) + scale bar ---------- */
  var SCALE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  function pxPerMetre() { return meta.px_per_m * Math.pow(2, map.getZoom() - meta.zmax); }
  function updateScale() {
    if (!map) return;
    var ppm = pxPerMetre(), maxPx = 110, best = SCALE_STEPS[0];
    SCALE_STEPS.forEach(function (m) { if (m * ppm <= maxPx) best = m; });
    $('scale-bar').style.width = Math.round(best * ppm) + 'px';
    $('scale-label').textContent = best >= 1000 ? (best / 1000) + ' km' : best + ' ' + t('m');
  }

  /* ---------- mini-map: the whole property outline with a box showing the current view (orientation only) ---------- */
  var MM = null;
  function buildMiniMap() {
    var bd = boundary.bounds, pad = 300, W = 120, H = 90;      // a little context around the property so nearby rivers show
    var w = bd[2] - bd[0] + 2 * pad, h = bd[3] - bd[1] + 2 * pad;
    if (w / h < W / H) w = h * W / H; else h = w * H / W;
    var cx = (bd[0] + bd[2]) / 2, cy = (bd[1] + bd[3]) / 2, k = W / w;
    var X = function (x) { return W / 2 + (x - cx) * k; }, Y = function (y) { return H / 2 - (y - cy) * k; };
    MM = { X: X, Y: Y, W: W, H: H };
    var pts = function (ring) { return ring.map(function (c) { return X(c[0]).toFixed(1) + ',' + Y(c[1]).toFixed(1); }).join(' '); };
    ['mm-prop', 'mm-rim', 'mm-line'].forEach(function (id) { $(id).setAttribute('points', pts(boundary.ring)); });
    var ns = 'http://www.w3.org/2000/svg';
    rivers.lines.forEach(function (r) { var l = document.createElementNS(ns, 'polyline'); l.setAttribute('points', pts(r.pts)); l.setAttribute('stroke-width', r.kind === 'river' ? 1.1 : 0.6); $('mm-rivers').appendChild(l); });
    Object.keys(pampas).forEach(function (k2) { pampas[k2].polygon.forEach(function (rings) { var g = document.createElementNS(ns, 'polygon'); g.setAttribute('points', pts(rings[0])); $('mm-patches').appendChild(g); }); });
    updateMiniMap();
  }
  function updateMiniMap() {
    if (!MM) return;
    var b = map.getBounds(), sw = G.ll2m(b.getSouth(), b.getWest()), ne = G.ll2m(b.getNorth(), b.getEast());
    var x0 = Math.max(0, MM.X(sw[0])), x1 = Math.min(MM.W, MM.X(ne[0])), y0 = Math.max(0, MM.Y(ne[1])), y1 = Math.min(MM.H, MM.Y(sw[1]));
    var v = $('mm-view'); v.setAttribute('x', x0); v.setAttribute('y', y0); v.setAttribute('width', Math.max(2, x1 - x0)); v.setAttribute('height', Math.max(2, y1 - y0));
  }

  function buildNames() {      // property-view labels: rivers, summits, the owner's own names; both languages are in the markup, CSS shows the current one
    placeNames.places.forEach(function (p) {
      var ele = p.ele ? '<b>\u25B2 ' + p.ele.toLocaleString('en-US') + ' m</b>' : '', name = p.en || p.es ? '<i class="en">' + esc(p.en) + '</i><i class="es">' + esc(p.es) + '</i>' : '';
      L.marker(G.m2ll(p.x, p.y), { icon: L.divIcon({ className: 'place-label place-' + p.kind, html: '<span>' + name + ele + '</span>', iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(groups.names);
    });
  }

  /* ---------- forest cover across the property (canvas layer: tree texture masked by a low-res field; see build_canopy.py) ---------- */
  function buildCanopy() {
    var ci = canopyInfo, base = 'data/canopy_', ext = '.webp' + (Vault.enc ? '.enc' : '');
    var img = function (n) {      // decoded in the browser when the build is encrypted
      return (Vault.enc ? Vault.blobURL(base + n + ext) : Promise.resolve(base + n + ext)).then(function (u) { return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = u; }); });
    };
    Promise.all([img('field'), img('tex_a'), img('tex_b')]).then(function (im) {
      var fw = im[0].naturalWidth, fh = im[0].naturalHeight, c = document.createElement('canvas'); c.width = fw; c.height = fh;
      var cx = c.getContext('2d'); cx.drawImage(im[0], 0, 0); var src = cx.getImageData(0, 0, fw, fh).data;
      var mask = function (fn) { var m = document.createElement('canvas'); m.width = fw; m.height = fh; var mc = m.getContext('2d'), id = mc.createImageData(fw, fh), d = id.data; for (var k = 0, n = fw * fh; k < n; k++) d[k * 4 + 3] = fn(src[k * 4], src[k * 4 + 1], src[k * 4 + 2], k); mc.putImageData(id, 0, 0); return m; };
      var bl = ci.blend, fr = ci.frame, nearW = new Float32Array(fw * fh);      // closeness to the close-up frame: 1 at its edge (and inside), 0 beyond bl.dist metres
      for (var yy = 0; yy < fh; yy++) { var Ym = ci.bounds[3] - (yy + 0.5) * ci.step, dy = Math.max(fr[1] - Ym, Ym - fr[3], 0); for (var xx = 0; xx < fw; xx++) { var Xm = ci.bounds[0] + (xx + 0.5) * ci.step, dx = Math.max(fr[0] - Xm, Xm - fr[2], 0), q = 1 - Math.hypot(dx, dy) / bl.dist; q = q < 0 ? 0 : q > 1 ? 1 : q; nearW[yy * fw + xx] = q * q * (3 - 2 * q); } }
      var masks = { near: mask(function (r, g, b, k) { return 255 * nearW[k]; }),
        wash: mask(function (r, g, b, k) { var w = nearW[k], f = Math.min(1, r / 120); return Math.min(255, r + (242 - r) * bl.boost * w * f * f * (3 - 2 * f)); }), mix: mask(function (r, g, b) { return b; }), reno: mask(function (r, g) { return g; }), keep: mask(function (r, g) { return 255 - 0.35 * g; }) };      // alpha-only canvases made once
      var tex = [im[1], im[2]], per = ci.periods, b = ci.bounds, st = ci.step, WASH = 'rgb(' + ci.wash.join(',') + ')', LIME = 'rgb(' + ci.lime.join(',') + ')';
      var smooth = function (k) { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
      var Layer = L.GridLayer.extend({
        createTile: function (co) {
          P('canopy-first-tile');
          var dpr = Math.min(2, window.devicePixelRatio || 1), T = 256, cv = document.createElement('canvas'); cv.width = cv.height = T * dpr; cv.style.width = cv.style.height = T + 'px';
          var mt = 256 * Math.pow(2, meta.zmax - co.z) / meta.px_per_m, X0 = meta.x0 + co.x * mt, Y0 = meta.y1 - co.y * mt;      // metres of the tile's top-left corner, and metres per tile
          if (X0 > b[2] || X0 + mt < b[0] || Y0 < b[1] || Y0 - mt > b[3]) return cv;      // wholly outside the field
          var ppm = cv.width / mt, tw = smooth((ppm / dpr - 0.12) / 0.45), ctx = cv.getContext('2d');      // texture weight: plain wash far out, full texture from ~0.6 px/m (it would shimmer)
          var layer = function (fn) { var c2 = document.createElement('canvas'); c2.width = c2.height = cv.width; fn(c2.getContext('2d')); return c2; };
          var fieldRect = function (g, m) {      // draw this tile's part of a field mask. The source rectangle is clipped to the image HERE: iOS Safari draws nothing when it reaches outside the image, which left solid forest blocks on tiles at the edge of the data.
            // (clearRect is used for the uncovered border because it works whatever the compositing mode: the mask must make everything outside its drawn area transparent)
            var W = cv.width, sx = (X0 - b[0]) / st, sy = (b[3] - Y0) / st, sw = mt / st, x0 = Math.max(sx, 0), y0 = Math.max(sy, 0), x1 = Math.min(sx + sw, fw), y1 = Math.min(sy + sw, fh), k = W / sw;
            if (x1 - x0 < 0.5 || y1 - y0 < 0.5) { g.clearRect(0, 0, W, W); return; }      // no overlap with the data: nothing of this tile survives the mask
            var dx = (x0 - sx) * k, dy = (y0 - sy) * k, dw = (x1 - x0) * k, dh = (y1 - y0) * k;
            g.imageSmoothingEnabled = true; g.drawImage(m, x0, y0, x1 - x0, y1 - y0, dx, dy, dw, dh);
            if (dy > 0) g.clearRect(0, 0, W, dy); if (dy + dh < W) g.clearRect(0, dy + dh, W, W - dy - dh);
            if (dx > 0) g.clearRect(0, dy, dx, dh); if (dx + dw < W) g.clearRect(dx + dw, dy, W - dx - dw, dh);
          };
          var tiled = function (g, t, L) {      // the texture, period L metres, covering the tile
            var lp = L * ppm, ox = -((X0 % L + L) % L) * ppm, oy = -((L - ((Y0 % L) + L) % L) % L) * ppm; g.imageSmoothingEnabled = true;
            for (var x = ox; x < cv.width; x += lp) for (var y = oy; y < cv.height; y += lp) g.drawImage(t, x, y, lp, lp);
          };
          ctx.fillStyle = WASH; ctx.fillRect(0, 0, cv.width, cv.height);
          if (tw > 0.01) {
            var a = layer(function (g) { tiled(g, tex[0], per[0]); });
            var bb = layer(function (g) { tiled(g, tex[1], per[1]); g.globalCompositeOperation = 'destination-in'; fieldRect(g, masks.mix); });      // texture B only where the mix field says
            a.getContext('2d').drawImage(bb, 0, 0);
            ctx.globalAlpha = tw; ctx.drawImage(a, 0, 0); ctx.globalAlpha = 1;
          }
          var tone = layer(function (g) { g.fillStyle = 'rgb(' + bl.tone.join(',') + ')'; g.fillRect(0, 0, cv.width, cv.height); g.globalCompositeOperation = 'destination-in'; fieldRect(g, masks.near); });      // next to the frame: the frame's own forest tone, fading out
          ctx.globalCompositeOperation = 'color'; ctx.globalAlpha = bl.hue; ctx.drawImage(tone, 0, 0);      // hue + saturation of the frame's forest, keeping the texture's own light and dark
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = bl.k; ctx.drawImage(tone, 0, 0); ctx.globalAlpha = 1;      // and a little of its brightness
          var reno = layer(function (g) { g.fillStyle = LIME; g.fillRect(0, 0, cv.width, cv.height); g.globalCompositeOperation = 'destination-in'; fieldRect(g, masks.reno); });      // renoval: lighter, sparser green
          ctx.globalAlpha = 0.72; ctx.drawImage(reno, 0, 0); ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'destination-in'; ctx.globalAlpha = (1 - tw) / 1.35 + tw; fieldRect(ctx, masks.wash); ctx.globalAlpha = 1;      // overall strength: the forest field
          fieldRect(ctx, masks.keep);                                                                                                                  // renoval is also a little more transparent
          return cv;
        }
      });
      P('canopy-ready');
      canopyLayer = new Layer({ pane: 'canopy', tileSize: 256, minZoom: -10, maxZoom: 12, noWrap: true, keepBuffer: 2, className: 'canopy-tiles' }).addTo(map);
    }).catch(function () { /* no forest layer (e.g. offline before it was cached): the map still works */ });
  }

  /* ---------- footpaths (short walks recorded with the Garmin): the same sandy path as the art's footpaths to the falls; always shown, in every map mode and both views ---------- */
  var footpathLayers = [];
  function footpathWeights() { var ppm = pxPerMetre(); return { edge: Math.max(2.6, cfg.footpath_m.edge * ppm), fill: Math.max(1.5, cfg.footpath_m.fill * ppm) }; }
  function buildFootpaths() {
    (trailData.footpaths || []).forEach(function (fp) {
      fp.lines.forEach(function (ln) {
        var ll = pathLL(ln), w = footpathWeights(), o = { lineCap: 'round', lineJoin: 'round', interactive: false };
        footpathLayers.push({ part: 'edge', l: L.polyline(ll, Object.assign({ color: cfg.colours.footpath_edge, weight: w.edge, className: 'footpath-edge' }, o)).addTo(groups.footpaths) });
        footpathLayers.push({ part: 'fill', l: L.polyline(ll, Object.assign({ color: cfg.colours.footpath_fill, weight: w.fill, className: 'footpath-fill' }, o)).addTo(groups.footpaths) });
      });
    });
  }
  function restyleFootpaths() { if (!map) return; var w = footpathWeights(); footpathLayers.forEach(function (o) { o.l.setStyle({ weight: w[o.part] }); }); }

  /* ---------- hiking trails (Gaia GPS route): dark brown casing + cream dashes; two name labels; tap opens the details in the property view ---------- */
  function buildTrails() {      // the Gaia route: a thin dark casing + cream dashes (no tap action); two name labels in the rivers' style
    trailData.trails.forEach(function (tr) {
      tr.lines.forEach(function (ln) {
        var ll = pathLL(ln);
        L.polyline(ll, { color: cfg.colours.trail_casing, weight: 2.8, opacity: 1, lineCap: 'round', lineJoin: 'round', className: 'trail-casing', interactive: false }).addTo(groups.trails);
        L.polyline(ll, { color: cfg.colours.cream, weight: 1.2, opacity: 1, lineCap: 'butt', lineJoin: 'round', dashArray: '5 4', className: 'trail-dash', interactive: false }).addTo(groups.trails);
      });
      tr.labels.forEach(function (p) {
        L.marker(G.m2ll(p[0], p[1]), { icon: L.divIcon({ className: 'trail-label', html: '<span><i class="en">' + esc(tr.name.en) + '</i><i class="es">' + esc(tr.name.es) + '</i></span>', iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(groups.trails);      // both languages in the markup: CSS shows the current one
      });
    });
  }

  function buildRelief() {      // one image over the whole coverage zone (decrypted in the browser when the build is encrypted)
    var b = reliefInfo.bounds, url = 'data/relief.webp' + (Vault.enc ? '.enc' : '');
    (Vault.enc ? Vault.blobURL(url) : Promise.resolve(url)).then(function (u) {
      reliefLayer = L.imageOverlay(u, [G.m2ll(b[0], b[1]), G.m2ll(b[2], b[3])], { pane: 'relief', interactive: false, className: 'relief-img', opacity: map.getContainer().classList.contains('wide') ? 1 : 0.6 }).on('load', function () { P('relief-drawn'); }).addTo(map);
    }).catch(function () { /* no relief (e.g. offline before it was cached): the map still works */ });
  }

  function updateView() {      // the clicker shows which view you are in: close-up (the mapped area) or the whole property
    if (!map) return;
    var wide = map.getZoom() < closeFitZoom - 0.45;
    $('view-close').classList.toggle('on', !wide); $('view-property').classList.toggle('on', wide);
    map.getContainer().classList.toggle('wide', wide); document.body.classList.toggle('propview', wide); $('minimap').hidden = wide;      // whole-property view: hide badges/pills/bubbles and the mode bar; the map itself is the overview
    $('tilt-btn').hidden = !wide; applyLayers();
    if (wide) groups.names.addTo(map); else map.removeLayer(groups.names);      // names: property view only
    if (reliefLayer) reliefLayer.setOpacity(wide ? 1 : 0.6);      // full strength in the property view, quieter around the close-up
    if (!wide && !transitioning && Math.abs(normDeg(map.getBearing())) > 0.5) tweenBearing(0, 300);      // zooming back into the pampa view stands the map upright again
  }

  /* ---------- property view: fit the strip to the screen, tilting the map when that helps ---------- */
  function normDeg(a) { return ((a + 180) % 360 + 360) % 360 - 180; }
  function fitFor(th, vw, vh) {      // scale/centre/zoom that fit the whole property on a vw x vh screen when the map is turned clockwise by th degrees
    var r = th * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
    boundary.ring.forEach(function (p) { var sx = p[0] * c + p[1] * s, sy = -p[0] * s + p[1] * c; mnx = Math.min(mnx, sx); mxx = Math.max(mxx, sx); mny = Math.min(mny, sy); mxy = Math.max(mxy, sy); });
    var PAD = cfg.fit_pad, aw = vw - PAD.l - PAD.r, ah = vh - PAD.t - PAD.b, sc = Math.min(aw / (mxx - mnx), ah / (mxy - mny));
    var dx = (PAD.l + aw / 2) - vw / 2, dy = (PAD.t + ah / 2) - vh / 2;      // where the content sits relative to the screen centre (px, y down)
    var csx = (mnx + mxx) / 2 - dx / sc, csy = (mny + mxy) / 2 + dy / sc;      // screen-centre in the turned frame, then back to map metres
    var z = meta.zmax + Math.log(sc / meta.px_per_m) / Math.LN2;
    return { scale: sc, cx: csx * c - csy * s, cy: csx * s + csy * c, z: Math.floor(z / cfg.zoom_snap) * cfg.zoom_snap };
  }
  function tiltAngles() {      // the two useful tilts: strip upright (tall screens) or strip flat (wide screens)
    var a = boundary.axis_deg, up = a <= 90 ? -a : 180 - a;
    return { up: up, flat: up <= 0 ? up + 90 : up - 90 };
  }
  function chooseBearing(mode, vw, vh) {
    if (mode === 'north') return 0;
    var t2 = tiltAngles(), s0 = fitFor(0, vw, vh).scale, sU = fitFor(t2.up, vw, vh).scale, sF = fitFor(t2.flat, vw, vh).scale;
    var best = sU >= sF ? t2.up : t2.flat, gain = Math.max(sU, sF) / s0;
    return mode === 'tilted' || gain >= cfg.tilt.auto_gain ? best : 0;      // auto: tilt only when it makes the property bigger by cfg.tilt.auto_gain (15%)
  }
  function tweenBearing(target, ms, done) {
    var from = normDeg(map.getBearing()), d = normDeg(normDeg(target) - from), t0 = null;
    if (Math.abs(d) < 0.5) { map.setBearing(normDeg(target)); if (done) done(); return; }
    function step(ts) {
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      map.setBearing(from + d * e);
      if (k < 1) requestAnimationFrame(step); else if (done) done();
    }
    requestAnimationFrame(step);
  }
  function beginTransition() { transitioning = true; clearTimeout(transTimer); transTimer = setTimeout(function () { transitioning = false; updateView(); }, 4000); }
  function endTransition() { P('view-transition-end'); transitioning = false; clearTimeout(transTimer); updateView(); updateMinZoom(); }
  function enterProperty() {
    var sz = map.getSize(), th = chooseBearing(state.tilt, sz.x, sz.y), fit = fitFor(th, sz.x, sz.y);
    beginTransition(); updateMinZoom(th);
    tweenBearing(th, 350, function () { map.once('moveend', endTransition); map.flyTo(G.m2ll(fit.cx, fit.cy), fit.z, { duration: 0.9 }); });
  }
  function goClose() {
    beginTransition(); updateMinZoom(0);
    tweenBearing(0, 300, function () { map.once('moveend', endTransition); map.flyToBounds(G.bounds(), { duration: 0.7 }); });
  }
  function viewBoxM() {      // bounding box (metres) of the ground the screen shows now, rotation included
    var sz = map.getSize(), xs = [], ys = [];
    [[0, 0], [sz.x, 0], [sz.x, sz.y], [0, sz.y]].forEach(function (p) { var l = map.containerPointToLatLng(L.point(p)), m = G.ll2m(l.lat, l.lng); xs.push(m[0]); ys.push(m[1]); });
    return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) };
  }
  function clampToZone() {      // hard limit: the screen never shows ground outside the coverage zone (a view larger than the zone is centred on it)
    if (!map || !map._loaded || clamping || transitioning || !boundary) return;
    var e = 1.5 / pxPerMetre(), z = [boundary.zone[0] + e, boundary.zone[1] + e, boundary.zone[2] - e, boundary.zone[3] - e], v = viewBoxM(), dx = 0, dy = 0;      // aim 1.5 px inside: the map pane snaps to whole pixels
    if (v.x1 - v.x0 >= z[2] - z[0]) dx = (z[0] + z[2]) / 2 - (v.x0 + v.x1) / 2; else if (v.x0 < z[0]) dx = z[0] - v.x0; else if (v.x1 > z[2]) dx = z[2] - v.x1;
    if (v.y1 - v.y0 >= z[3] - z[1]) dy = (z[1] + z[3]) / 2 - (v.y0 + v.y1) / 2; else if (v.y0 < z[1]) dy = z[1] - v.y0; else if (v.y1 > z[3]) dy = z[3] - v.y1;
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return;
    var c = map.getCenter(), m = G.ll2m(c.lat, c.lng);
    clamping = true; map.setView(G.m2ll(m[0] + dx, m[1] + dy), map.getZoom(), { animate: false }); clamping = false;
  }
  function updateMinZoom(bearing) {      // zoom out only until the (rotated) screen fits inside the coverage zone
    var sz = map.getSize(), z = boundary.zone, th = (bearing === undefined ? map.getBearing() : bearing) * Math.PI / 180, c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
    var sc = Math.max((sz.x * c + sz.y * s) / (z[2] - z[0]), (sz.x * s + sz.y * c) / (z[3] - z[1]));      // px per metre at which the rotated screen exactly spans the zone
    var mz = meta.zmax + Math.log(sc / meta.px_per_m) / Math.LN2 + 0.01;
    map.options.minZoom = mz; if (map._loaded && map.getZoom() < mz) map.setView(map.getCenter(), mz, { animate: false });      // not setMinZoom: it starts an animated zoom, and the clamp below would read the stale zoom      // +0.01 zoom: a few pixels of slack so the screen is strictly smaller than the zone
    clampToZone();
  }
  function onResize() {
    updateMinZoom();
    var sz = map.getSize(), portrait = sz.y >= sz.x;
    if (lastPortrait !== undefined && portrait !== lastPortrait && map.getContainer().classList.contains('wide') && !transitioning) enterProperty();      // device turned: choose the tilt again
    lastPortrait = portrait;
  }
  function paintTilt() { $('tilt-btn').textContent = '↻ ' + t({ auto: 'tilt_auto', north: 'tilt_north', tilted: 'tilt_tilted' }[state.tilt]); }

  var settleTimer;
  function settleTiles(force) {
    /* Keep ONLY the tile set of the current mode. It always reads state.mode, so callbacks left over from earlier quick switches can never remove the set that is
       showing now (that used to leave a blank map with only the overlays drawn). The old set stays until the current one is ready, unless `force` (safety timer). */
    var cur = tiles[state.mode];
    if (!map.hasLayer(cur)) { cur.addTo(map); cur.setZIndex(2); return; }
    if (!force && !cur.__ready) return;
    Object.keys(tiles).forEach(function (n) { if (tiles[n] !== cur && map.hasLayer(tiles[n])) map.removeLayer(tiles[n]); });
  }

  /* ---------- modes / layers / language ---------- */
  function applyMode() {
    var next = tiles[state.mode];       // add the new set first, drop the old ones once it has loaded (no flash)
    if (!map.hasLayer(next)) { next.addTo(map); next.setZIndex(2); }
    clearTimeout(settleTimer); settleTimer = setTimeout(function () { settleTiles(true); }, window.__TILE_SAFETY_MS || 15000);      // safety net if the new set never reports 'load'
    settleTiles(false);
    sitePills.forEach(function (s) {
      var show = s.kind === 'label' || s.kind === 'base' || (s.kind === 'existing' && state.mode !== 'bare') || (s.kind === 'prospective' && state.mode === 'prospective');
      if (show) s.grp.addTo(groups.sites); else groups.sites.removeLayer(s.grp);
    });
    if (state.mode === 'prospective') groups.golf.addTo(map); else map.removeLayer(groups.golf);
    document.querySelectorAll('#modes button').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === state.mode); });
    applyLayers();
  }
  function applyLayers() {
    var c = map.getContainer();
    c.classList.add('nolabels');      // name tags are always off (no switch); tapping an icon / pampa still opens its details
    if (state.layers.quests && curView() === 'pampa') groups.quests.addTo(map); else map.removeLayer(groups.quests);      // the action areas belong to the pampa view
    $('btn-quests').classList.toggle('on', state.layers.quests);
    var tOn = state.trails[curView()];
    if (tOn) groups.trails.addTo(map); else map.removeLayer(groups.trails);
    $('btn-trails').classList.toggle('on', tOn);
    groups.boundary.addTo(map);      // the property outline is always shown (no switch)
    applyTerrain();
  }
  function applyLang() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll('[data-i18n]').forEach(function (e) { e.textContent = t(e.dataset.i18n); });
    document.querySelectorAll('[data-i18n-title]').forEach(function (e) { e.title = t(e.dataset.i18nTitle); e.setAttribute('aria-label', t(e.dataset.i18nTitle)); });
    $('lang').textContent = t('lang');
    $('title').textContent = t('title');
    sitePills.forEach(function (s) { s.pill.setIcon(pillIcon(s.poi, s.kind)); });
    sizeHits();
    updateOfflineText();
    paintTilt(); $('compass').title = t('compass'); $('view-close').textContent = t('view_close'); $('view-property').textContent = t('view_property'); updateScale(); updateView();
    renderView();
  }

  function wireUI() {
    $('lang').onclick = function () { state.lang = state.lang === 'en' ? 'es' : 'en'; store.set('lang', state.lang); applyLang(); };
    document.querySelectorAll('#modes button').forEach(function (b) {
      b.onclick = function () { state.mode = b.dataset.mode; applyMode(); toast(t(state.mode) + ': ' + t(state.mode + '_sub'), 1800); };
    });
    $('btn-quests').onclick = function () { if (!state.layers.quests) { state.layers.quests = true; store.set('layers3', state.layers); applyLayers(); } showView({ type: 'quests' }); };      // opens the action-items list AND shows their areas on the map; the switch in the list turns the areas off
    $('btn-trails').onclick = function () { var v = curView(); state.trails[v] = !state.trails[v]; applyLayers(); toast(t('trails') + ': ' + (state.trails[v] ? t('on') : t('off')), 1500); };
    $('btn-places').onclick = function () { showView({ type: 'places' }); };
    $('btn-locate').onclick = toggleGPS;
    $('compass').onclick = goClose;      // tap the compass: back to the close-up map
    $('view-close').onclick = goClose;
    $('view-property').onclick = enterProperty;
    $('tilt-btn').onclick = function () { state.tilt = { auto: 'north', north: 'tilted', tilted: 'auto' }[state.tilt]; paintTilt(); enterProperty(); };
    $('btn-terrain').onclick = function () { var v = curView(); state.terrain[v] = !state.terrain[v]; applyTerrain(); toast(t('terrain') + ': ' + (state.terrain[v] ? t('on') : t('off')), 1500); };
    $('sheet-close').onclick = closeSheet;
    $('offline').onclick = function () { askSW({ type: 'cache-all' }); };
    window.addEventListener('hashchange', openFromHash);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && map) settleTiles(false); });      // self-heal when returning to the app/tab
  }

  /* ---------- selection + bottom sheet ---------- */
  function setHash(h) { try { history.replaceState(null, '', h ? '#' + h : location.pathname + location.search); } catch (e) { /* file:// */ } }
  function highlight(kind, id) {
    Object.keys(pampaPolys).forEach(function (k) { var on = kind === 'pampa' && id === k; pampaPolys[k].setStyle(on ? { stroke: true, color: cfg.colours.pampa_highlight, weight: 4, fillColor: cfg.colours.pampa_highlight, fillOpacity: 0.25 } : { stroke: false, fillOpacity: 0.001 }); badgeMarkers[k].getElement() && badgeMarkers[k].getElement().firstChild.classList.toggle('sel', on); });
    Object.keys(questPolys).forEach(function (k) { var on = kind === 'quest' && id === k; questPolys[k].setStyle({ weight: on ? 6 : 3, fillOpacity: on ? 0.38 : 0.22 }); });      // dashed outline on every action item, heavier on the selected one
  }
  function selectPampa(k) { showView({ type: 'pampa', id: k }); }
  function selectQuest(id) { showView({ type: 'quest', id: id }); }
  function flyToBounds(bnds, maxZ) { map.flyToBounds(bnds, { padding: [40, 40], maxZoom: maxZ || meta.zmax + 1, duration: 0.6, paddingBottomRight: [40, Math.round(window.innerHeight * 0.45)] }); }

  function showView(v, nofly) {
    if (v.type === 'quest' && !state.layers.quests) { state.layers.quests = true; store.set('layers3', state.layers); applyLayers(); }      // an opened action item must be visible
    state.view = v; renderView(); if (!nofly) focusView(v);
  }
  function focusView(v) {
    if (v.type === 'pampa') { flyToBounds(pampaPolys[v.id].getBounds()); setHash('pampa/' + v.id); }
    else if (v.type === 'quest') { flyToBounds(questPolys[v.id].getBounds(), meta.zmax); setHash('quest/' + v.id); }
    else if (v.type === 'site') { var p = findPoi(v.id); map.flyTo(G.m2ll(p.x, p.y + 6), Math.max(map.getZoom(), meta.zmax - 0.5), { duration: 0.6 }); setHash('site/' + v.id); }
    else if (v.type === 'hole') { var h = golf.holes[v.id - 1]; flyToBounds(L.latLngBounds([G.m2ll(h.tee[0], h.tee[1]), G.m2ll(h.green[0], h.green[1])]), meta.zmax); setHash('hole/' + v.id); }
    else setHash('');
  }
  function findPoi(id) { return pois.filter(function (p) { return p.id === id; })[0]; }
  function closeSheet() { state.view = null; $('sheet').hidden = true; document.body.classList.remove('sheet-open'); highlight(null); setHash(''); }
  function openFromHash() {
    var m = (location.hash || '').slice(1).split('/');
    if (m[0] === 'pampa' && pampas[m[1]]) showView({ type: 'pampa', id: m[1] });
    else if (m[0] === 'quest' && quests.some(function (q) { return q.id === m[1]; })) showView({ type: 'quest', id: m[1] });
    else if (m[0] === 'site' && findPoi(m[1])) showView({ type: 'site', id: m[1] });
    else if (m[0] === 'hole' && golf.holes[+m[1] - 1]) showView({ type: 'hole', id: +m[1] });
  }

  function renderView() {
    var v = state.view, el = $('sheet-body');
    if (!v) { return; }
    var html = '';
    if (v.type === 'pampa') html = viewPampa(v.id);
    else if (v.type === 'site') html = viewSite(v.id);
    else if (v.type === 'quest') html = viewQuest(v.id);
    else if (v.type === 'quests') html = viewQuests();
    else if (v.type === 'places') html = viewPlaces('');
    else if (v.type === 'hole') html = viewHole(v.id);
    el.innerHTML = html; $('sheet').hidden = false; $('sheet').scrollTop = 0; document.body.classList.add('sheet-open');
    highlight(v.type === 'pampa' ? 'pampa' : v.type === 'quest' ? 'quest' : null, v.id);
    bindSheet(el);
  }
  function bindSheet(el) {
    el.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { var p = b.dataset.go.split(':'); showView({ type: p[0], id: p[0] === 'hole' ? +p[1] : p[1] }); }; });
    el.querySelectorAll('[data-chk]').forEach(function (c) { c.onchange = function () { state.layers[c.dataset.chk] = c.checked; store.set('layers3', state.layers); applyLayers(); }; });
    var s = el.querySelector('.search');
    if (s) s.oninput = function () { el.querySelector('#plist').innerHTML = placesList(s.value); bindSheet(el.querySelector('#plist')); };
  }

  function chips(list) { return '<div class="tags">' + list.map(function (c) { return '<span class="tag ' + (c[1] || '') + '">' + esc(c[0]) + '</span>'; }).join('') + '</div>'; }
  function notesBlock(n) { var s = nm(n); return '<h3>' + t('notes') + '</h3>' + (s ? '<p>' + esc(s) + '</p>' : '<p class="muted">' + t('no_notes') + '</p>'); }
  function questRows(list) {
    return list.map(function (q) {
      return '<button class="row q ' + q.status + '" data-go="quest:' + esc(q.id) + '"><span class="dot ' + q.priority + '"></span><span class="l">' + esc(nm(q.title)) + '</span><span class="r">' + t(q.status) + '</span></button>';
    }).join('');
  }

  function viewPampa(k) {
    var p = pampas[k];
    var rel = quests.filter(function (q) { return pointInQuestNear(q, p); });
    return '<h2>🌾 ' + t('pampa') + ' ' + esc(k) + '</h2>' + chips([[p.area_ha + ' ' + t('ha')], [t('region') + ' ' + p.area_no], ['⛰ ' + p.elev.mean + ' ' + t('m')], [t('avg_slope') + ' ' + p.elev.slope + '°']]) + terrainBlock(elevText(p.elev.mean), t('range') + ' ' + p.elev.min + '–' + p.elev.max + ' ' + t('m')) + notesBlock(p.notes) +
      (rel.length ? '<h3>' + t('related_quests') + '</h3>' + questRows(rel) : '');
  }
  function pointInQuestNear(q, p) {      // an action item is "here" if its region lies within 40 m of the pampa's label
    return q.polygon.some(function (rings) { return rings[0].some(function (c) { return Math.hypot(c[0] - p.label[0], c[1] - p.label[1]) < 40 + Math.sqrt(p.area_ha * 1e4) / 2; }); });
  }
  function terrainBlock() { var l = [].slice.call(arguments).map(function (s) { return '<p>' + esc(s) + '</p>'; }).join(''); return '<h3>' + t('elevation') + '</h3>' + l + '<p class="muted">' + t('terrain_note') + '</p>'; }
  function viewSite(id) {
    var p = findPoi(id);
    return '<h2>' + (EMOJI[id] === '' ? '' : (EMOJI[id] || '📍') + ' ') + esc(nm(p.name)) + '</h2>' + chips([[p.layer === 'prospective' ? t('planned') : t('on_ground'), p.layer === 'prospective' ? 'planned' : '']].concat(p.elev == null ? [] : [['⛰ ' + p.elev + ' ' + t('m')]])) + (p.elev == null ? '' : terrainBlock(elevText(p.elev))) + notesBlock(p.notes);
  }
  function viewQuest(id) {
    var q = quests.filter(function (x) { return x.id === id; })[0];
    return '<h2>❗ ' + esc(nm(q.title)) + '</h2>' + chips([[t(q.priority), q.priority], [t(q.status), q.status === 'done' ? 'done' : ''], [q.area_ha + ' ' + t('ha')]]) + '<p>' + esc(nm(q.detail)) + '</p>';
  }
  function viewQuests() {
    var out = '<h2>❗ ' + t('quests') + '</h2><label class="check"><input type="checkbox" data-chk="quests"' + (state.layers.quests ? ' checked' : '') + '>' + t('show_quests') + '</label>';
    ['now', 'next', 'later'].forEach(function (pr) {
      var list = quests.filter(function (q) { return q.priority === pr; });
      if (list.length) out += '<h3>' + t(pr) + '</h3>' + questRows(list);
    });
    return out;
  }
  function viewHole(n) {
    var h = golf.holes[n - 1];
    var rows = golf.holes.map(function (x) { return '<tr><td><b>' + x.n + '</b></td><td>' + x.tee_name + ' → ' + x.green_name + '</td><td>' + x.m + ' ' + t('m') + '</td><td>' + x.yd + ' ' + t('yd') + '</td></tr>'; }).join('');
    return '<h2>⛳ ' + t('hole') + ' ' + n + '</h2>' + chips([[h.m + ' ' + t('m') + ' / ' + h.yd + ' ' + t('yd')], [t('tee') + ' ' + h.tee_name], [t('green') + ' ' + h.green_name]]) +
      '<h3>' + t('golf_holes') + '</h3><table class="holes"><tr><th>#</th><th></th><th>' + t('m') + '</th><th>' + t('yd') + '</th></tr>' + rows +
      '<tr><td colspan="2"><b>' + t('total') + '</b></td><td><b>' + golf.total_m + '</b></td><td><b>' + golf.total_yd + '</b></td></tr></table>';
  }

  function placesList(q) {
    q = (q || '').trim().toLowerCase();
    var out = '', has = false;
    var match = function (s) { return !q || String(s).toLowerCase().indexOf(q) >= 0; };
    var ps = Object.keys(pampas).filter(function (k) { return match(k) || match('pampa ' + k); });
    if (ps.length) { has = true; out += '<h3>' + t('pampas') + '</h3>' + ps.map(function (k) { return '<button class="row" data-go="pampa:' + k + '"><span class="l">🌾 ' + t('pampa') + ' ' + k + '</span><span class="r">' + pampas[k].area_ha + ' ' + t('ha') + '</span></button>'; }).join(''); }
    var ss = pois.filter(function (p) { return p.kind !== 'label' && (match(p.name.en) || match(p.name.es)); });
    if (ss.length) { has = true; out += '<h3>' + t('sites') + '</h3>' + ss.map(function (p) { return '<button class="row" data-go="site:' + p.id + '"><span class="l">' + (EMOJI[p.id] || '📍') + ' ' + esc(nm(p.name)) + '</span><span class="r">' + (p.layer === 'prospective' ? t('planned') : '') + '</span></button>'; }).join(''); }
    var hs = golf.holes.filter(function (h) { return match('golf') || match(t('golf')) || match(t('hole') + ' ' + h.n); });
    if (hs.length) { has = true; out += '<h3>' + t('golf_holes') + '</h3>' + hs.map(function (h) { return '<button class="row" data-go="hole:' + h.n + '"><span class="l">⛳ ' + t('hole') + ' ' + h.n + '</span><span class="r">' + h.yd + ' ' + t('yd') + '</span></button>'; }).join(''); }
    var qs = quests.filter(function (x) { return match(x.title.en) || match(x.title.es); });
    if (qs.length) { has = true; out += '<h3>' + t('quests') + '</h3>' + questRows(qs); }
    return has ? out : '<p class="muted">' + t('no_results') + '</p>';
  }
  function viewPlaces() { return '<h2>🔎 ' + t('places') + '</h2><input class="search" type="search" placeholder="' + esc(t('search')) + '" autocomplete="off"><div id="plist">' + placesList('') + '</div><p class="muted" style="font-size:12px">' + t('credits') + '</p>'; }

  /* ---------- GPS ---------- */
  function toggleGPS() {
    if (gps) { stopGPS(); toast(t('gps_off'), 1500); return; }
    if (!navigator.geolocation) { toast(t('gps_denied'), 3000); return; }
    toast(t('gps_waiting'), 2500);
    $('btn-locate').classList.add('on');
    gps = { first: true, id: navigator.geolocation.watchPosition(onFix, onGPSError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }) };
  }
  function stopGPS() { $('mm-gps').setAttribute('hidden', ''); navigator.geolocation.clearWatch(gps.id); groups.gps.clearLayers(); gps = null; $('btn-locate').classList.remove('on'); }
  function onFix(pos) {
    if (!gps) return;
    var m = G.lonlat2m(pos.coords.longitude, pos.coords.latitude);
    groups.gps.clearLayers();
    if (!G.inside(m[0], m[1], 30) && !insideProperty(m[0], m[1])) { if (gps.first) toast(t('gps_outside'), 3500); gps.first = false; return; }
    var ll = G.m2ll(m[0], m[1]);
    if (MM) { var gd = $('mm-gps'); gd.setAttribute('cx', MM.X(m[0])); gd.setAttribute('cy', MM.Y(m[1])); gd.removeAttribute('hidden'); }
    L.circle(ll, { radius: G.mToUnits(pos.coords.accuracy), stroke: false, fillColor: '#2f8fd8', fillOpacity: 0.15, interactive: false }).addTo(groups.gps);
    L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="gps-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, keyboard: false }).addTo(groups.gps);
    if (gps.first) { map.flyTo(ll, Math.max(map.getZoom(), meta.zmax - 0.5), { duration: 0.8 }); toast(t('accuracy') + ' ±' + Math.round(pos.coords.accuracy) + ' ' + t('m'), 2200); gps.first = false; }
  }
  function onGPSError(e) { toast(e && e.code === 1 ? t('gps_denied') : t('gps_waiting'), 3500); if (e && e.code === 1 && gps) stopGPS(); }

  /* ---------- offline (service worker) ---------- */
  var off = { state: 'none', done: 0, total: 0 };
  function updateOfflineText() {
    var o = $('offline'); if (!o) return;
    o.className = 'chip ' + ({ ready: 'ready', saving: 'saving', partial: 'partial' }[off.state] || '');
    if (off.state === 'ready') P('offline-ready');
    $('offline-text').textContent = off.state === 'ready' ? t('offline_ready') : off.state === 'saving' ? t('offline_saving') + ' ' + (off.total ? Math.round(100 * off.done / off.total) + '%' : '') : off.state === 'partial' ? t('offline_partial') : t('offline_none');
  }
  function askSW(msg) { if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage(msg); else if (navigator.serviceWorker) navigator.serviceWorker.ready.then(function (r) { r.active && r.active.postMessage(msg); }); }
  function registerSW() {
    updateOfflineText();
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.type === 'progress') { off = { state: d.done >= d.total ? 'ready' : 'saving', done: d.done, total: d.total }; updateOfflineText(); }
      if (d.type === 'status') { off = { state: d.done >= d.total ? 'ready' : d.done > 0 ? 'partial' : 'none', done: d.done, total: d.total }; updateOfflineText(); if (off.state !== 'ready') setTimeout(function () { askSW({ type: 'cache-all' }); }, 4000); }      // let the visible tiles load first
    });
    navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; }).then(function () { askSW({ type: 'status' }); })
      .catch(function () { off.state = 'none'; updateOfflineText(); });
  }

  var toastTimer;
  function toast(msg, ms) { var e = $('toast'); e.textContent = msg; e.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { e.hidden = true; }, ms || 2000); }
})();
