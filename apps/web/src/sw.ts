import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';

/**
 * references:
 * - https://vite-pwa-org.netlify.app/guide/inject-manifest - injectManifest and `self.__WB_MANIFEST`
 * - https://developer.chrome.com/docs/workbox/modules/workbox-strategies - stale-while-revalidate and cache-first
 * - https://developer.chrome.com/docs/workbox/caching-resources-during-runtime#opaque_responses - opaque responses and their size in the cache
 * - https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/push_event - the push event
 * - https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/notificationclick_event - opening a page from a notification
 */

declare const self: ServiceWorkerGlobalScope;

const DAY_SECONDS = 24 * 60 * 60;

// a new deploy takes over on the next load rather than once every tab has closed
self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// every client-side route opens the cached shell offline. the API is never answered from a cache
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }),
);

registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({
    cacheName: 'fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 10 })],
  }),
);

// `<img>` loads these without CORS, which makes the responses opaque with status 0.
// each opaque response counts as several megabytes against the quota, hence the low cap
registerRoute(
  ({ url }) => url.hostname === 'res.cloudinary.com',
  new StaleWhileRevalidate({
    cacheName: 'cloudinary-thumbnails',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 40,
        maxAgeSeconds: 7 * DAY_SECONDS,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

/** what the API sends. `href` is a path in this app, or null */
interface PushMessage {
  title: string;
  body: string;
  href: string | null;
}

function readPush(event: PushEvent): PushMessage {
  try {
    const message = event.data?.json() as Partial<PushMessage> | undefined;
    return {
      title: message?.title ?? 'FEDSA',
      body: message?.body ?? '',
      href: message?.href ?? null,
    };
  } catch {
    return { title: 'FEDSA', body: event.data?.text() ?? '', href: null };
  }
}

self.addEventListener('push', (event) => {
  const message = readPush(event);
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: '/pwa-192.png',
      data: { href: message.href },
    }),
  );
});

// a notification with no link opens the inbox, which lists it
async function openPage(href: string | null) {
  const url = new URL(href ?? '/notifications', self.location.origin);
  const target = url.origin === self.location.origin ? url.href : self.location.origin;
  const windows = await self.clients.matchAll({ type: 'window' });
  const open = windows[0];
  if (open) {
    await open.focus();
    await open.navigate(target);
    return;
  }
  await self.clients.openWindow(target);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data as { href?: string | null } | null;
  event.waitUntil(openPage(data?.href ?? null));
});
