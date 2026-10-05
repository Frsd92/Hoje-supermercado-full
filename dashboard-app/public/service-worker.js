const CACHE_NAME = 'hoje-store-shell-v1';
const PRECACHE_URLS = [
  '/index.html',
  '/categoria.html',
  '/politica-de-privacidade.html',
  '/termos-de-uso.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/style.css',
  '/script.js',
  '/category.js',
  '/analytics-consent.js',
  '/content-moderation.js',
  '/pwa-register.js',
  '/imagens/logo/app-icon-180.png',
  '/imagens/logo/app-icon-192.png',
  '/imagens/logo/app-icon-512.png',
  '/imagens/logo/app-icon-maskable-512.png',
];
const STORE_PAGE_PATHS = new Set([
  '/index.html',
  '/categoria.html',
  '/politica-de-privacidade.html',
  '/termos-de-uso.html',
]);
const STATIC_ASSET_PATHS = new Set([
  '/manifest.webmanifest',
  '/style.css',
  '/script.js',
  '/category.js',
  '/analytics-consent.js',
  '/content-moderation.js',
  '/pwa-register.js',
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('hoje-store-') && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/')) return;

  const isStorePage = STORE_PAGE_PATHS.has(url.pathname);
  const isStaticAsset = STATIC_ASSET_PATHS.has(url.pathname) || url.pathname.startsWith('/imagens/');
  if (!isStorePage && !isStaticAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    let response;

    try {
      response = await fetch(request);
    } catch (error) {
      const cacheKey = isStorePage ? url.pathname : request;
      const cachedResponse = await cache.match(cacheKey, { ignoreSearch: true });
      if (cachedResponse) return cachedResponse;

      if (isStorePage) {
        const offlinePage = await cache.match('/offline.html');
        if (offlinePage) return offlinePage;
      }

      throw error;
    }

    if (response.ok && response.type === 'basic') {
      const cacheKey = isStorePage ? url.pathname : request;
      try {
        await cache.put(cacheKey, response.clone());
      } catch (error) {
        console.warn('Não foi possível atualizar o cache offline da loja:', error);
      }
    }

    return response;
  })());
});
