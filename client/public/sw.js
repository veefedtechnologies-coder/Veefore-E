/*
 * Service worker DISABLED / self-destruct.
 *
 * A previous version cached the JS bundle and could serve a stale build, masking
 * client fixes. This stub takes over from that old SW, deletes all caches, and
 * unregisters itself so browsers fall back to normal (immutable-HTTP-cached)
 * asset loading. Served with Cache-Control: no-cache so it's picked up promptly.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch { /* ignore */ }
      try {
        await self.registration.unregister();
      } catch { /* ignore */ }
      // Reload controlled clients so they fetch fresh assets without the SW.
      try {
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((c) => c.navigate(c.url));
      } catch { /* ignore */ }
    })(),
  );
});

// Never intercept requests — always go to network.
self.addEventListener('fetch', () => {});
