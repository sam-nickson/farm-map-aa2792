/* Performance check mode. Does NOTHING unless the address ends in #profile (e.g. .../farm-map-aa2792/#profile). Then it times the app's load steps, how smoothly the map pans/zooms,
   how quickly the buttons respond, how many map objects exist, and shows a result card you can screenshot or copy. Everything stays on the device: no network calls, no storage. */
(function () {
  'use strict';
  if (String(location.hash).indexOf('profile') < 0) return;
  var now = function () { return performance.now(); }, marks = {}, order = [], pan = [], buttons = {}, frames = null;
  var P = window.__perf = {
    mark: function (n) { if (!(n in marks)) { marks[n] = { t: now(), n: 1 }; order.push(n); } else { marks[n].last = now(); marks[n].n += 1; } if (n === 'init-done') watchMap(); },
    report: function () { return report(); }
  };
  P.mark('profile-js');

  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.floor(s.length / 2)]; }
  function pct(a, p) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

  /* smoothness: frame times between map movestart and moveend */
  var watching = false;
  function watchMap() {
    var a = window.__app; if (!a || !a.map) { setTimeout(watchMap, 100); return; }
    if (watching) return; watching = true;
    var map = a.map, last = 0, dts = [], run = false, t0 = 0;
    function tick(ts) { if (!run) return; if (last) dts.push(ts - last); last = ts; requestAnimationFrame(tick); }
    map.on('movestart zoomstart', function () { if (run) return; run = true; dts = []; last = 0; t0 = now(); requestAnimationFrame(tick); });
    map.on('moveend zoomend', function () { if (!run) return; run = false; if (dts.length >= 3) pan.push({ ms: Math.round(now() - t0), frames: dts.length, fps: Math.round(1000 / (dts.reduce(function (s, x) { return s + x; }, 0) / dts.length)), worst: Math.round(Math.max.apply(null, dts)), slow50: dts.filter(function (x) { return x > 50; }).length, p95: Math.round(pct(dts, 0.95)) }); });
  }
  /* button response: click -> the frame after the next one has been drawn */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button'); if (!b || !b.id) return; var t0 = now();
    requestAnimationFrame(function () { requestAnimationFrame(function () { (buttons[b.id] = buttons[b.id] || []).push(Math.round(now() - t0)); }); });
  }, true);

  function counts() {
    var q = function (s) { return document.querySelectorAll(s).length; };
    return { svg_paths: q('svg path'), markers: q('.leaflet-marker-icon'), canvases: q('canvas'), tile_imgs: q('img.leaflet-tile'), dom_nodes: q('*'),
      heap_mb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
  }
  function report() {
    var m = {}; order.forEach(function (n) { m[n] = Math.round(marks[n].t); });
    var d = function (a, b) { return (a in m && b in m) ? m[b] - m[a] : null; };
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    var fpsAll = pan.map(function (x) { return x.fps; });
    var btn = {}; Object.keys(buttons).forEach(function (k) { btn[k] = { n: buttons[k].length, median_ms: median(buttons[k]), worst_ms: Math.max.apply(null, buttons[k]) }; });
    return {
      device: { ua: navigator.userAgent, dpr: window.devicePixelRatio, screen: screen.width + 'x' + screen.height, viewport: innerWidth + 'x' + innerHeight, cores: navigator.hardwareConcurrency || null, memory_gb: navigator.deviceMemory || null },
      page_load_ms: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      marks_ms: m,
      steps_ms: { 'data download+decrypt+parse': d('data-request', 'data-loaded'), 'build the map (init)': d('data-loaded', 'init-done'), 'first art tiles drawn (after init)': d('init-done', 'first-art-tiles'),
        'forest layer ready (after init)': d('init-done', 'canopy-ready'), 'relief drawn (after init)': d('init-done', 'relief-drawn'), 'unlock (passphrase check)': d('unlock-submitted', 'unlocked'), 'offline copy complete': m['offline-ready'] || null },
      pan_zoom: { moves: pan.length, median_fps: median(fpsAll), worst_fps: fpsAll.length ? Math.min.apply(null, fpsAll) : null, slow_frames_over_50ms: pan.reduce(function (s, x) { return s + x.slow50; }, 0), worst_frame_ms: pan.length ? Math.max.apply(null, pan.map(function (x) { return x.worst; })) : null },
      buttons: btn, counts: counts(), build: (window.__app && window.__app.meta) ? window.__app.meta.tiles_v : null
    };
  }

  function card() {
    var c = document.createElement('div'); c.id = 'profile-card';
    c.style.cssText = 'position:fixed;left:6px;right:78px;bottom:6px;max-height:38vh;overflow:auto;pointer-events:none;z-index:100000;background:rgba(255,246,217,.97);color:#3b2a14;border:2px solid #3b2a14;border-radius:12px;padding:8px 10px;font:11px/1.35 -apple-system,system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.4)';
    c.innerHTML = '<b>Performance check</b> <button id="pf-copy" style="font:inherit;margin-left:6px;pointer-events:auto">Copy results</button> <button id="pf-hide" style="font:inherit;pointer-events:auto">Hide</button><pre id="pf-out" style="white-space:pre-wrap;margin:6px 0 0;font:10.5px/1.35 ui-monospace,Menlo,monospace"></pre>';
    document.body.appendChild(c);
    var out = c.querySelector('#pf-out'), hidden = false;
    function paint() {
      var r = report(), L = [];
      L.push('LOAD (ms from page start)'); Object.keys(r.marks_ms).forEach(function (k) { L.push('  ' + k + ': ' + r.marks_ms[k]); });
      L.push('STEPS (ms)'); Object.keys(r.steps_ms).forEach(function (k) { if (r.steps_ms[k] !== null) L.push('  ' + k + ': ' + r.steps_ms[k]); });
      L.push('PAN/ZOOM: ' + r.pan_zoom.moves + ' moves, median ' + r.pan_zoom.median_fps + ' fps, worst ' + r.pan_zoom.worst_fps + ' fps, ' + r.pan_zoom.slow_frames_over_50ms + ' slow frames, worst frame ' + r.pan_zoom.worst_frame_ms + ' ms');
      L.push('BUTTONS (click to painted, ms)'); Object.keys(r.buttons).forEach(function (k) { L.push('  ' + k + ': median ' + r.buttons[k].median_ms + ', worst ' + r.buttons[k].worst_ms + ' (' + r.buttons[k].n + 'x)'); });
      L.push('OBJECTS: ' + JSON.stringify(r.counts)); L.push('DEVICE: ' + r.device.dpr + 'x, ' + r.device.screen + ', ' + (r.device.cores || '?') + ' cores'); out.textContent = L.join('\n');
    }
    setInterval(function () { if (!hidden) paint(); }, 1000); paint();
    c.querySelector('#pf-copy').onclick = function () { var t = JSON.stringify(report(), null, 1); if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { c.querySelector('#pf-copy').textContent = 'Copied'; }, function () { out.textContent = t; }); else out.textContent = t; };
    c.querySelector('#pf-hide').onclick = function () { hidden = !hidden; out.style.display = hidden ? 'none' : ''; c.querySelector('#pf-hide').textContent = hidden ? 'Show' : 'Hide'; };
  }
  document.addEventListener('DOMContentLoaded', function () { P.mark('dom-ready'); card(); watchMap(); });
  window.addEventListener('load', function () { P.mark('window-load'); });
})();
