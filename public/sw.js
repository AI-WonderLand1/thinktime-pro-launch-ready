self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'ThinkTime Pro', body: 'You have a new ThinkTime notification.' };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(String(data.title || 'ThinkTime Pro'), {
      body: String(data.body || ''),
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin && 'focus' in client) {
          if ('navigate' in client && url.pathname !== targetPath) await client.navigate(targetPath);
          return client.focus();
        }
      } catch {
        // Ignore malformed client URLs and open a fresh window below.
      }
    }
    return self.clients.openWindow ? self.clients.openWindow(targetPath) : undefined;
  })());
});
