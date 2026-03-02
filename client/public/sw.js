self.addEventListener('install', (event) => {
  console.log('BrainSync Service Worker Installed');
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Simple pass-through to allow network requests
  event.respondWith(fetch(event.request));
});