/* Bandurrias farm map: Leaflet (flat CRS) over pre-rendered tile layers + interactive pampas / sites / action items / GPS. */
(function () {
  'use strict';
  var STR = I18N.STR;
  var EMOJI = { waterfall: '💦', fishing: '🎣', dunny: '🚽', camp: '⛺', vista: '🔭', tower_m: '🐗', tower_n: '🐗', intake_falls: '💦', hangar: '🛩️',
    residence: '🏡', greenhouse: '🌱', orchard: '🍎', tennis: '🎾', solar: '☀️', battery: '🔋', hydro: '⚡', runway: '🛬', pond: '🦆' };
  var $ = function (id) { return document.getElementById(id); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('bandurrias.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('bandurrias.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  var state = {
    lang: store.get('lang', (navigator.language || 'en').slice(0, 2) === 'es' ? 'es' : 'en'),
    mode: store.get('mode', 'existing'),
    layers: Object.assign({ quests: true, labels: true, golf: true, terrain: true }, store.get('layers', {})),
    view: null
  };
  var meta, pampas, pois, golf, quests, terrain, G, map, tiles = {}, groups = {}, badgeMarkers = {}, tintRenderer, pampaPolys = {}, questPolys = {}, sitePills = [], gps = null;

  var t = function (k) { return STR[state.lang][k] || STR.en[k] || k; };
  var nm = function (o) { return I18N.pick(o, state.lang); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function load() {
    return Promise.all(['meta', 'pampas', 'pois', 'golf', 'quests', 'terrain'].map(function (n) { return Vault.json('data/' + n + '.json'); })).then(function (d) {
      meta = d[0]; pampas = d[1]; pois = d[2]; golf = d[3]; quests = d[4]; terrain = d[5];
      init();
    }).catch(loadError);
  }
  function lockText() {
    $('lock-hint').textContent = t('lock_hint'); $('lock-btn').textContent = t('lock_btn'); $('lock-pass').placeholder = t('lock_pass'); $('lock-lang').textContent = t('lang');
  }
  function showLock() {
    var el = $('lock'); el.hidden = false; lockText(); $('lock-pass').focus();
    $('lock-lang').onclick = function () { state.lang = state.lang === 'en' ? 'es' : 'en'; store.set('lang', state.lang); lockText(); };
    $('lock-form').onsubmit = function (ev) {
      ev.preventDefault();
      var v = $('lock-pass').value; if (!v) return;
      $('lock-msg').textContent = t('lock_working'); $('lock-btn').disabled = true;
      Vault.unlock(v).then(function (ok) {
        if (ok) { el.hidden = true; $('lock-pass').value = ''; load(); }
        else { $('lock-msg').textContent = t('lock_wrong'); $('lock-btn').disabled = false; $('lock-pass').select(); }
      }).catch(function () { $('lock-msg').textContent = t('lock_wrong'); $('lock-btn').disabled = false; });
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
    map = L.map('map', { crs: L.CRS.Simple, zoomControl: false, attributionControl: false, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90,
      maxZoom: meta.zmax + 1, inertia: true, bounceAtZoomLimits: false, tap: true });
    var fit = map.getBoundsZoom(b, false);
    map.setMinZoom(fit - 0.75);
    map.setMaxBounds(L.latLngBounds(b).pad(0.15));
    map.fitBounds(b);
    var TileLayer = Vault.enc ? VaultTileLayer() : L.TileLayer;      // encrypted builds fetch .enc tiles and decrypt them in the browser
    meta.layers.forEach(function (n) {      // one opaque tile set per mode (bare | existing | prospective)
      tiles[n] = new TileLayer('tiles/' + n + '/{z}/{x}/{y}.webp' + (Vault.enc ? '.enc' : '') + '?v=' + meta.tiles_v, { tileSize: meta.tile, minNativeZoom: 0, maxNativeZoom: meta.zmax - (L.Browser.retina ? 1 : 0), detectRetina: true,
        bounds: b, noWrap: true, keepBuffer: 4, className: 'tile-base' });      // retina screens load the next zoom level's tiles (half-size) for crisp art
      tiles[n].on('tileloadstart', function (e) { var s = tiles[n].getTileSize(); e.tile.style.width = (s.x + 1) + 'px'; e.tile.style.height = (s.y + 1) + 'px'; });      // 1px overlap hides sub-pixel seams
    });
    map.createPane('tint'); map.getPane('tint').style.zIndex = 250; map.getPane('tint').style.pointerEvents = 'none';      // blended with the tiles in CSS (mix-blend-mode: color) so map detail shows through
    tintRenderer = L.svg({ pane: 'tint' });
    ['tint', 'contourMajor', 'contourMinor', 'contourLabels', 'pampas', 'golf', 'sites', 'badges', 'quests', 'gps'].forEach(function (n) { groups[n] = L.layerGroup().addTo(map); });
    buildTerrain(); buildPampas(); buildGolf(); buildSites(); buildQuests();
    var farZoom = fit + 0.9;
    var minorZoom = fit + 1.6;      // 10 m contours only when zoomed in, so the overview stays clean
    var zoomClass = function () { map.getContainer().classList.toggle('far', map.getZoom() < farZoom); applyMinorContours(map.getZoom() >= minorZoom); };
    map.on('zoomend', zoomClass); zoomClass();
    map.on('click', function () { closeSheet(); });
    wireUI();
    applyLang(); applyMode(); applyLayers();
    openFromHash();
    registerSW();
    window.__app = { terrain: terrain, map: map, G: G, state: state, meta: meta };       // for tests / debugging
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

  function polyLatLngs(polys) {
    return polys.map(function (rings) { return rings.map(function (ring) { return ring.map(function (c) { return G.m2ll(c[0], c[1]); }); }); });
  }

  function buildPampas() {
    Object.keys(pampas).forEach(function (k) {
      var p = pampas[k];
      var poly = L.polygon(polyLatLngs(p.polygon), { stroke: false, fillColor: '#f2b134', fillOpacity: 0.001, interactive: true }).addTo(groups.pampas);
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
      if (p.kind !== 'label') {
        var hit = L.circleMarker(G.m2ll(p.x, p.y + 6), { radius: 17, stroke: false, fillColor: '#fff', fillOpacity: 0.001, interactive: true });
        hit.on('click', function (e) { L.DomEvent.stopPropagation(e); showView({ type: 'site', id: p.id }); });
        grp.addLayer(hit);
      }
      sitePills.push({ poi: p, pill: pill, grp: grp, kind: kind });
    });
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
      var b = L.marker(G.m2ll(q.centroid[0], q.centroid[1]), { icon: L.divIcon({ className: '', html: '<div class="q-bubble ' + (q.status === 'done' ? 'done' : q.priority) + '">' + (q.status === 'done' ? '✓' : '!') + '</div>', iconSize: [34, 34], iconAnchor: [17, 46] }), keyboard: false })
        .on('click', function (e) { L.DomEvent.stopPropagation(e); selectQuest(q.id); }).addTo(groups.quests);
      q._bubble = b;
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
  function buildTerrain() {
    Object.keys(pampas).forEach(function (k) {
      L.polygon(polyLatLngs(pampas[k].polygon), { stroke: false, fillColor: rampCSS(tFor(pampas[k].elev.mean)), fillOpacity: 0.85, interactive: false, renderer: tintRenderer }).addTo(groups.tint);
    });
    var line = function (lines, style, grp) { lines.forEach(function (l) { L.polyline(l.map(function (c) { return G.m2ll(c[0], c[1]); }), style).addTo(grp); }); };
    terrain.major.forEach(function (m) {
      line(m.lines, { color: '#6b3f1d', weight: 1.6, opacity: 0.55, interactive: false }, groups.contourMajor);
      (m.labels || []).forEach(function (p) { L.marker(G.m2ll(p[0], p[1]), { icon: L.divIcon({ className: 'contour-label', html: '<span>' + m.z + ' m</span>', iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(groups.contourLabels); });
    });
    terrain.minor.forEach(function (m) { line(m.lines, { color: '#6b3f1d', weight: 0.8, opacity: 0.4, interactive: false }, groups.contourMinor); });
  }
  var minorWanted = false;
  function applyMinorContours(wanted) { minorWanted = wanted; if (!map) return; if (wanted && state.layers.terrain) groups.contourMinor.addTo(map); else map.removeLayer(groups.contourMinor); }
  function applyTerrain() {
    var on = state.layers.terrain;
    ['tint', 'contourMajor', 'contourLabels'].forEach(function (n) { if (on) groups[n].addTo(map); else map.removeLayer(groups[n]); });
    applyMinorContours(minorWanted);
    $('legend').hidden = !on;
    $('btn-terrain').classList.toggle('on', on);
    $('lg-low').textContent = terrain.range[0] + ' m'; $('lg-high').textContent = terrain.range[1] + ' m';
    $('legend-bar').style.background = 'linear-gradient(to right,' + rampCSS(0) + ',' + rampCSS(0.5) + ',' + rampCSS(1) + ')';
  }
  function elevText(elev, rel) {      // 'N m above/below the average cleared ground (248 m)'
    var d = Math.round(elev - terrain.cleared_mean), ad = Math.abs(d), nb = '\u00a0', avg = ' (' + terrain.cleared_mean + nb + t('m') + ')';
    if (ad < 3) return t('about_same') + avg;
    return ad + nb + t('m') + ' ' + t(d > 0 ? 'above_avg' : 'below_avg') + avg;
  }

  /* ---------- modes / layers / language ---------- */
  function applyMode() {
    var next = tiles[state.mode];       // add the new set first, drop the old ones once it has loaded (no flash)
    var dropOthers = function () { Object.keys(tiles).forEach(function (n) { if (tiles[n] !== next && map.hasLayer(tiles[n])) map.removeLayer(tiles[n]); }); };
    if (!map.hasLayer(next)) { next.addTo(map); next.setZIndex(2); next.once('load', dropOthers); setTimeout(dropOthers, 15000); } else dropOthers();      // old set stays until the new one has loaded (15 s safety net)
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
    c.classList.toggle('nolabels', !state.layers.labels);
    c.classList.toggle('nogolf', !state.layers.golf);
    if (state.layers.quests) groups.quests.addTo(map); else map.removeLayer(groups.quests);
    applyTerrain();
  }
  function applyLang() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll('[data-i18n]').forEach(function (e) { e.textContent = t(e.dataset.i18n); });
    document.querySelectorAll('[data-i18n-title]').forEach(function (e) { e.title = t(e.dataset.i18nTitle); e.setAttribute('aria-label', t(e.dataset.i18nTitle)); });
    $('lang').textContent = t('lang');
    $('title').textContent = t('title');
    sitePills.forEach(function (s) { s.pill.setIcon(pillIcon(s.poi, s.kind)); });
    updateOfflineText();
    $('legend-title').textContent = t('terrain_legend'); $('legend-note').textContent = t('terrain_note');
    renderView();
  }

  function wireUI() {
    $('lang').onclick = function () { state.lang = state.lang === 'en' ? 'es' : 'en'; store.set('lang', state.lang); applyLang(); };
    document.querySelectorAll('#modes button').forEach(function (b) {
      b.onclick = function () { state.mode = b.dataset.mode; store.set('mode', state.mode); applyMode(); toast(t(state.mode) + ': ' + t(state.mode + '_sub'), 1800); };
    });
    $('btn-quests').onclick = function () { showView({ type: 'quests' }); };
    $('btn-places').onclick = function () { showView({ type: 'places' }); };
    $('btn-layers').onclick = function () { showView({ type: 'layers' }); };
    $('btn-locate').onclick = toggleGPS;
    $('btn-terrain').onclick = function () { state.layers.terrain = !state.layers.terrain; store.set('layers', state.layers); applyTerrain(); toast(t('terrain') + ': ' + (state.layers.terrain ? t('on') : t('off')), 1500); };
    $('sheet-close').onclick = closeSheet;
    $('offline').onclick = function () { askSW({ type: 'cache-all' }); };
    window.addEventListener('hashchange', openFromHash);
  }

  /* ---------- selection + bottom sheet ---------- */
  function setHash(h) { try { history.replaceState(null, '', h ? '#' + h : location.pathname + location.search); } catch (e) { /* file:// */ } }
  function highlight(kind, id) {
    Object.keys(pampaPolys).forEach(function (k) { var on = kind === 'pampa' && id === k; pampaPolys[k].setStyle(on ? { stroke: true, color: '#f2b134', weight: 4, fillColor: '#f2b134', fillOpacity: 0.25 } : { stroke: false, fillOpacity: 0.001 }); badgeMarkers[k].getElement() && badgeMarkers[k].getElement().firstChild.classList.toggle('sel', on); });
    Object.keys(questPolys).forEach(function (k) { var on = kind === 'quest' && id === k; questPolys[k].setStyle({ weight: on ? 6 : 3, fillOpacity: on ? 0.38 : 0.22 }); });      // dashed outline on every action item, heavier on the selected one
  }
  function selectPampa(k) { showView({ type: 'pampa', id: k }); }
  function selectQuest(id) { showView({ type: 'quest', id: id }); }
  function flyToBounds(bnds, maxZ) { map.flyToBounds(bnds, { padding: [40, 40], maxZoom: maxZ || meta.zmax + 1, duration: 0.6, paddingBottomRight: [40, Math.round(window.innerHeight * 0.45)] }); }

  function showView(v, nofly) { state.view = v; renderView(); if (!nofly) focusView(v); }
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
    else if (v.type === 'layers') html = viewLayers();
    else if (v.type === 'hole') html = viewHole(v.id);
    el.innerHTML = html; $('sheet').hidden = false; $('sheet').scrollTop = 0; document.body.classList.add('sheet-open');
    highlight(v.type === 'pampa' ? 'pampa' : v.type === 'quest' ? 'quest' : null, v.id);
    bindSheet(el);
  }
  function bindSheet(el) {
    el.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { var p = b.dataset.go.split(':'); showView({ type: p[0], id: p[0] === 'hole' ? +p[1] : p[1] }); }; });
    el.querySelectorAll('[data-chk]').forEach(function (c) { c.onchange = function () { state.layers[c.dataset.chk] = c.checked; store.set('layers', state.layers); applyLayers(); }; });
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
    return '<h2>' + (EMOJI[id] || '📍') + ' ' + esc(nm(p.name)) + '</h2>' + chips([[p.layer === 'prospective' ? t('planned') : t('on_ground'), p.layer === 'prospective' ? 'planned' : ''], ['⛰ ' + p.elev + ' ' + t('m')]]) + terrainBlock(elevText(p.elev)) + notesBlock(p.notes);
  }
  function viewQuest(id) {
    var q = quests.filter(function (x) { return x.id === id; })[0];
    return '<h2>❗ ' + esc(nm(q.title)) + '</h2>' + chips([[t(q.priority), q.priority], [t(q.status), q.status === 'done' ? 'done' : ''], [q.area_ha + ' ' + t('ha')]]) + '<p>' + esc(nm(q.detail)) + '</p>';
  }
  function viewQuests() {
    var out = '<h2>❗ ' + t('quests') + '</h2>';
    ['now', 'next', 'later'].forEach(function (pr) {
      var list = quests.filter(function (q) { return q.priority === pr; });
      if (list.length) out += '<h3>' + t(pr) + '</h3>' + questRows(list);
    });
    return out;
  }
  function viewLayers() {
    var row = function (k, label) { return '<label class="check"><input type="checkbox" data-chk="' + k + '"' + (state.layers[k] ? ' checked' : '') + '>' + t(label) + '</label>'; };
    return '<h2>🗺️ ' + t('layers') + '</h2>' + row('terrain', 'show_terrain') + row('quests', 'show_quests') + row('labels', 'show_labels') + row('golf', 'show_golf');
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
  function viewPlaces() { return '<h2>🔎 ' + t('places') + '</h2><input class="search" type="search" placeholder="' + esc(t('search')) + '" autocomplete="off"><div id="plist">' + placesList('') + '</div>'; }

  /* ---------- GPS ---------- */
  function toggleGPS() {
    if (gps) { stopGPS(); toast(t('gps_off'), 1500); return; }
    if (!navigator.geolocation) { toast(t('gps_denied'), 3000); return; }
    toast(t('gps_waiting'), 2500);
    $('btn-locate').classList.add('on');
    gps = { first: true, dot: null, acc: null, id: navigator.geolocation.watchPosition(onFix, onGPSError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }) };
  }
  function stopGPS() { navigator.geolocation.clearWatch(gps.id); groups.gps.clearLayers(); gps = null; $('btn-locate').classList.remove('on'); }
  function onFix(pos) {
    if (!gps) return;
    var m = G.lonlat2m(pos.coords.longitude, pos.coords.latitude);
    groups.gps.clearLayers();
    if (!G.inside(m[0], m[1], 30)) { if (gps.first) toast(t('gps_outside'), 3500); gps.first = false; return; }
    var ll = G.m2ll(m[0], m[1]);
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
