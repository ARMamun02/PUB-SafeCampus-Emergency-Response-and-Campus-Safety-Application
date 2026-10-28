/* PUB SafeCampus web app. No build step, no framework. */
(function () {
'use strict';

var LS_TOKEN = 'sc.token', LS_USER = 'sc.user', LS_CONSENT = 'sc.locConsent';
var HOLD_MS = 1500, COUNT = 5;
var SEVL = ['', 'Low', 'Moderate', 'High', 'Critical'];
var FLOW = ['reported', 'acknowledged', 'enroute', 'resolved'];
var SL = { queued: 'Saved on device', reported: 'Reported', acknowledged: 'Acknowledged', enroute: 'Responder on the way', resolved: 'Resolved' };
var REPORT_CATS = ['medical', 'harassment', 'ragging', 'fire', 'accident', 'theft', 'hazard'];
var CAT_HINT = { medical: 'Someone is hurt or ill', harassment: 'Unwanted behaviour. Can be anonymous', ragging: 'Forced or abusive treatment. Can be anonymous', fire: 'Smoke or flames', accident: 'A crash, fall or injury', theft: 'Lost or stolen item', hazard: 'Broken glass, wires, flooding' };
function ico(d) { return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; }
var TAB_ICON = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  report: '<path d="M12 5v14M5 12h14"/>',
  mine: '<path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 004 0"/>',
  directory: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/>',
  bcast: '<path d="M3 11v2a1 1 0 001 1h3l7 4V6L7 10H4a1 1 0 00-1 1z"/><path d="M18 9a4 4 0 010 6"/>',
  dash: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  reports: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  resp: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14a6.5 6.5 0 013.5 6"/>'
};
var TABS = {
  student: [['home', 'Home'], ['report', 'Report'], ['mine', 'My alerts'], ['directory', 'Directory'], ['bcast', 'Broadcasts']],
  responder: [['dash', 'Dashboard'], ['bcast', 'Broadcasts'], ['directory', 'Directory']],
  admin: [['dash', 'Dashboard'], ['reports', 'Reports'], ['bcast', 'Broadcasts'], ['resp', 'Responders'], ['directory', 'Directory']]
};
var TEMPLATES = {
  fire: { title: 'Fire drill', level: 'drill', body: 'This is a drill. Leave your building by the nearest marked exit and gather at the Playground. Do not use the lifts.' },
  flood: { title: 'Flood warning', level: 'warning', body: 'Water is rising on low-lying paths. Avoid the Playground side and use the main road. Move belongings off ground floors.' },
  clear: { title: 'All clear', level: 'info', body: 'The earlier warning is over. Normal activity can resume.' }
};

/* ---------- helpers ---------- */
function $(s, r) { return (r || document).querySelector(s); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
var tf = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
function fmtDur(ms) { var s = Math.round(ms / 1000); if (s < 60) return s + 's'; var m = Math.floor(s / 60); if (m < 60) return m + 'm ' + (s % 60) + 's'; var h = Math.floor(m / 60); return h + 'h ' + (m % 60) + 'm'; }
function ago(ts) { var m = Math.round((Date.now() - ts) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; var h = Math.floor(m / 60); if (h < 24) return h + ' h ago'; return Math.floor(h / 24) + ' d ago'; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function uuid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2); }
function initials(n) { return String(n).replace(/^Dr\.?\s*/, '').split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase(); }
function isStaff() { return S.user && S.user.role !== 'student'; }
function sevOf(cat) { return S.cfg.categories[cat] ? S.cfg.categories[cat].severity : 2; }

var S = {
  cfg: null, token: lsGet(LS_TOKEN), user: null, contacts: [], incidents: [], detail: {}, broadcasts: [], responders: [], analytics: null, analyticsDays: 30,
  tab: null, simOffline: false, queue: [], sse: null, sseOk: false, gps: null, manual: null, useManual: false,
  tried: {}, sel: null, filter: { team: true, resolved: false }, draft: null, compose: { title: '', body: '', level: 'info' },
  sos: null, modal: null, authMode: 'login', authErr: '', busy: false, sms: {}, mapCfg: {}, editContacts: null, locConsent: lsGet(LS_CONSENT) === '1'
};
function newDraft(cat) { return { category: cat, desc: '', buildingId: '', room: '', lat: null, lng: null, anonymous: false, media: [] }; }
S.draft = newDraft('medical');

/* ---------- connectivity, API ---------- */
function isOffline() { return S.simOffline || navigator.onLine === false; }
function apiErr(status, message, offline) { var e = new Error(message); e.status = status; e.offline = !!offline; return e; }

async function api(method, url, body) {
  if (isOffline()) throw apiErr(0, 'You are offline.', true);
  var res;
  try {
    res = await fetch(url, {
      method: method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, S.token ? { Authorization: 'Bearer ' + S.token } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) { throw apiErr(0, 'Cannot reach the server.', true); }
  var data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (res.status === 401 && S.token && url.indexOf('/api/auth/') !== 0) { signOut(); S.authErr = 'Please sign in again.'; render(); throw apiErr(401, 'Please sign in again.'); }
  if (!res.ok) throw apiErr(res.status, (data && data.error) || 'Request failed.');
  return data;
}

/* ---------- offline queue (IndexedDB, with memory fallback) ---------- */
function idb() {
  return new Promise(function (resolve, reject) {
    if (!window.indexedDB) return reject(new Error('no idb'));
    var r = indexedDB.open('safecampus', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('queue', { keyPath: 'clientId' }); };
    r.onsuccess = function () { resolve(r.result); };
    r.onerror = function () { reject(r.error); };
  });
}
function idbDo(mode, fn) {
  return idb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('queue', mode), out = fn(tx.objectStore('queue'));
      tx.oncomplete = function () { resolve(out && out.result); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}
function queueLoad() { return idbDo('readonly', function (s) { return s.getAll(); }).then(function (a) { S.queue = a || []; }).catch(function () { /* memory only */ }); }
function queuePut(item) { S.queue.push(item); return idbDo('readwrite', function (s) { return s.put(item); }).catch(function () { /* memory only */ }); }
function queueDel(id) { S.queue = S.queue.filter(function (x) { return x.clientId !== id; }); return idbDo('readwrite', function (s) { return s.delete(id); }).catch(function () { /* memory only */ }); }
function myQueue() { return S.queue.filter(function (i) { return S.user && i.userId === S.user.id; }); }

/* ---------- toast, sound ---------- */
var toastTimer = null;
function toast(msg) {
  var t = $('#toast'); t.innerHTML = '<div>' + esc(msg) + '</div>';
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.innerHTML = ''; }, 3600);
}
function beep() {
  try {
    var C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    var c = new C(), o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(c.destination); o.start(); setTimeout(function () { o.stop(); c.close(); }, 220);
  } catch (e) { /* sound unavailable */ }
}

/* ---------- location ---------- */
function getPosition(quick) {
  return new Promise(function (resolve) {
    if (S.useManual && S.manual) return resolve({ lat: S.manual.lat, lng: S.manual.lng, source: 'manual' });
    if (!navigator.geolocation) return resolve(S.manual ? { lat: S.manual.lat, lng: S.manual.lng, source: 'manual' } : null);
    navigator.geolocation.getCurrentPosition(function (p) {
      S.gps = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) };
      resolve({ lat: S.gps.lat, lng: S.gps.lng, source: 'gps' });
    }, function () {
      resolve(S.manual ? { lat: S.manual.lat, lng: S.manual.lng, source: 'manual' } : null);
    }, { enableHighAccuracy: true, timeout: quick ? 4000 : 9000, maximumAge: 5000 });
  });
}
function myMapPos() { if (S.useManual && S.manual) return S.manual; return S.gps || S.manual || null; }

var liveTimer = null;
function myLive() { return S.incidents.filter(function (i) { return i.mine && i.live && i.status !== 'resolved'; }); }
function startLive() {
  if (liveTimer) return;
  liveTimer = setInterval(async function () {
    var list = myLive();
    if (!list.length) { clearInterval(liveTimer); liveTimer = null; return; }
    if (isOffline() || !S.user) return;
    var p = await getPosition(true); if (!p) return;
    list.forEach(function (i) { api('POST', '/api/incidents/' + i.id + '/location', { lat: p.lat, lng: p.lng }).catch(function () { /* try again next tick */ }); });
  }, 5000);
}
var posWatch = null, posLast = 0;
function syncPositionSharing() {
  var on = S.user && S.user.role === 'responder' && S.user.onDuty && navigator.geolocation;
  if (on && posWatch == null) {
    posWatch = navigator.geolocation.watchPosition(function (p) {
      var now = Date.now(); if (now - posLast < 10000) return; posLast = now;
      api('POST', '/api/me/position', { lat: p.coords.latitude, lng: p.coords.longitude }).catch(function () { /* ignore */ });
    }, function () { /* denied: keep last known position */ }, { enableHighAccuracy: true, maximumAge: 10000 });
  } else if (!on && posWatch != null) { navigator.geolocation.clearWatch(posWatch); posWatch = null; }
}

/* ---------- maps ---------- */
var maps = {};
function mapSlot(uid, cfg) { S.mapCfg[uid] = cfg; return '<div class="mapslot" data-uid="' + uid + '"></div>'; }

function markerHtml(m) {
  if (m.kind === 'responder') return '<span class="mk resp" title="' + esc(m.label) + '">' + esc(initials(m.label.split(' (')[0])) + '</span>';
  if (m.kind === 'me') return '<span class="mk me"></span>';
  if (m.kind === 'draft') return '<span class="mk draft"></span>';
  return '<span class="mk s' + m.sev + (m.resolved ? ' done' : '') + (m.selected ? ' sel' : '') + '">!</span>';
}
function mapClicked(uid, ll) {
  var cfg = S.mapCfg[uid]; if (!cfg || !cfg.selectable) return;
  if (uid === 'home') { S.manual = { lat: ll.lat, lng: ll.lng }; S.useManual = true; render(); toast('Position set manually.'); }
  if (uid === 'rep') { S.draft.lat = ll.lat; S.draft.lng = ll.lng; S.draft.buildingId = nearestBuildingId(ll.lat, ll.lng); render(); }
}
function nearestBuildingId(lat, lng) {
  var best = '', d = 1e18;
  S.cfg.campus.buildings.forEach(function (b) { var k = Math.pow(b.lat - lat, 2) + Math.pow((b.lng - lng) * Math.cos(lat * Math.PI / 180), 2); if (k < d) { d = k; best = b.id; } });
  return best;
}
function leafletMount(slot, uid, cfg) {
  var m = maps[uid];
  if (!m) {
    var div = document.createElement('div'); div.className = 'lmap' + (cfg.tall ? ' tall' : '');
    var c = cfg.center || S.cfg.campus.center;
    var map = L.map(div).setView([c.lat, c.lng], S.cfg.campus.zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    var bl = L.layerGroup().addTo(map);
    S.cfg.campus.buildings.forEach(function (b) {
      L.marker([b.lat, b.lng], { interactive: false, keyboard: false, icon: L.divIcon({ className: '', html: '<div class="blab">' + esc(b.short) + '</div>', iconSize: [90, 14], iconAnchor: [45, 7] }) }).addTo(bl);
    });
    m = maps[uid] = { map: map, div: div, layer: L.layerGroup().addTo(map), fitted: false };
    map.on('click', function (e) { mapClicked(uid, e.latlng); });
  }
  slot.replaceChildren(m.div);
  m.map.invalidateSize();
  m.layer.clearLayers();
  var pts = [];
  (cfg.heat || []).forEach(function (h) {
    L.circle([h.lat, h.lng], { radius: 45, stroke: false, fillColor: getComputedStyle(document.documentElement).getPropertyValue('--heat').trim() || '#e0262f', fillOpacity: 0.1 + 0.05 * h.weight, interactive: false }).addTo(m.layer);
    pts.push([h.lat, h.lng]);
  });
  (cfg.markers || []).forEach(function (mk) {
    var size = mk.kind === 'me' ? 24 : 24;
    var lm = L.marker([mk.lat, mk.lng], { icon: L.divIcon({ className: '', html: markerHtml(mk), iconSize: [size, size], iconAnchor: [size / 2, size / 2] }), title: mk.label || '', keyboard: false }).addTo(m.layer);
    if (mk.id != null) lm.on('click', function () { selectIncident(mk.id); });
    pts.push([mk.lat, mk.lng]);
  });
  if (cfg.fit && !m.fitted && pts.length) { m.map.fitBounds(pts, { padding: [40, 40], maxZoom: 18 }); m.fitted = true; }
  if (cfg.focus && !m.fitted) { m.map.setView([cfg.focus.lat, cfg.focus.lng], S.cfg.campus.zoom); m.fitted = true; }
}
// Plain SVG plot used when the map library cannot load (no internet on campus network).
function svgMount(slot, uid, cfg) {
  var B = S.cfg.campus.buildings, pts = B.slice();
  (cfg.markers || []).forEach(function (m) { pts.push(m); });
  var minLat = Math.min.apply(null, pts.map(function (p) { return p.lat; })), maxLat = Math.max.apply(null, pts.map(function (p) { return p.lat; }));
  var minLng = Math.min.apply(null, pts.map(function (p) { return p.lng; })), maxLng = Math.max.apply(null, pts.map(function (p) { return p.lng; }));
  var dLat = (maxLat - minLat) || 0.001, dLng = (maxLng - minLng) || 0.001;
  function X(lng) { return 40 + (lng - minLng) / dLng * 520; }
  function Y(lat) { return 360 - (lat - minLat) / dLat * 320; }
  var s = '<svg class="map" viewBox="0 0 600 400" role="img" aria-label="Campus plot (map tiles unavailable)"><rect width="600" height="400" fill="var(--map-ground)"/>';
  B.forEach(function (b) { s += '<rect x="' + (X(b.lng) - 32) + '" y="' + (Y(b.lat) - 18) + '" width="64" height="36" rx="3" fill="var(--map-bldg)" stroke="var(--map-bldg-line)"/><text class="blabel" x="' + X(b.lng) + '" y="' + (Y(b.lat) - 23) + '" text-anchor="middle" stroke="var(--map-ground)" stroke-width="3" paint-order="stroke">' + esc(b.short) + '</text>'; });
  (cfg.heat || []).forEach(function (h) { s += '<circle cx="' + X(h.lng) + '" cy="' + Y(h.lat) + '" r="34" fill="var(--heat)" opacity="' + (0.12 + 0.05 * h.weight) + '"/>'; });
  (cfg.markers || []).forEach(function (m) {
    var cx = X(m.lng), cy = Y(m.lat);
    if (m.kind === 'responder') s += '<g transform="translate(' + cx + ' ' + cy + ')"><title>' + esc(m.label) + '</title><rect x="-9" y="-9" width="18" height="18" rx="3" fill="var(--primary)"/><text class="rinit" y="3" text-anchor="middle">' + esc(initials(m.label.split(' (')[0])) + '</text></g>';
    else if (m.kind === 'me') s += '<g transform="translate(' + cx + ' ' + cy + ')"><circle r="12" fill="var(--info)" opacity=".25"/><circle r="6" fill="var(--info)" stroke="var(--surface)" stroke-width="2"/></g>';
    else if (m.kind === 'draft') s += '<g transform="translate(' + cx + ' ' + cy + ')"><circle r="11" fill="none" stroke="var(--sos)" stroke-width="3"/><circle r="3.5" fill="var(--sos)"/></g>';
    else s += '<g class="pin s' + m.sev + (m.resolved ? ' done' : '') + '" transform="translate(' + cx + ' ' + cy + ')" data-act="sel" data-id="' + m.id + '"><title>' + esc(m.label || '') + '</title>' + (m.selected ? '<circle class="ring" r="15"/>' : '') + '<circle class="dot" r="9"/><text y="4" text-anchor="middle">!</text></g>';
  });
  s += '</svg><p class="small muted" style="margin-top:6px">Map tiles could not load, so this is a simple plot of buildings and alerts.</p>';
  slot.innerHTML = s;
  var svg = $('svg', slot);
  if (cfg.selectable) svg.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-act]')) return;
    var r = svg.getBoundingClientRect();
    var px = (e.clientX - r.left) / r.width * 600, py = (e.clientY - r.top) / r.height * 400;
    mapClicked(uid, { lat: minLat + (360 - py) / 320 * dLat, lng: minLng + (px - 40) / 520 * dLng });
  });
}
function mountMaps() {
  document.querySelectorAll('.mapslot').forEach(function (slot) {
    var uid = slot.getAttribute('data-uid'), cfg = S.mapCfg[uid]; if (!cfg) return;
    if (window.L && window.L.map) { try { leafletMount(slot, uid, cfg); return; } catch (e) { console.error('Map error', e); } }
    svgMount(slot, uid, cfg);
  });
}
function incMarker(i) {
  return { id: i.id, lat: i.lat, lng: i.lng, sev: i.severity, resolved: i.status === 'resolved', selected: S.sel === i.id, label: i.label + ' at ' + i.building, kind: 'incident' };
}

/* ---------- data ---------- */
function upsertIncident(inc) {
  var i = S.incidents.findIndex(function (x) { return x.id === inc.id; });
  if (i >= 0) S.incidents[i] = inc; else S.incidents.unshift(inc);
  S.incidents.sort(function (a, b) { return b.id - a.id; });
  if (S.detail[inc.id]) S.detail[inc.id] = Object.assign({}, S.detail[inc.id], inc, { messages: S.detail[inc.id].messages });
}
function upsertBroadcast(b) {
  var i = S.broadcasts.findIndex(function (x) { return x.id === b.id; });
  if (i >= 0) S.broadcasts[i] = b; else S.broadcasts.unshift(b);
  S.broadcasts.sort(function (a, b2) { return b2.id - a.id; });
}
async function loadAll() {
  var r = await Promise.all([api('GET', '/api/me'), api('GET', '/api/incidents'), api('GET', '/api/broadcasts')]);
  S.user = r[0].user; S.contacts = r[0].contacts; S.incidents = r[1].incidents; S.broadcasts = r[2].broadcasts;
  lsSet(LS_USER, JSON.stringify(S.user));
  if (isStaff()) S.responders = (await api('GET', '/api/responders')).responders;
  if (S.user.role === 'admin' && S.tab === 'reports') await loadAnalytics();
  if (myLive().length) startLive();
  syncPositionSharing();
}
async function loadAnalytics() { try { S.analytics = await api('GET', '/api/analytics?days=' + S.analyticsDays); } catch (e) { /* shown empty */ } }
async function loadDetail(id) {
  try { var r = await api('GET', '/api/incidents/' + id); S.detail[id] = r.incident; } catch (e) { /* ignore */ }
}
async function ensureDetails() {
  var ids = (S.tab === 'mine' ? S.incidents : []).filter(function (i) { return !S.detail[i.id] && !S.tried[i.id]; }).slice(0, 20).map(function (i) { return i.id; });
  if (!ids.length) return;
  ids.forEach(function (id) { S.tried[id] = true; });
  await Promise.all(ids.map(loadDetail)); render();
}
async function resync() {
  S.tried = {};
  try { await loadAll(); await flushQueue(); } catch (e) { /* offline or signed out */ }
  render();
}

/* ---------- live stream ---------- */
function connectSSE() {
  closeSSE();
  if (!S.token || isOffline() || !window.EventSource) return;
  var es = new EventSource('/api/stream?token=' + encodeURIComponent(S.token));
  S.sse = es;
  es.onopen = function () { S.sseOk = true; resync(); };
  es.onerror = function () { S.sseOk = false; render(); };
  es.addEventListener('incident', function (e) {
    var d = JSON.parse(e.data), inc = d.incident, known = S.incidents.some(function (x) { return x.id === inc.id; });
    var before = S.incidents.filter(function (x) { return x.id === inc.id; })[0];
    upsertIncident(inc);
    if (isStaff() && !known) { toast('New alert: ' + inc.label + ' at ' + (inc.building || 'unknown location')); beep(); }
    else if (!isStaff() && before && before.status !== inc.status) toast('Your alert is now: ' + SL[inc.status]);
    if (inc.mine && inc.live) startLive();
    render();
  });
  es.addEventListener('message', function (e) {
    var d = JSON.parse(e.data), det = S.detail[d.incidentId];
    if (det) {
      if (!det.messages.some(function (m) { return m.id === d.message.id; })) det.messages.push(d.message);
      var mine = (S.user.role === 'student') === (d.message.role === 'reporter');
      if (!mine) toast('New message from ' + d.message.label);
      render();
    } else { loadDetail(d.incidentId).then(render); }
  });
  es.addEventListener('broadcast', function (e) {
    var b = JSON.parse(e.data).broadcast, isNew = !S.broadcasts.some(function (x) { return x.id === b.id; });
    upsertBroadcast(b);
    if (isNew) { toast('New broadcast: ' + b.title); if (S.user.role !== 'admin') beep(); }
    render();
  });
  es.addEventListener('responders', function (e) { S.responders = JSON.parse(e.data).responders; render(); });
}
function closeSSE() { if (S.sse) { S.sse.close(); S.sse = null; } S.sseOk = false; }

/* ---------- incidents: create, queue, flush ---------- */
function smsTextFor(p) {
  var cat = String(p.category).toUpperCase();
  return 'SC ' + cat + (p.buildingId ? ' ' + p.buildingId : '') + (p.lat != null ? ' ' + p.lat.toFixed(5) + ',' + p.lng.toFixed(5) : '') + (p.description ? ' ' + p.description.replace(/\s+/g, ' ').slice(0, 100) : '');
}
async function submitIncident(payload) {
  payload.clientId = uuid(); payload.createdAt = Date.now();
  try {
    var r = await api('POST', '/api/incidents', payload);
    upsertIncident(r.incident); S.detail[r.incident.id] = r.incident;
    if (r.incident.mine && r.incident.live) startLive();
    return { sent: true, incident: r.incident };
  } catch (e) {
    if (!e.offline) throw e;
    var item = { clientId: payload.clientId, payload: payload, queuedAt: Date.now(), userId: S.user.id, sms: payload.anonymous ? null : smsTextFor(payload) };
    await queuePut(item);
    return { sent: false, queued: item };
  }
}
var flushing = false;
async function flushQueue() {
  if (flushing || isOffline() || !S.user) return;
  flushing = true;
  var sent = 0;
  try {
    var items = myQueue().sort(function (a, b) { return a.queuedAt - b.queuedAt; });
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      try {
        var r = await api('POST', '/api/incidents', it.payload);
        await queueDel(it.clientId); upsertIncident(r.incident); sent++;
        if (r.incident.mine && r.incident.live) startLive();
      } catch (e) {
        if (e.offline || e.status === 401 || e.status >= 500 || e.status === 429) break;
        await queueDel(it.clientId); toast('A saved report was rejected: ' + e.message);
      }
    }
  } finally { flushing = false; }
  if (sent) { toast(sent + ' saved ' + (sent > 1 ? 'reports were' : 'report was') + ' sent.'); render(); }
}
setInterval(function () { if (myQueue().length) flushQueue(); }, 20000);

/* ---------- auth ---------- */
async function afterLogin(r) {
  S.token = r.token; S.user = r.user; lsSet(LS_TOKEN, r.token); lsSet(LS_USER, JSON.stringify(r.user));
  S.authErr = ''; S.tab = TABS[r.user.role][0][0]; S.sel = null; S.detail = {};
  try { await loadAll(); } catch (e) { /* shown below */ }
  connectSSE(); flushQueue(); render();
}
function signOut() {
  closeSSE(); S.token = null; S.user = null; S.incidents = []; S.detail = {}; S.broadcasts = []; S.responders = []; S.analytics = null;
  lsSet(LS_TOKEN, null); lsSet(LS_USER, null);
  if (posWatch != null && navigator.geolocation) { navigator.geolocation.clearWatch(posWatch); posWatch = null; }
  Object.keys(maps).forEach(function (k) { try { maps[k].map.remove(); } catch (e) { /* ignore */ } delete maps[k]; });
}

/* ---------- views ---------- */
function sevPill(n) { return '<span class="pill s' + n + '">' + SEVL[n] + '</span>'; }
function stPill(s) { return '<span class="pill st-' + (s === 'enroute' ? 'enroute' : s) + '">' + SL[s] + '</span>'; }
function histAt(inc, st) { var h = (inc.history || []).filter(function (x) { return x.status === st; })[0]; return h ? h.at : null; }
function stepper(inc) {
  var cur = FLOW.indexOf(inc.status);
  return '<ol class="steps" aria-label="Status">' + FLOW.map(function (s, i) {
    var at = histAt(inc, s), cls = at ? 'done' : (i === cur + 1 ? 'next' : '');
    return '<li class="' + cls + '"><b>' + SL[s] + '</b><time>' + (at ? tf.format(at) : 'not yet') + '</time></li>';
  }).join('') + '</ol>';
}
function chatHTML(inc, canSend) {
  var det = S.detail[inc.id], msgs = det ? det.messages : null, as = isStaff() ? 'responder' : 'reporter';
  var body = msgs == null ? '<p class="muted small">Loading messages…</p>' : (msgs.length ? msgs.map(function (m) {
    return '<div class="msg ' + (m.role === as ? 'me' : '') + '"><span>' + esc(m.label) + '</span><p>' + esc(m.body) + '</p><time>' + tf.format(m.at) + '</time></div>';
  }).join('') : '<p class="muted small">No messages yet.</p>');
  var form = '';
  if (inc.status === 'resolved') form = '<p class="muted small">This case is resolved. The chat is closed.</p>';
  else if (canSend) form = '<div class="chatform"><input type="text" id="chat-' + inc.id + '" data-keep placeholder="Write a message" aria-label="Message" autocomplete="off" maxlength="1000"><button class="btn primary" data-act="send" data-id="' + inc.id + '">Send</button></div>';
  return '<div class="chat" data-chat="' + inc.id + '" aria-live="polite">' + body + '</div>' + form;
}
function authView() {
  var cfg = S.cfg, reg = S.authMode === 'register';
  return '<div class="wrap">' + testbar() + '<div class="auth"><div class="hero"><img class="hero-logo" src="/logo.png" width="150" height="150" alt="Pundra University of Science &amp; Technology logo, established 2001, Bogura" fetchpriority="high"><h1>' + esc(cfg.name) + '</h1><p class="uni">Pundra University of Science &amp; Technology</p><p class="tag-line">Emergency response and campus safety</p></div>' +
    '<section class="panel"><div class="seg" role="group" aria-label="Sign in or create account"><button data-act="authmode" data-v="login" aria-pressed="' + !reg + '">Sign in</button><button data-act="authmode" data-v="register" aria-pressed="' + reg + '">Create account</button></div>' +
    '<form id="authForm" autocomplete="on">' +
    (reg ? '<label class="field">Full name<input type="text" id="a-name" data-keep autocomplete="name" required maxlength="80"></label><label class="field">Student or staff ID <span class="hint">(optional)</span><input type="text" id="a-sid" data-keep maxlength="30"></label><label class="field">Phone <span class="hint">(optional)</span><input type="tel" id="a-phone" data-keep autocomplete="tel" maxlength="24"></label>' : '') +
    '<label class="field">Email<input type="email" id="a-email" data-keep autocomplete="email" required></label>' +
    '<label class="field">Password' + (reg ? ' <span class="hint">(at least 8 characters)</span>' : '') + '<input type="password" id="a-pass" data-keep autocomplete="' + (reg ? 'new-password' : 'current-password') + '" required minlength="' + (reg ? 8 : 1) + '"></label>' +
    '<p class="err" role="alert">' + esc(S.authErr) + '</p><button class="btn primary" type="submit"' + (S.busy ? ' disabled' : '') + '>' + (reg ? 'Create account' : 'Sign in') + '</button></form></section>' +
    (cfg.demoAccounts.length ? '<section class="panel"><h3>Try a demo account</h3><p class="muted small">One tap fills in the sign-in. Demo accounts only exist while demo mode is on.</p><div class="demo">' +
      cfg.demoAccounts.map(function (d, i) { return '<button class="btn small" data-act="demo" data-i="' + i + '">' + esc(d.label) + '</button>'; }).join('') + '</div></section>' : '') +
    '</div></div>';
}
function logoImg(px) { return '<img class="logo" src="/logo-128.png" srcset="/logo-128.png 1x, /logo-256.png 2x" width="' + px + '" height="' + px + '" alt="Pundra University of Science &amp; Technology logo" decoding="async">'; }
function shieldSvg() { return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M12 8v5M12 16v.01"/></svg>'; }
function testbar() {
  return S.cfg.testMode ? '<div class="testbar"><strong>Prototype · Test mode</strong><span>No real SMS is sent and no emergency service (such as 999) is ever contacted.</span></div>' : '';
}

var V = {};
V.home = function () {
  var open = S.incidents.filter(function (i) { return i.status !== 'resolved'; }), me = myMapPos();
  var markers = me ? [{ kind: 'me', lat: me.lat, lng: me.lng }] : [];
  var src = S.useManual && S.manual ? 'Manual position (tap the map to move it)' : (S.gps ? 'GPS, accuracy about ' + S.gps.acc + ' m' : 'Not known yet');
  var contacts;
  if (S.editContacts) {
    contacts = S.editContacts.map(function (c, i) {
      return '<div class="inline-form"><label class="field">Name<input type="text" id="cn-' + i + '" data-keep data-ct="name" data-i="' + i + '" value="' + esc(c.name) + '" maxlength="60"></label><label class="field">Phone<input type="tel" id="cp-' + i + '" data-keep data-ct="phone" data-i="' + i + '" value="' + esc(c.phone) + '" maxlength="24"></label><button class="btn small" data-act="ctdel" data-i="' + i + '">Remove</button></div>';
    }).join('') + '<div class="row2"><button class="btn small" data-act="ctadd"' + (S.editContacts.length >= 5 ? ' disabled' : '') + '>Add contact</button><button class="btn primary small" data-act="ctsave">Save contacts</button><button class="btn small" data-act="ctcancel">Cancel</button></div>';
  } else {
    contacts = (S.contacts.length ? S.contacts.map(function (c) { return '<div class="contact"><span>' + esc(c.name) + '</span><span class="mono muted">' + esc(c.phone) + '</span></div>'; }).join('') : '<p class="muted small">No emergency contacts yet. Add someone who should be told when you send an SOS.</p>') +
      '<div><button class="btn small" data-act="ctedit">' + (S.contacts.length ? 'Edit contacts' : 'Add contacts') + '</button></div>';
  }
  return '<div class="stack">' +
    '<section class="welcome">' + logoImg(64) + '<div><h2>Welcome, ' + esc(String(S.user.name || '').split(' ')[0]) + '</h2><p>Pundra University of Science &amp; Technology · <em>Learn for Life</em></p></div></section>' +
    '<section class="panel sos-panel"><div class="sos-copy"><h2>Need help now?</h2><p>Hold the red button for 1.5 seconds. You can cancel for 5 seconds.</p>' +
    (open.length ? '<button class="btn" data-act="tab" data-v="mine">' + open.length + ' open alert' + (open.length > 1 ? 's' : '') + ': view status</button>' : '') +
    '<details class="fine"><summary>What does SOS send?</summary><p class="muted small">Your name and ID, your live location and the time go to the Security Desk and ' + S.contacts.length + ' emergency contact' + (S.contacts.length === 1 ? '' : 's') + '. Location is shared only while the alert is open.</p></details></div>' +
    '<div class="sos-wrap"><div class="sos-ring"></div><button id="sosBtn" class="sos-btn" aria-label="Hold to send SOS"><span>SOS</span><small>Hold to send</small></button></div></section>' + noticeHTML() +
    '<section class="panel"><h3>Something else happened?</h3><div class="tiles">' +
    REPORT_CATS.map(function (k) { var c = S.cfg.categories[k]; return '<button class="tile" data-act="quick" data-v="' + k + '"><span class="tdot s' + c.severity + '"></span><b>' + esc(c.label) + '</b><small>' + esc(CAT_HINT[k] || '') + '</small></button>'; }).join('') + '</div></section>' +
    '<div class="grid2"><section class="panel"><h3>Where you are</h3><p class="muted small">' + esc(src) + '</p>' + mapSlot('home', { markers: markers, selectable: true, fit: true, focus: me }) +
    '<div class="row2"><button class="btn small" data-act="usegps">Use my GPS</button>' + (S.manual ? '<button class="btn small" data-act="togglemanual">' + (S.useManual ? 'Switch to GPS' : 'Use manual position') + '</button>' : '') + '</div>' +
    '<p class="muted small">No GPS? Tap the map to set your position by hand.</p></section>' +
    '<section class="panel"><h3>Your emergency contacts</h3>' + contacts + '</section></div></div>';
};

V.report = function () {
  var d = S.draft, c = S.cfg.categories[d.category], blds = S.cfg.campus.buildings;
  var routed = c.teams.map(function (t) { return S.cfg.teams[t]; }).join(' and ');
  var anon = c.sensitive ?
    '<div class="note"><label class="sw"><input type="checkbox" id="anon"' + (d.anonymous ? ' checked' : '') + '><span class="track"></span><span class="lbl"><b>Report anonymously</b></span></label><p class="small" style="margin-top:6px">' +
    (d.anonymous ? 'Your name, ID and device location are not attached. Responders see a random alias and can still reply in the chat. Photos are re-saved without hidden location data.' : 'Anonymous reporting is available for this category. Turn it on to hide your name and ID.') + '</p></div>' :
    '<p class="muted small">Your name and ID go to responders for this category.</p>';
  var media = d.media.length ? '<div class="thumbs">' + d.media.map(function (m, i) {
    return '<figure>' + (m.type.indexOf('image') === 0 ? '<img src="' + esc(m.preview) + '" alt="' + esc(m.name) + '">' : '<span class="filechip">Video</span>') + '<figcaption>' + esc(m.name) + '</figcaption><button class="btn small" data-act="rmmedia" data-i="' + i + '">Remove</button></figure>';
  }).join('') + '</div>' : '';
  var center = S.cfg.campus.center, pin = d.lat != null ? { kind: 'draft', lat: d.lat, lng: d.lng } : null;
  var offNote = isOffline() ? '<div class="queued-note small">You are offline. This report will be saved on your device and sent when you are back online.</div>' : '';
  var locDone = d.lat != null, locName = d.buildingId ? (blds.filter(function (b) { return b.id === d.buildingId; })[0] || {}).name : '';
  return '<div class="flow">' +
    '<section class="panel step"><h2><span class="n">1</span>What is it about?</h2><div class="tiles tiles-sm" role="group" aria-label="Category">' + REPORT_CATS.map(function (k) {
      var cc = S.cfg.categories[k];
      return '<button class="tile" aria-pressed="' + (k === d.category) + '" data-act="cat" data-v="' + k + '"><span class="tdot s' + cc.severity + '"></span><b>' + esc(cc.label) + '</b></button>'; }).join('') + '</div>' +
      '<p class="small muted">Goes to <b>' + esc(routed) + '</b>. Priority ' + sevPill(c.severity) + '</p></section>' +
    '<section class="panel step"><h2><span class="n">2</span>Where is it?</h2>' +
      '<button class="btn primary" data-act="useloc"' + (d.anonymous && c.sensitive ? ' disabled' : '') + '>Use my current location</button>' +
      (d.anonymous && c.sensitive ? '<p class="muted small">Turned off for anonymous reports so your own position is not revealed.</p>' : '') +
      '<label class="field">Or pick a building<select id="bld"><option value="">Choose a building</option>' + blds.map(function (b) { return '<option value="' + b.id + '"' + (b.id === d.buildingId ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field">Room or spot <span class="hint">Optional</span><input type="text" id="room" data-draft="room" value="' + esc(d.room) + '" maxlength="80" placeholder="For example Lab 3, level 2"></label>' +
      mapSlot('rep', { markers: pin ? [pin] : [], selectable: true, focus: pin || center }) +
      '<p class="small ' + (locDone ? '' : 'muted') + '">' + (locDone ? 'Pin set' + (locName ? ' near <b>' + esc(locName) + '</b>' : '') + '. Tap the map to move it.' : 'Tap the map to drop a pin if you do not use the buttons above.') + '</p></section>' +
    '<section class="panel step"><h2><span class="n">3</span>What happened?</h2>' + anon +
      '<label class="field">Short description<textarea id="desc" data-draft="desc" maxlength="2000" placeholder="What you see and who needs help">' + esc(d.desc) + '</textarea></label>' +
      '<label class="field">Photo or video <span class="hint">Optional. Up to 3 files. Videos up to 5 MB.</span><input type="file" id="media" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" multiple></label>' + media + '</section>' +
    '<div class="sendbar">' + offNote + '<button class="btn sos big" data-act="submit"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Sending…' : 'Send report') + '</button></div></div>';
};

V.mine = function () {
  var list = S.incidents, q = myQueue();
  if (!list.length && !q.length) return '<div class="empty"><h3>No alerts yet</h3><p>Alerts and reports you send appear here with live status, timestamps and a chat with the responder.</p><p style="margin-top:12px"><button class="btn primary" data-act="tab" data-v="home">Go to Home</button></p></div>';
  var queued = q.map(function (it) {
    var p = it.payload, cat = S.cfg.categories[p.category];
    return '<section class="panel"><div class="spread"><div class="row2"><h3>' + esc(cat.label) + '</h3>' + sevPill(cat.severity) + stPill('queued') + '</div><span class="mono muted small">' + tf.format(it.queuedAt) + '</span></div>' +
      (p.description ? '<p>' + esc(p.description) + '</p>' : '') +
      '<div class="queued-note"><b>' + (isOffline() ? 'No connection.' : 'Waiting to send.') + '</b> This is saved on your device and sends by itself when you are back online.' +
      '<div class="row2" style="margin-top:8px"><button class="btn small" data-act="retry">Try now</button>' + (it.sms ? '<button class="btn small" data-act="sms" data-id="' + esc(it.clientId) + '">' + (S.sms[it.clientId] ? 'Hide SMS text' : 'Prepare SMS instead') + '</button>' : '') + '</div></div>' +
      (it.sms && S.sms[it.clientId] ? '<div class="sms"><span class="small muted">Send this text to <b>' + esc(S.cfg.smsNumber) + '</b></span><code>' + esc(it.sms) + '</code><button class="btn small" data-act="copysms" data-id="' + esc(it.clientId) + '">Copy text</button></div>' : '') + '</section>';
  }).join('');
  return '<div class="stack">' + queued + list.map(function (inc) {
    var loc = inc.category === 'sos' ? (inc.live ? '<div class="note ok small">Live location is shared with security until this alert is resolved.</div>' : (inc.hasLoc ? '<div class="note small">Location sharing has stopped.</div>' : '<div class="note warn small">No location was shared.</div>')) : '';
    return '<section class="panel"><div class="spread"><div class="row2"><h3>' + esc(inc.label) + '</h3>' + sevPill(inc.severity) + stPill(inc.status) + '</div><span class="mono muted small">' + esc(inc.ref) + ' · ' + tf.format(inc.reportedAt) + '</span></div>' +
      '<p class="small muted">' + esc(inc.building || 'Location not shared') + (inc.room ? ', ' + esc(inc.room) : '') + (inc.anonymous ? ' · Anonymous as ' + esc(inc.alias) : '') + '</p>' +
      (inc.description ? '<p>' + esc(inc.description) + '</p>' : '') + mediaThumbs(inc) + loc + stepper(inc) +
      (inc.assignee ? '<p class="small">Responder: <b>' + esc(inc.assignee.name) + '</b> (' + esc(S.cfg.teams[inc.assignee.team] || '') + ')</p>' : '') + chatHTML(inc, true) + '</section>';
  }).join('') + '</div>';
};
function mediaThumbs(inc) {
  if (!inc.media || !inc.media.length) return '';
  return '<div class="thumbs">' + inc.media.map(function (m) {
    var u = m.url + '?token=' + encodeURIComponent(S.token);
    return '<figure>' + (m.kind === 'image' ? '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="' + esc(m.name) + '"></a>' : '<a class="filechip" href="' + esc(u) + '" target="_blank" rel="noopener">Open video</a>') + '<figcaption>' + esc(m.name) + '</figcaption></figure>';
  }).join('') + '</div>';
}

V.directory = function () {
  return '<section class="panel"><h2>Campus emergency directory</h2><p class="muted small">' + (S.cfg.testMode ? 'Test mode: the Call button opens a test screen and no call is placed.' : 'Tap Call to dial from your phone.') + '</p>' +
    S.cfg.directory.map(function (d, i) {
      return '<div class="contact" style="align-items:center"><div><b>' + esc(d.name) + '</b><div class="muted small">' + esc(d.role) + '</div></div><div class="row2"><span class="mono">' + esc(d.phone) + '</span>' +
        (S.cfg.testMode ? '<button class="btn primary small" data-act="call" data-i="' + i + '">Call</button>' : '<a class="btn primary small" href="tel:' + esc(d.phone.replace(/[^+\d]/g, '')) + '">Call</a>') + '</div></div>';
    }).join('') + '</section>';
};

function bcastCard(b) {
  var pct = b.audience ? Math.min(100, Math.round(b.reads / b.audience * 100)) : 0, admin = S.user.role === 'admin';
  var lvl = { info: 'Information', drill: 'Drill', warning: 'Warning' }[b.level];
  return '<article class="bcast ' + b.level + (!admin && !b.meRead ? ' unread' : '') + '"><header><div class="row2"><h3>' + esc(b.title) + '</h3><span class="pill ' + (b.level === 'warning' ? 's3' : b.level === 'drill' ? 'st-reported' : 's1') + '">' + lvl + '</span></div><span class="mono muted small">' + tf.format(b.at) + ' · ' + ago(b.at) + '</span></header><p>' + esc(b.body) + '</p>' +
    (!admin ? (b.meRead ? '<p class="small" style="color:var(--ok)"><b>Read confirmed.</b> Security can see you have read this.</p>' : '<div><button class="btn primary" data-act="read" data-id="' + b.id + '">Confirm I have read this</button></div>') :
      '<div><div class="progress" role="img" aria-label="' + pct + ' percent read"><i style="width:' + pct + '%"></i></div><p class="small muted" style="margin-top:4px">Read by ' + b.reads.toLocaleString() + ' of ' + b.audience.toLocaleString() + ' users (' + pct + '%)</p></div>') + '</article>';
}
V.bcast = function () {
  var admin = S.user.role === 'admin', c = S.compose;
  var compose = admin ? '<section class="panel"><h2>Send a broadcast</h2><p class="muted small">Goes to every student and responder right away. Each person confirms they have read it.</p>' +
    '<div class="row2">' + Object.keys(TEMPLATES).map(function (k) { return '<button class="chip" data-act="tmpl" data-v="' + k + '">' + esc(TEMPLATES[k].title) + '</button>'; }).join('') + '</div>' +
    '<label class="field">Title<input type="text" id="btitle" data-compose="title" value="' + esc(c.title) + '" maxlength="120"></label>' +
    '<label class="field">Message<textarea id="bbody" data-compose="body" maxlength="1000">' + esc(c.body) + '</textarea></label>' +
    '<label class="field">Type<select id="blevel" data-compose="level">' + [['info', 'Information'], ['drill', 'Drill'], ['warning', 'Warning']].map(function (o) { return '<option value="' + o[0] + '"' + (c.level === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
    '<div><button class="btn sos" data-act="bsend">Send to all users</button></div></section>' : '';
  var list = S.broadcasts.map(bcastCard).join('');
  return '<div class="stack">' + compose + '<section class="stack"><h2>' + (admin ? 'Sent broadcasts' : 'Broadcasts from the security office') + '</h2>' + (list || '<div class="empty">No broadcasts yet.</div>') + '</section></div>';
};

function visible() {
  var myTeam = S.user.role === 'responder' ? S.user.team : null;
  return S.incidents.filter(function (i) {
    if (!S.filter.resolved && i.status === 'resolved') return false;
    if (myTeam && S.filter.team && i.teams.indexOf(myTeam) < 0) return false;
    return true;
  }).sort(function (a, b) {
    var ra = a.status === 'resolved' ? 1 : 0, rb = b.status === 'resolved' ? 1 : 0;
    if (ra !== rb) return ra - rb;
    if (a.severity !== b.severity) return b.severity - a.severity;
    return a.reportedAt - b.reportedAt;
  });
}
function ackMs(i) { var r = histAt(i, 'reported'), a = histAt(i, 'acknowledged'); return r && a ? a - r : null; }
function detailHTML(inc) {
  var admin = S.user.role === 'admin', asg = inc.assignee, uid = S.user.id;
  var rep = inc.anonymous ? '<b>Anonymous reporter</b><br><span class="muted small">Identity hidden. Alias ' + esc(inc.alias) + '</span>' : (inc.reporter ? esc(inc.reporter.name) + '<br><span class="muted small mono">ID ' + esc(inc.reporter.studentId || 'n/a') + (inc.reporter.phone ? ' · ' + esc(inc.reporter.phone) : '') + '</span>' : (inc.source === 'sms' ? 'Unknown (SMS)' : 'Unknown'));
  var loc = inc.hasLoc ? esc(inc.building) + (inc.room ? ', ' + esc(inc.room) : '') + '<br><span class="small mono muted">' + inc.lat.toFixed(5) + ', ' + inc.lng.toFixed(5) + '</span>' + (inc.live ? '<br><span class="small" style="color:var(--ok)">Live location, updating</span>' : '') : '<span class="muted">Not shared</span>';
  var actions = '';
  if (admin) {
    actions = '<label class="field">Assign to<select id="assign"><option value="">Unassigned</option>' + S.responders.map(function (r) { return '<option value="' + r.id + '"' + (asg && asg.id === r.id ? ' selected' : '') + '>' + esc(r.name) + ' (' + esc(S.cfg.teams[r.team]) + ')' + (r.onDuty ? '' : ', off duty') + '</option>'; }).join('') + '</select></label>' +
      (inc.nearest ? '<p class="small muted">Nearest on-duty responder: <b>' + esc(inc.nearest.name) + '</b>, about ' + inc.nearest.meters + ' m away. <button class="btn small" data-act="assignnear" data-id="' + inc.id + '">Assign nearest</button></p>' : '');
  } else if (inc.status !== 'resolved') {
    var other = asg && asg.id !== uid, next = { reported: 'Acknowledge', acknowledged: 'On the way', enroute: 'Mark resolved' }[inc.status];
    actions = '<div class="row2">' + (!asg ? '<button class="btn" data-act="assignme" data-id="' + inc.id + '">Assign to me</button>' : '') + '<button class="btn primary" data-act="adv" data-id="' + inc.id + '"' + (other ? ' disabled' : '') + '>' + next + '</button></div>' +
      (other ? '<p class="small muted">Assigned to ' + esc(asg.name) + '.</p>' : '') + (inc.nearest && !asg ? '<p class="small muted">Nearest on-duty responder: <b>' + esc(inc.nearest.name) + '</b>, about ' + inc.nearest.meters + ' m away.</p>' : '');
  }
  return '<section class="panel" id="detail"><div class="spread"><div class="row2"><h2>' + esc(inc.label) + '</h2>' + sevPill(inc.severity) + stPill(inc.status) + '</div><span class="mono muted small">' + esc(inc.ref) + '</span></div>' +
    '<dl class="facts"><div><dt>Reporter</dt><dd>' + rep + '</dd></div><div><dt>Location</dt><dd>' + loc + '</dd></div><div><dt>Reported</dt><dd class="mono">' + tf.format(inc.reportedAt) + '<br><span class="muted small">' + ago(inc.reportedAt) + (inc.source === 'sms' ? ' · via SMS' : '') + '</span></dd></div>' +
    '<div><dt>Assigned</dt><dd>' + (asg ? esc(asg.name) : '<span class="muted">Nobody yet</span>') + '</dd></div><div><dt>Routed to</dt><dd>' + inc.teams.map(function (t) { return esc(S.cfg.teams[t]); }).join(', ') + '</dd></div></dl>' +
    (inc.description ? '<p>' + esc(inc.description) + '</p>' : '') + mediaThumbs(inc) + actions + stepper(inc) + '<h3>Chat with reporter</h3>' + chatHTML(inc, !admin) + '</section>';
}
V.dash = function () {
  var vis = visible(), all = S.incidents, open = all.filter(function (i) { return i.status !== 'resolved'; }), unack = all.filter(function (i) { return i.status === 'reported'; });
  var acks = all.map(ackMs).filter(function (v) { return v != null; }), avg = acks.length ? acks.reduce(function (a, b) { return a + b; }, 0) / acks.length : null;
  var sel = S.sel != null ? S.detail[S.sel] || all.filter(function (i) { return i.id === S.sel; })[0] : null;
  var markers = vis.filter(function (i) { return i.hasLoc; }).map(incMarker).concat(S.responders.filter(function (r) { return r.onDuty && r.lat != null; }).map(function (r) { return { kind: 'responder', lat: r.lat, lng: r.lng, label: r.name + ' (' + S.cfg.teams[r.team] + ')' }; }));
  var myTeam = S.user.role === 'responder' ? S.user.team : null;
  var filters = '<div class="row2">' + (myTeam ? '<label class="sw"><input type="checkbox" id="fteam"' + (S.filter.team ? ' checked' : '') + '><span class="track"></span><span class="lbl">Only ' + esc(S.cfg.teams[myTeam]) + '</span></label>' : '') +
    '<label class="sw"><input type="checkbox" id="fres"' + (S.filter.resolved ? ' checked' : '') + '><span class="track"></span><span class="lbl">Show resolved</span></label></div>';
  var rows = vis.length ? vis.map(function (i) {
    return '<button class="irow' + (i.status === 'resolved' ? ' done' : '') + '" data-act="sel" data-id="' + i.id + '" aria-current="' + (S.sel === i.id) + '"><span class="head"><b>' + esc(i.label) + '</b>' + sevPill(i.severity) + stPill(i.status) + '</span>' +
      '<span class="meta">' + esc(i.hasLoc ? i.building + (i.room ? ', ' + i.room : '') : 'Location not shared') + ' · ' + ago(i.reportedAt) + ' · ' + (i.anonymous ? 'Anonymous' : esc(i.reporter ? i.reporter.name : 'Unknown')) + (i.assignee ? ' · ' + esc(i.assignee.name) : ' · Unassigned') + '</span></button>';
  }).join('') : '<div class="empty">No alerts match these filters.</div>';
  return '<div class="stack"><div class="stats"><div class="stat"><b>' + open.length + '</b><span>Open alerts</span></div><div class="stat"><b style="color:' + (unack.length ? 'var(--s4)' : 'inherit') + '">' + unack.length + '</b><span>Waiting for acknowledgement</span></div><div class="stat"><b>' + (avg == null ? 'n/a' : fmtDur(avg)) + '</b><span>Average time to acknowledge</span></div></div>' +
    '<div class="dash"><section class="panel"><div class="spread"><h3>Live map</h3>' + filters + '</div>' + mapSlot('dash', { markers: markers, fit: true, tall: true }) +
    '<div class="legend"><span><i style="background:var(--s4)"></i>Critical</span><span><i style="background:var(--s3)"></i>High</span><span><i style="background:var(--s2)"></i>Moderate</span><span><i style="background:var(--s1)"></i>Low</span><span><i style="background:var(--primary);border-radius:2px"></i>Responder on duty</span></div></section>' +
    '<section class="panel"><h3>Alerts by severity, oldest first</h3><div class="list">' + rows + '</div></section></div>' +
    (sel ? detailHTML(sel) : '<div class="empty">Select an alert on the map or in the list to assign it, update its status and chat with the reporter.</div>') + '</div>';
};

V.reports = function () {
  var a = S.analytics;
  var range = '<div class="seg" role="group" aria-label="Time range">' + [7, 30, 90].map(function (d) { return '<button data-act="days" data-v="' + d + '" aria-pressed="' + (S.analyticsDays === d) + '">Last ' + d + ' days</button>'; }).join('') + '</div>';
  if (!a) return '<div class="stack"><div>' + range + '</div><div class="empty">Loading reports…</div></div>';
  function bars(obj, labelFn, keepOrder) {
    var keys = Object.keys(obj); if (!keepOrder) keys.sort(function (x, y) { return obj[y] - obj[x]; });
    var max = Math.max.apply(null, keys.map(function (k) { return obj[k]; }).concat([1]));
    return keys.length ? '<div class="bars">' + keys.map(function (k) { return '<div class="bar"><span>' + esc(labelFn ? labelFn(k) : k) + '</span><span class="track"><i style="width:' + Math.round(obj[k] / max * 100) + '%"></i></span><b>' + obj[k] + '</b></div>'; }).join('') + '</div>' : '<p class="muted">No incidents in this range.</p>';
  }
  var days = {}, now = new Date();
  for (var i = 13; i >= 0; i--) { var d = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10); days[d] = a.byDay[d] || 0; }
  var heat = a.heat.map(function (h) { return { lat: h.lat, lng: h.lng, weight: h.weight }; });
  return '<div class="stack"><div>' + range + '</div><div class="stats"><div class="stat"><b>' + a.total + '</b><span>Incidents recorded</span></div><div class="stat"><b>' + a.resolved + '</b><span>Resolved</span></div><div class="stat"><b>' + (a.avgAckMs == null ? 'n/a' : fmtDur(a.avgAckMs)) + '</b><span>Average time to acknowledge</span></div><div class="stat"><b>' + (a.avgResolveMs == null ? 'n/a' : fmtDur(a.avgResolveMs)) + '</b><span>Average time to resolve</span></div></div>' +
    '<div class="grid2"><section class="panel"><h3>Incidents by category</h3>' + bars(a.byCategory, function (k) { return S.cfg.categories[k] ? S.cfg.categories[k].label : k; }) + '</section><section class="panel"><h3>Incidents by location</h3>' + bars(a.byBuilding) + '</section></div>' +
    '<section class="panel"><h3>Incidents per day, last 14 days</h3>' + bars(days, function (k) { return k.slice(5); }, true) + '</section>' +
    '<section class="panel"><h3>Incident heat map</h3><p class="muted small">Darker areas have more or more serious incidents.</p>' + mapSlot('heat', { heat: heat, fit: true, tall: true }) + '</section></div>';
};

V.resp = function () {
  return '<div class="stack"><section class="panel"><h2>Responders</h2><div class="tablewrap"><table><thead><tr><th>Name</th><th>Team</th><th>Open cases</th><th>On duty</th></tr></thead><tbody>' +
    S.responders.map(function (r) {
      return '<tr><td>' + esc(r.name) + '<div class="muted small">' + esc(r.email) + '</div></td><td>' + esc(S.cfg.teams[r.team]) + '</td><td class="mono">' + r.openCases + '</td><td><label class="sw"><input type="checkbox" data-act="duty" data-id="' + r.id + '"' + (r.onDuty ? ' checked' : '') + '><span class="track"></span><span class="lbl">' + (r.onDuty ? 'On duty' : 'Off duty') + '</span></label></td></tr>';
    }).join('') + '</tbody></table></div></section>' +
    '<section class="panel"><h3>Add a responder</h3><form id="respForm"><div class="inline-form"><label class="field">Name<input type="text" id="rname" data-keep required maxlength="80"></label><label class="field">Email<input type="email" id="remail" data-keep required></label><label class="field">Temporary password<input type="password" id="rpass" data-keep required minlength="8" autocomplete="new-password"></label>' +
    '<label class="field">Team<select id="rteam">' + Object.keys(S.cfg.teams).map(function (t) { return '<option value="' + t + '">' + esc(S.cfg.teams[t]) + '</option>'; }).join('') + '</select></label></div><p class="err" id="respErr" role="alert"></p><div><button class="btn primary" type="submit">Add responder</button></div></form></section></div>';
};

/* ---------- shell ---------- */
var app = $('#app');
function noticeHTML() {
  if (!S.user || S.user.role === 'admin') return '';
  var u = S.broadcasts.filter(function (b) { return !b.meRead; })[0];
  if (!u) return '';
  return '<div class="notice ' + u.level + '"><div class="nt"><b>' + esc(u.title) + '</b><span>' + esc(u.body) + '</span></div><div class="row2"><button class="btn small" data-act="tab" data-v="bcast">Open</button><button class="btn small primary" data-act="read" data-id="' + u.id + '">I have read this</button></div></div>';
}
function unreadCount() { return S.user.role === 'admin' ? 0 : S.broadcasts.filter(function (b) { return !b.meRead; }).length; }
function shell() {
  var role = S.user.role, tabs = TABS[role];
  if (!tabs.some(function (t) { return t[0] === S.tab; })) S.tab = tabs[0][0];
  var unread = unreadCount(), q = myQueue().length, banner = '';
  if (role !== 'admin' && S.tab !== 'bcast' && S.tab !== 'home') banner = noticeHTML();
  var off = isOffline() ? '<div class="note warn syncbar"><b>You are offline' + (S.simOffline ? ' (simulated)' : '') + '.</b> Reports and SOS alerts are saved on this device and sent when the connection returns.' + (q ? ' ' + q + ' waiting.' : '') + '</div>' : (q ? '<div class="note syncbar">' + q + ' saved report' + (q > 1 ? 's' : '') + ' waiting to send. <button class="btn small" data-act="retry">Send now</button></div>' : '');
  var duty = role === 'responder' ? '<label class="sw"><input type="checkbox" id="duty"' + (S.user.onDuty ? ' checked' : '') + '><span class="track"></span><span class="lbl">' + (S.user.onDuty ? 'On duty' : 'Off duty') + '</span></label>' : '';
  return '<div class="wrap">' + testbar() +
    '<div class="top"><div class="brand">' + logoImg(52) + '<div><h1>' + esc(S.cfg.name) + '</h1><p>Pundra University of Science &amp; Technology</p></div></div>' +
    '<div class="ctl"><span class="userbox"><span title="' + (S.sseOk ? 'Live updates connected' : 'Not connected for live updates') + '"><span class="status-dot' + (S.sseOk ? ' on' : '') + '"></span>' + (S.sseOk ? 'Live' : 'Connecting') + '</span><span><b>' + esc(S.user.name) + '</b> · ' + esc(role === 'responder' ? (S.cfg.teams[S.user.team] || 'Responder') : role) + '</span></span>' + duty +
    '<details class="menu"><summary>Menu</summary><div class="menubox"><label class="sw"><input type="checkbox" id="sim"' + (S.simOffline ? ' checked' : '') + '><span class="track"></span><span class="lbl">Simulate offline (demo)</span></label><button class="btn small" data-act="signout">Sign out</button></div></details></div></div>' +
    '<nav class="tabs" aria-label="Sections">' + tabs.map(function (t) { return '<button data-act="tab" data-v="' + t[0] + '"' + (t[0] === S.tab ? ' aria-current="page"' : '') + '><span class="ti">' + ico(TAB_ICON[t[0]] || '') + '</span><span class="tl">' + t[1] + '</span>' + (t[0] === 'bcast' && unread ? '<span class="badge">' + unread + '</span>' : '') + (t[0] === 'mine' && q ? '<span class="badge">' + q + '</span>' : '') + '</button>'; }).join('') + '</nav>' +
    '<main>' + off + banner + V[S.tab]() + '</main>' +
    '<footer class="foot"><span>&copy; Pundra University of Science &amp; Technology, Bogura. PUB CSE Fest-26, Track C2. ' + (S.cfg.testMode ? 'Test mode is on.' : '') + '</span></footer></div>';
}
function snapshot() {
  var snap = { y: window.scrollY, vals: {}, focus: null };
  document.querySelectorAll('[data-keep]').forEach(function (el) { if (el.id) snap.vals[el.id] = el.value; });
  var a = document.activeElement;
  if (a && a.id) snap.focus = { id: a.id, s: a.selectionStart, e: a.selectionEnd };
  return snap;
}
function restore(snap) {
  Object.keys(snap.vals).forEach(function (id) { var el = document.getElementById(id); if (el && el.hasAttribute('data-keep')) el.value = snap.vals[id]; });
  if (snap.focus) {
    var f = document.getElementById(snap.focus.id);
    if (f) { f.focus({ preventScroll: true }); try { if (snap.focus.s != null) f.setSelectionRange(snap.focus.s, snap.focus.e); } catch (e) { /* not a text input */ } }
  }
  window.scrollTo(0, snap.y);
}
function render() {
  if (!S.cfg) return;
  var snap = snapshot();
  S.mapCfg = {};
  app.innerHTML = S.user ? shell() : authView();
  mountMaps();
  restore(snap);
  renderModal();
  document.title = (S.user && isStaff() ? (S.incidents.filter(function (i) { return i.status === 'reported'; }).length ? '(' + S.incidents.filter(function (i) { return i.status === 'reported'; }).length + ') ' : '') : '') + 'PUB SafeCampus';
  if (S.user && S.tab === 'mine') ensureDetails();
}
function renderModal() {
  var m = $('#modal'), s = S.sos, h = '';
  if (s) {
    if (s.step === 'consent') {
      h = '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dt"><h2 id="dt">Share your live location?</h2><p>Security can see where you are only while this alert is open. Sharing stops when it is resolved.</p><button class="btn sos" data-act="consent" data-v="yes">Allow while the alert is open</button><button class="btn" data-act="consent" data-v="no">Send without location</button><button class="btn" data-act="soscancel">Cancel</button></div>';
    } else if (s.step === 'countdown') {
      h = '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dt"><h2 id="dt">Sending SOS</h2><div class="count" aria-live="assertive">' + s.n + '</div><p class="muted" style="text-align:center">Your SOS goes out when the countdown ends.</p><button class="btn primary" data-act="soscancel">Cancel SOS</button></div>';
    } else if (s.step === 'sending') {
      h = '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dt"><h2 id="dt">Sending…</h2><p class="muted">Finding your location and contacting security.</p></div>';
    } else if (s.step === 'done') {
      var r = s.result;
      h = '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dt"><h2 id="dt">' + (r.sent ? 'SOS sent' : 'SOS saved on your device') + '</h2>' +
        (r.sent ? '<div class="note ok"><b>Delivered to:</b><br>Security Desk' + (r.incident.hasLoc ? ' with your live location' : ' without location') + '<br>' + (S.contacts.length ? S.contacts.map(function (c) { return esc(c.name); }).join('<br>') : 'No emergency contacts set') + '</div>' + (S.cfg.testMode ? '<p class="small muted">Test mode: contacts are recorded, no real message is sent.</p>' : '') + '<p class="small muted">Reference ' + esc(r.incident.ref) + ' at ' + tf.format(r.incident.reportedAt) + '.</p>' :
          '<div class="note warn">There is no connection. It will send automatically when you are back online. You can also send it by SMS.</div><div class="sms"><span class="small muted">Send this text to <b>' + esc(S.cfg.smsNumber) + '</b></span><code>' + esc(r.queued.sms) + '</code><button class="btn small" data-act="copysms" data-id="' + esc(r.queued.clientId) + '">Copy text</button></div>') +
        (s.noLoc ? '<div class="note warn small">Your location could not be read, so it was not included. Turn on GPS or set your position on the Home map next time.</div>' : '') +
        '<button class="btn primary" data-act="sosdone">View status</button></div>';
    }
  } else if (S.modal && S.modal.type === 'call') {
    var d = S.cfg.directory[S.modal.i];
    h = '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dt"><h2 id="dt">Calling ' + esc(d.name) + '</h2><p class="mono">' + esc(d.phone) + '</p><div class="note warn">Test mode. No call is placed.</div><button class="btn sos" data-act="endcall">End call</button></div>';
  }
  m.innerHTML = h ? '<div class="overlay">' + h + '</div>' : '';
  var f = $('#modal .btn'); if (f && !m.contains(document.activeElement)) f.focus();
}

/* ---------- actions ---------- */
function selectIncident(id) {
  S.sel = id; render();
  if (!S.detail[id]) loadDetail(id).then(render);
  var d = $('#detail'); if (d) d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
var countTimer = null;
function beginSOS() {
  if (S.sos) return;
  if (!S.locConsent) { S.sos = { step: 'consent' }; renderModal(); } else startCount(true);
}
function startCount(share) {
  S.sos = { step: 'countdown', n: COUNT, share: share }; renderModal();
  clearInterval(countTimer);
  countTimer = setInterval(function () {
    if (!S.sos || S.sos.step !== 'countdown') { clearInterval(countTimer); return; }
    S.sos.n--;
    if (S.sos.n <= 0) { clearInterval(countTimer); sendSOS(S.sos.share); } else renderModal();
  }, 1000);
}
async function sendSOS(share) {
  S.sos = { step: 'sending' }; renderModal();
  var p = share ? await getPosition(false) : null, payload = { category: 'sos', shareLocation: !!p };
  if (p) { payload.lat = p.lat; payload.lng = p.lng; payload.buildingId = nearestBuildingId(p.lat, p.lng); }
  try {
    var result = await submitIncident(payload);
    S.sos = { step: 'done', result: result, noLoc: share && !p };
  } catch (e) { S.sos = null; toast('SOS could not be sent: ' + e.message + ' Call the Security Desk directly.'); }
  render();
}
// If the phone already gave a GPS fix, start the report with that position so the person has one less step.
function prefillLoc() {
  var d = S.draft, c = S.cfg.categories[d.category];
  if (d.lat != null || !S.gps || (c && c.sensitive && d.anonymous)) return;
  d.lat = S.gps.lat; d.lng = S.gps.lng; d.buildingId = nearestBuildingId(S.gps.lat, S.gps.lng);
}
async function submitReport() {
  var d = S.draft, c = S.cfg.categories[d.category];
  if (!d.desc.trim() && !d.media.length) { toast('Add a short description or a photo or video first.'); return; }
  if (d.lat == null) { toast('Tap the map or choose a building so responders know where to go.'); return; }
  S.busy = true; render();
  var payload = { category: d.category, description: d.desc.trim(), room: d.room.trim(), lat: d.lat, lng: d.lng, buildingId: d.buildingId || undefined, anonymous: c.sensitive && d.anonymous,
    media: d.media.map(function (m) { return { name: m.name, type: m.type, data: m.data }; }) };
  try {
    var r = await submitIncident(payload);
    S.draft = newDraft(d.category); S.tab = 'mine'; S.busy = false; render(); window.scrollTo(0, 0);
    toast(r.sent ? 'Report sent to ' + c.teams.map(function (t) { return S.cfg.teams[t]; }).join(' and ') + '.' : 'Saved on this device. It sends when you are back online.');
  } catch (e) { S.busy = false; render(); toast(e.message); }
}
async function advance(id) {
  var inc = S.incidents.filter(function (i) { return i.id === id; })[0]; if (!inc) return;
  var next = FLOW[FLOW.indexOf(inc.status) + 1]; if (!next) return;
  try { var r = await api('POST', '/api/incidents/' + id + '/status', { status: next }); upsertIncident(r.incident); S.detail[id] = Object.assign({}, S.detail[id], r.incident); render(); toast('Status: ' + SL[next]); }
  catch (e) { toast(e.message); }
}
async function sendChat(id) {
  var inp = $('#chat-' + id); if (!inp) return;
  var text = inp.value.trim(); if (!text) return;
  try {
    var r = await api('POST', '/api/incidents/' + id + '/messages', { body: text });
    var det = S.detail[id]; if (det && !det.messages.some(function (m) { return m.id === r.message.id; })) det.messages.push(r.message);
    inp.value = ''; render();
    var n = $('#chat-' + id); if (n) n.focus();
    var c = $('[data-chat="' + id + '"]'); if (c) c.scrollTop = c.scrollHeight;
  } catch (e) { toast(e.message); }
}
function readFileAsBase64(file) {
  return new Promise(function (resolve, reject) {
    var fr = new FileReader();
    fr.onload = function () { var s = String(fr.result); resolve(s.slice(s.indexOf(',') + 1)); };
    fr.onerror = function () { reject(fr.error); }; fr.readAsDataURL(file);
  });
}
// Photos are re-drawn on a canvas: smaller upload, and hidden location data in the photo is dropped.
function shrinkImage(file) {
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var max = 1600, k = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      var data = cv.toDataURL('image/jpeg', 0.82); URL.revokeObjectURL(url);
      resolve({ type: 'image/jpeg', data: data.slice(data.indexOf(',') + 1), preview: data });
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}
async function addFiles(files) {
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (S.draft.media.length >= 3) { toast('You can attach up to 3 files.'); break; }
    try {
      if (f.type.indexOf('image/') === 0) { var r = await shrinkImage(f); S.draft.media.push({ name: f.name.replace(/\.[^.]+$/, '') + '.jpg', type: r.type, data: r.data, preview: r.preview }); }
      else if (f.type.indexOf('video/') === 0) {
        if (f.size > 5 * 1024 * 1024) { toast(f.name + ' is larger than 5 MB.'); continue; }
        S.draft.media.push({ name: f.name, type: f.type, data: await readFileAsBase64(f), preview: '' });
      } else toast(f.name + ' is not a photo or video.');
    } catch (e) { toast(e.message); }
  }
  render();
}
function copyText(t) {
  function ok() { toast('Copied'); }
  function fb() { var ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { toast('Select the text and copy it by hand.'); } ta.remove(); }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, fb); else fb();
}
function smsFor(id) {
  var it = S.queue.filter(function (x) { return x.clientId === id; })[0]; return it && it.sms;
}

/* ---------- hold-to-confirm ---------- */
var hold = null;
function holdStart() {
  if (S.sos || hold) return;
  var wrap = $('.sos-wrap'); if (!wrap) return;
  var t0 = performance.now(); hold = { raf: 0, timer: 0 }; wrap.classList.add('holding');
  // The timer decides when the hold is long enough; the animation frame only draws the ring.
  hold.timer = setTimeout(function () {
    cancelAnimationFrame(hold.raf); hold = null;
    var w = $('.sos-wrap'); if (w) { w.classList.remove('holding'); w.style.setProperty('--p', 0); }
    beginSOS();
  }, HOLD_MS);
  function step(t) {
    if (!hold) return;
    var live = $('.sos-wrap'); if (live) live.style.setProperty('--p', Math.min(100, (t - t0) / HOLD_MS * 100));
    hold.raf = requestAnimationFrame(step);
  }
  hold.raf = requestAnimationFrame(step);
}
function holdEnd() {
  if (!hold) return; cancelAnimationFrame(hold.raf); clearTimeout(hold.timer); hold = null;
  var w = $('.sos-wrap'); if (w) { w.classList.remove('holding'); w.style.setProperty('--p', 0); }
}
document.addEventListener('pointerdown', function (e) { if (e.target.closest && e.target.closest('#sosBtn')) { e.preventDefault(); holdStart(); } });
document.addEventListener('pointerup', holdEnd);
document.addEventListener('pointercancel', holdEnd);
document.addEventListener('contextmenu', function (e) { if (e.target.closest && e.target.closest('#sosBtn')) e.preventDefault(); });
document.addEventListener('keydown', function (e) {
  if (e.target && e.target.id === 'sosBtn' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); if (!e.repeat) holdStart(); return; }
  if (e.key === 'Enter' && e.target && e.target.id && e.target.id.indexOf('chat-') === 0) { e.preventDefault(); sendChat(Number(e.target.id.slice(5))); }
});
document.addEventListener('keyup', function (e) { if (e.target && e.target.id === 'sosBtn') holdEnd(); });

/* ---------- events ---------- */
document.addEventListener('click', async function (e) {
  var t = e.target.closest && e.target.closest('[data-act]'); if (!t) return;
  var a = t.getAttribute('data-act'), v = t.getAttribute('data-v'), id = t.getAttribute('data-id'), idx = Number(t.getAttribute('data-i'));
  switch (a) {
    case 'authmode': S.authMode = v; S.authErr = ''; render(); break;
    case 'demo': {
      var d = S.cfg.demoAccounts[idx]; S.busy = true;
      try { await afterLogin(await api('POST', '/api/auth/login', { email: d.email, password: d.password })); } catch (er) { S.authErr = er.message; }
      S.busy = false; render(); break; }
    case 'signout': signOut(); S.authErr = ''; render(); break;
    case 'tab': S.tab = v; if (v === 'report') prefillLoc(); if (v === 'reports') { render(); await loadAnalytics(); } render(); window.scrollTo(0, 0); break;
    case 'days': S.analyticsDays = Number(v); S.analytics = null; render(); await loadAnalytics(); render(); break;
    case 'quick': S.draft = newDraft(v); prefillLoc(); S.tab = 'report'; render(); window.scrollTo(0, 0); break;
    case 'cat': S.draft.category = v; if (!S.cfg.categories[v].sensitive) S.draft.anonymous = false; render(); break;
    case 'rmmedia': S.draft.media.splice(idx, 1); render(); break;
    case 'usegps': { var p = await getPosition(false); if (p && p.source === 'gps') { S.useManual = false; render(); toast('Using your GPS position.'); } else toast('GPS is not available. Tap the map to set your position.'); break; }
    case 'togglemanual': S.useManual = !S.useManual; render(); break;
    case 'useloc': {
      var q = await getPosition(false);
      if (!q) { toast('Could not read your location. Tap the map instead.'); break; }
      S.draft.lat = q.lat; S.draft.lng = q.lng; S.draft.buildingId = nearestBuildingId(q.lat, q.lng); render(); toast('Pin moved to your current location.'); break; }
    case 'submit': submitReport(); break;
    case 'consent':
      if (v === 'yes') { S.locConsent = true; lsSet(LS_CONSENT, '1'); }
      startCount(v === 'yes'); break;
    case 'soscancel': clearInterval(countTimer); S.sos = null; renderModal(); toast('SOS cancelled. Nothing was sent.'); break;
    case 'sosdone': S.sos = null; S.tab = 'mine'; render(); window.scrollTo(0, 0); break;
    case 'sel': selectIncident(Number(id)); break;
    case 'assignme': { try { var r1 = await api('POST', '/api/incidents/' + id + '/assign', { responderId: S.user.id }); upsertIncident(r1.incident); S.detail[id] = Object.assign({}, S.detail[id], r1.incident); render(); } catch (er) { toast(er.message); } break; }
    case 'assignnear': { var inc = S.incidents.filter(function (i) { return i.id === Number(id); })[0]; if (inc && inc.nearest) { try { var r2 = await api('POST', '/api/incidents/' + id + '/assign', { responderId: inc.nearest.id }); upsertIncident(r2.incident); toast('Assigned to ' + inc.nearest.name + '.'); render(); } catch (er) { toast(er.message); } } break; }
    case 'adv': advance(Number(id)); break;
    case 'send': sendChat(Number(id)); break;
    case 'retry': flushQueue().then(function () { if (isOffline()) toast('Still offline. It will send when the connection returns.'); }); break;
    case 'sms': S.sms[id] = !S.sms[id]; render(); break;
    case 'copysms': { var tx = smsFor(id) || (S.sos && S.sos.result && S.sos.result.queued && S.sos.result.queued.sms); if (tx) copyText(tx); break; }
    case 'call': S.modal = { type: 'call', i: idx }; renderModal(); break;
    case 'endcall': S.modal = null; renderModal(); break;
    case 'read': { try { var rb = await api('POST', '/api/broadcasts/' + id + '/read'); upsertBroadcast(rb.broadcast); render(); toast('Read confirmation sent to the security office.'); } catch (er) { toast(er.message); } break; }
    case 'tmpl': { var tp = TEMPLATES[v]; S.compose = { title: tp.title, body: tp.body, level: tp.level }; render(); break; }
    case 'bsend': {
      var c = S.compose; if (!c.title.trim() || !c.body.trim()) { toast('Add a title and a message first.'); break; }
      try { var rr = await api('POST', '/api/broadcasts', { title: c.title.trim(), body: c.body.trim(), level: c.level }); upsertBroadcast(rr.broadcast); S.compose = { title: '', body: '', level: 'info' }; render(); toast('Broadcast sent to all users.'); } catch (er) { toast(er.message); } break; }
    case 'ctedit': S.editContacts = S.contacts.map(function (c2) { return { name: c2.name, phone: c2.phone }; }); if (!S.editContacts.length) S.editContacts.push({ name: '', phone: '' }); render(); break;
    case 'ctadd': S.editContacts.push({ name: '', phone: '' }); render(); break;
    case 'ctdel': S.editContacts.splice(idx, 1); render(); break;
    case 'ctcancel': S.editContacts = null; render(); break;
    case 'ctsave': {
      var list = S.editContacts.filter(function (c3) { return c3.name.trim() || c3.phone.trim(); });
      try { var rc = await api('PUT', '/api/me/contacts', { contacts: list }); S.contacts = rc.contacts; S.editContacts = null; render(); toast('Emergency contacts saved.'); } catch (er) { toast(er.message); } break; }
  }
});
document.addEventListener('submit', async function (e) {
  e.preventDefault();
  if (e.target.id === 'authForm') {
    var reg = S.authMode === 'register', body = { email: $('#a-email').value.trim(), password: $('#a-pass').value };
    if (reg) { body.name = $('#a-name').value.trim(); body.studentId = $('#a-sid').value.trim(); body.phone = $('#a-phone').value.trim(); }
    S.busy = true; S.authErr = ''; render();
    try { await afterLogin(await api('POST', reg ? '/api/auth/register' : '/api/auth/login', body)); } catch (er) { S.authErr = er.message; }
    S.busy = false; render();
  }
  if (e.target.id === 'respForm') {
    try {
      await api('POST', '/api/responders', { name: $('#rname').value.trim(), email: $('#remail').value.trim(), password: $('#rpass').value, team: $('#rteam').value });
      S.responders = (await api('GET', '/api/responders')).responders; render(); toast('Responder added. Share the temporary password with them.');
    } catch (er) { var el = $('#respErr'); if (el) el.textContent = er.message; }
  }
});
document.addEventListener('input', function (e) {
  var t = e.target;
  if (t.dataset && t.dataset.draft) S.draft[t.dataset.draft] = t.value;
  if (t.dataset && t.dataset.compose) S.compose[t.dataset.compose] = t.value;
  if (t.dataset && t.dataset.ct && S.editContacts) S.editContacts[Number(t.dataset.i)][t.dataset.ct] = t.value;
});
document.addEventListener('change', async function (e) {
  var t = e.target;
  switch (t.id) {
    case 'sim':
      S.simOffline = t.checked;
      if (S.simOffline) { closeSSE(); render(); }
      else { render(); connectSSE(); flushQueue(); }
      return;
    case 'duty': try { await api('POST', '/api/me/duty', { onDuty: t.checked }); S.user.onDuty = t.checked; syncPositionSharing(); render(); } catch (er) { toast(er.message); render(); } return;
    case 'anon': S.draft.anonymous = t.checked; render(); return;
    case 'bld': { var b = S.cfg.campus.buildings.filter(function (x) { return x.id === t.value; })[0]; if (b) { S.draft.buildingId = b.id; S.draft.lat = b.lat; S.draft.lng = b.lng; } render(); return; }
    case 'media': await addFiles(t.files); return;
    case 'fteam': S.filter.team = t.checked; render(); return;
    case 'fres': S.filter.resolved = t.checked; render(); return;
    case 'assign': { try { var r = await api('POST', '/api/incidents/' + S.sel + '/assign', { responderId: t.value ? Number(t.value) : null }); upsertIncident(r.incident); render(); } catch (er) { toast(er.message); } return; }
    case 'blevel': S.compose.level = t.value; return;
  }
  if (t.getAttribute && t.getAttribute('data-act') === 'duty') {
    try { await api('PATCH', '/api/responders/' + t.getAttribute('data-id'), { onDuty: t.checked }); } catch (er) { toast(er.message); }
    S.responders = (await api('GET', '/api/responders').catch(function () { return { responders: S.responders }; })).responders; render();
  }
});
window.addEventListener('online', function () { if (!S.simOffline) { connectSSE(); resync(); } render(); });
window.addEventListener('offline', function () { closeSSE(); render(); });

/* ---------- boot ---------- */
async function boot() {
  try { S.cfg = await (await fetch('/api/config')).json(); }
  catch (e) { app.innerHTML = '<p style="padding:24px">Cannot reach the server. Check your connection and reload.</p>'; return; }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function () { /* optional */ });
  await queueLoad();
  if (S.token) {
    try { var u = lsGet(LS_USER); S.user = u ? JSON.parse(u) : null; } catch (e) { S.user = null; }
    try { await loadAll(); S.tab = S.tab || TABS[S.user.role][0][0]; connectSSE(); flushQueue(); }
    catch (e) { if (!e.offline) { signOut(); } else if (S.user) { S.tab = TABS[S.user.role][0][0]; } }
  }
  render();
}
boot();
})();
