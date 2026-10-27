/* Digisms Pro service worker (plain JavaScript, no external scripts, so it works under the strict
   `script-src 'self'` policy set for /sw.js in next.config.ts).

   Privacy rule: only PUBLIC bundled assets are cached. Account pages, API data, OTPs, wallets,
   purchases, uploads, signed download URLs and payment requests are NEVER cached or queued. */
const VERSION = 'v3';
const CACHE = 'digisms-pro-public-assets-' + VERSION;
const PREFIX = 'digisms-pro-public-assets-';
const OFFLINE = '/offline.html';
const ESSENTIALS = [OFFLINE, '/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png', '/fonts/jakarta.woff2'];
const MAX_ENTRIES = 160;

/* ---------- install / activate ---------- */
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ESSENTIALS)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    // Navigation preload makes page loads faster while the worker boots.
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (e) { /* optional */ } }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------- fetch: offline page + bundled-asset cache ---------- */
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || request.headers.has('range') || request.headers.get('rsc') === '1') return;

  // Pages: network first (always the latest store), offline page when there is no connection.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        return await fetch(request);
      } catch (error) {
        const cache = await caches.open(CACHE);
        return (await cache.match(OFFLINE)) || new Response('You are offline. Reconnect to use Digisms Pro.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Bundled public assets only: cache first.
  const bundled = /^\/(?:icons|brands|images|fonts|screenshots)\//.test(url.pathname) || url.pathname === '/icon.svg' || url.pathname.startsWith('/_next/static/');
  if (!bundled || url.search) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const bytes = Number(response.headers.get('content-length') || 0);
      if (bytes < 5 * 1024 * 1024) {
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        if (keys.length > MAX_ENTRIES) {
          const removable = keys.filter(key => !ESSENTIALS.includes(new URL(key.url).pathname));
          await Promise.all(removable.slice(0, keys.length - MAX_ENTRIES).map(key => cache.delete(key)));
        }
      }
    }
    return response;
  })());
});

/* ---------- push notifications ---------- */
// Payload (JSON): { title, body, url, icon, badge, tag }. Sending requires a push server (see PWABUILDER.md).
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Digisms Pro';
  const options = {
    body: data.body || 'You have a new update.',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/monochrome-96.png',
    tag: data.tag || 'digisms-pro',
    data: { url: typeof data.url === 'string' ? data.url : '/notifications' },
  };
  event.waitUntil((async () => {
    // When the app is open and visible the in-app toast already tells the user, so only refresh the inbox.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = windows.filter(client => client.visibilityState === 'visible');
    if (visible.length) { visible.forEach(client => client.postMessage({ type: 'PUSH_RECEIVED' })); return; }
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  let target = '/notifications';
  try { const u = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin); if (u.origin === self.location.origin) target = u.pathname + u.search; } catch (e) { /* keep default */ }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) { await client.focus(); if ('navigate' in client) { try { await client.navigate(target); } catch (e) { /* ignore */ } } return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});

self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    windows.forEach(client => client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }));
  })());
});

/* ---------- background sync ---------- */
// Benign by design: when the connection returns, open windows are told to refresh public data.
// Payments, purchases and uploads are never queued here.
self.addEventListener('sync', event => {
  if (event.tag === 'digisms-refresh') {
    event.waitUntil((async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      windows.forEach(client => client.postMessage({ type: 'BACKGROUND_SYNC', tag: event.tag }));
    })());
  }
});

/* ---------- periodic background sync ---------- */
// Keeps the offline page and core icons fresh. No account data is fetched.
self.addEventListener('periodicsync', event => {
  if (event.tag === 'digisms-content-refresh') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(ESSENTIALS.map(async path => { try { const r = await fetch(path, { cache: 'reload' }); if (r.ok) await cache.put(path, r); } catch (e) { /* offline: keep old copy */ } }));
    })());
  }
});

/* ---------- Windows widgets (manifest "widgets") ---------- */
async function renderWidget(widget) {
  if (!self.widgets || !widget || !widget.definition) return;
  const def = widget.definition;
  const template = await (await fetch(def.msAcTemplate)).text();
  const data = await (await fetch(def.data)).text();
  await self.widgets.updateByTag(def.tag, { template, data });
}
self.addEventListener('widgetinstall', event => event.waitUntil(renderWidget(event.widget).catch(() => {})));
self.addEventListener('widgetresume', event => event.waitUntil(renderWidget(event.widget).catch(() => {})));
self.addEventListener('widgetclick', event => event.waitUntil(renderWidget(event.widget).catch(() => {})));
self.addEventListener('periodicsync', event => {
  if (event.tag === 'digisms-updates' && self.widgets) {
    event.waitUntil((async () => { const widget = await self.widgets.getByTag('digisms-updates'); await renderWidget(widget); })().catch(() => {}));
  }
});
