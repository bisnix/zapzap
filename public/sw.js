self.addEventListener('push', event => {
  const payload = event.data ? event.data.json() : { title: 'Zapzap', body: 'Ada pesan baru.' }
  event.waitUntil(self.registration.showNotification(payload.title || 'Zapzap', {
    body: payload.body || 'Ada pesan baru.',
    tag: payload.tag || 'zapzap-messages',
    icon: '/icon.svg',
    data: { url: payload.url || '/' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => new URL(client.url).pathname === url)
    return existing ? existing.focus() : self.clients.openWindow(url)
  }))
})
