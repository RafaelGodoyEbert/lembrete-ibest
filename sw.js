const CACHE_NAME = 'saninplay-v5';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './ico192.png',
  './ico512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Ignora requisições de vídeo para permitir que o navegador trate os Range Requests (206 Partial Content) nativamente
  if (event.request.url.includes('video.mp4') || event.request.destination === 'video') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

// Timer no Service Worker
let notificationTimeout = null;

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
        const delay = event.data.delay;
        
        if (notificationTimeout) clearTimeout(notificationTimeout);
        
        const triggerTime = Date.now() + delay;
        const notificationOptions = {
            body: "Tá na hora de votar de novo no iBest! Ajude o San!",
            icon: "ico192.png",
            badge: "ico192.png",
            vibrate: [200, 100, 200],
            data: {
                url: "/"
            }
        };
        
        // Tenta usar a API experimental de TimestampTrigger no Service Worker para persistir no background do OS
        if (typeof TimestampTrigger !== 'undefined') {
            try {
                notificationOptions.showTrigger = new TimestampTrigger(triggerTime);
                self.registration.showNotification("SanInPlay 🔥", notificationOptions);
                console.log("Service Worker: Notificação agendada usando TimestampTrigger para:", triggerTime);
                return;
            } catch (e) {
                console.error("Erro ao usar TimestampTrigger, usando fallback setTimeout:", e);
            }
        }
        
        // Fallback: Temporizador padrão (o navegador pode suspender o SW e interromper o timer)
        notificationTimeout = setTimeout(() => {
            self.registration.showNotification("SanInPlay 🔥", notificationOptions);
        }, delay);
    }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      for (let i = 0; i < windowClients.length; i++) {
        let client = windowClients[i];
        if (client.url.includes('/') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
