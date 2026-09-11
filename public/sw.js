/* GuildWright service worker: offline app shell + Web Push receiver.
 * Offline support lets crew open the app and clock time with no signal (see lib/offlineTimeclock).
 * Precache is deterministic: at install we read the deployed index.html and cache every asset it
 * references (hashed JS/CSS/chunks) plus the icons and manifest — no dependence on runtime timing.
 * Navigations are network-first with a cached-index fallback; other GETs are cache-first. Every
 * handler always resolves to a real Response (returning undefined throws inside respondWith). */

const CACHE = 'gw-shell-v3';
const EXTRA = [
  '/guildwright-iconHD.png',
  '/guildwright-icon.png',
  '/guildwright-icon.png?v=2',
  '/guildwright-badge.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch('/index.html', { cache: 'no-cache' });
      if (res && res.ok) {
        const html = await res.text();
        const urls = new Set();
        for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
          const u = m[1];
          if (/^\/(assets\/|guildwright|manifest\.webmanifest)/.test(u)) urls.add(u);
        }
        await Promise.all([...urls].map((u) => cache.add(u).catch(() => {})));
        await cache.put('/index.html', new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
      }
    } catch { /* offline at install — nothing to precache */ }
    await Promise.all(EXTRA.map((u) => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return; // let cross-origin (API, CDN) hit the network

  // App shell / SPA routes: network-first, fall back to the cached index so the app boots offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
          return res;
        })
        .catch(async () =>
          (await caches.match('/index.html')) ||
          (await caches.match('/')) ||
          new Response('<!doctype html><meta charset="utf-8"><title>GuildWright</title>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        )
    );
    return;
  }

  // Everything else: cache-first, then network (and cache it). Never resolve to undefined.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached || Response.error());
    })
  );
});

// Belt-and-suspenders: the page can post asset URLs it loaded, to top up the cache.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'cache-assets' && Array.isArray(data.urls)) {
    event.waitUntil(
      caches.open(CACHE).then((cache) => Promise.all(
        data.urls.map((u) => cache.match(u).then((hit) => hit || fetch(u, { cache: 'no-cache' })
          .then((res) => { if (res && res.status === 200) return cache.put(u, res.clone()); })
          .catch(() => {})))
      ))
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'GuildWright';
  const options = {
    body: data.body || '',
    tag: data.tag || 'guildwright',
    renotify: true,
    icon: data.icon || '/guildwright-icon.png',
    badge: data.badge || '/guildwright-badge.png',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(target);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
