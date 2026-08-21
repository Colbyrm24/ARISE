/*
  ARISE service worker.

  Deliberately minimal: this exists to receive pushes, not to cache the app.
  A caching layer here would need its own invalidation story and could serve a
  client a stale workout, which is worse than a slow one.
*/

// Take over as soon as a new version installs, rather than waiting for every
// tab to close. Otherwise a fixed push handler doesn't reach a client who
// keeps the app open on their phone for weeks.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  // A push with no readable body still deserves a notification — on iOS, a
  // push that arrives and shows nothing costs the app its permission.
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'ARISE';
  const options = {
    body: data.body || '',
    icon: '/icon.png',
    badge: '/icon.png',
    // Same tag replaces an unread notification instead of stacking five of
    // them, so a chatty morning doesn't bury the phone.
    tag: data.tag || 'arise',
    data: { url: data.url || '/today' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/today';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Focus a tab that's already open rather than piling up new ones.
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
