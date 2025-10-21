self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // The service worker is ready to take control of the page.
});

// This is a placeholder for future push notification logic.
// For now, it's not strictly needed for showing local notifications,
// but it's good practice to include.
self.addEventListener('push', event => {
  const data = event.data.json();
  self.registration.showNotification(data.title, {
    body: data.body,
    icon: data.icon,
    vibrate: data.vibrate,
    tag: data.tag
  });
});
