const CACHE_PREFIX = 'cgg-hdos-shell-';
const CACHE_NAME = CACHE_PREFIX + 'v1';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const scopeUrl = self.registration.scope;
    const indexUrl = new URL('index.html', scopeUrl).href;
    const response = await fetch(indexUrl, { cache: 'reload' });
    if (!response.ok) throw new Error('HDOS app shell could not be cached.');
    await cache.put(indexUrl, response.clone());

    // Precache the built entry point and styles so the first successful
    // online visit can reopen the app shell without a network connection.
    const html = await response.text();
    const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)]
      .map(match => match[1]);
    await Promise.all(assetPaths.map(async path => {
      try {
        const assetUrl = new URL(path, indexUrl);
        if (assetUrl.origin !== self.location.origin || !assetUrl.href.startsWith(scopeUrl)) return;
        const assetResponse = await fetch(assetUrl.href, { cache: 'reload' });
        if (assetResponse.ok) await cache.put(assetUrl.href, assetResponse);
      } catch {
        // A single optional chunk must not prevent installation of the shell.
      }
    }));

    const manifestUrl = new URL('manifest.webmanifest', scopeUrl).href;
    const iconUrl = new URL('icons/hdos-icon.svg', scopeUrl).href;
    await Promise.all([manifestUrl, iconUrl].map(async url => {
      try {
        const assetResponse = await fetch(url, { cache: 'reload' });
        if (assetResponse.ok) await cache.put(url, assetResponse);
      } catch {
        // Manifest/icon caching is optional for app-shell availability.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);
  if (url.origin !== self.location.origin || !url.href.startsWith(scopeUrl.href)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(new URL('index.html', scopeUrl).href, response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(new URL('index.html', scopeUrl).href)) ||
          (await cache.match(request)) ||
          new Response('HDOS belum pernah dibuka saat perangkat online. Hubungkan internet lalu buka kembali aplikasi.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      }
    })());
    return;
  }

  if (!['script', 'style', 'image', 'font'].includes(request.destination)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const network = fetch(request).then(async response => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }).catch(() => cached);
    return cached || network;
  })());
});