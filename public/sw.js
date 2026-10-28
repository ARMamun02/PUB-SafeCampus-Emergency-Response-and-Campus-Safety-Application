'use strict';
// Caches the app shell so the page still opens with no connection.
// API calls are never cached; offline reports are queued by the page itself.
const CACHE = 'safecampus-shell-v3';
const SHELL = ['/', '/app.css', '/app.js', '/icon.svg', '/logo.png', '/logo-128.png', '/logo-256.png', '/favicon-32.png', '/manifest.webmanifest'];
// Map library and fonts come from a CDN. Keep a copy after the first online visit so the app still loads offline.
const CDN = ['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  const cdn = CDN.indexOf(u.hostname) >= 0;
  if (e.request.method !== 'GET' || (u.origin !== location.origin && !cdn) || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then((m) => m || caches.match('/'))));
});
