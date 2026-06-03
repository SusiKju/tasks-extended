// Service Worker – empfängt Push-Nachrichten von ntfy.sh
// Läuft im Hintergrund, auch wenn die Seite geschlossen ist.

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'Nachricht von Papa', body: event.data?.text() || '' }; }

  const title   = data.title || 'Nachricht von Papa';
  const options = {
    body:    data.message || data.body || '',
    icon:    'icon-192.png',
    badge:   'icon-192.png',
    vibrate: [200, 100, 200],
    tag:     'papa-msg',          // ersetzt alte Benachrichtigung statt zu stapeln
    renotify: true,
    data:    { url: self.location.origin }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  // Fokus auf Tab oder neuen Tab öffnen
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length > 0) return list[0].focus();
      return clients.openWindow(event.notification.data?.url || '/');
    })
  );
});
