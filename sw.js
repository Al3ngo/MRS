/*
 * Modern Racing Manager: service worker.
 *
 * Job: make the whole game available with no network at all. Every file of a build is downloaded at
 * install time and served from the cache afterwards. There are no runtime network requests to make.
 *
 * The build (build/service-worker-plugin.ts) writes this file to dist/sw.js and fills in the two
 * placeholders below. A new build means a new VERSION, which the browser sees as a new worker.
 *
 * Update policy: a new version downloads in the background and then WAITS. It only takes over when
 * the page asks for it (the player taps "Update"), or once every window of the old version is closed.
 * The game is never reloaded underneath the player.
 */

const VERSION = "6f29aed8f88b";
/** Every file of this build, as paths relative to the app's folder. */
const FILES = ["assets/barlow-condensed-latin-500-normal-BgYH2mbd.woff2","assets/barlow-condensed-latin-600-normal-DepVgxBB.woff2","assets/index-Daufo0HY.css","assets/index-DgsuZuV3.js","assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","assets/inter-latin-wght-normal-Dx4kXJAl.woff2","favicon.svg","icons/apple-touch-icon.png","icons/favicon-32.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-192.png","icons/icon-maskable-512.png","index.html","manifest.webmanifest"];
const SHELL = 'index.html';

// Cache names are shared by everything on the same origin, so they carry the app's folder too.
// The bars keep one copy of the game from ever matching another's caches (a copy at "/" and one at
// "/beta/" on the same site, say).
const scopePath = new URL(self.registration.scope).pathname;
const CACHE_PREFIX = `mrm|${scopePath}|`;
const CACHE = `${CACHE_PREFIX}${VERSION}`;

const inScope = (path) => new URL(path, self.registration.scope).href;

/**
 * Some hosts answer "/index.html" with a redirect to "/". A response that was redirected cannot be
 * used to answer a page navigation, so rebuild it as a plain response.
 */
async function plain(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // "reload" skips the browser's HTTP cache, so a stale copy can never be stored as the new version.
      // If any single file fails, the whole install fails and the previous version stays in charge.
      await Promise.all(
        FILES.map(async (path) => {
          const url = inScope(path);
          const response = await fetch(new Request(url, { cache: 'reload' }));
          if (!response.ok) throw new Error(`Could not download ${path} (${response.status})`);
          await cache.put(url, await plain(response));
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(CACHE_PREFIX) && name !== CACHE) await caches.delete(name);
      }
      // Take over pages that are already open, so the very first visit is offline-ready without a reload.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'GET_VERSION' && event.ports[0]) {
    event.ports[0].postMessage({ version: VERSION, files: FILES.length });
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!url.href.startsWith(self.registration.scope)) return;
  event.respondWith(respond(event, url));
});

async function respond(event, url) {
  const request = event.request;
  const cache = await caches.open(CACHE);
  const isPage = request.mode === 'navigate';
  const isShell = url.pathname === scopePath || url.pathname === scopePath + SHELL;

  // Query strings never change which file is meant, so they are ignored.
  const key = isPage && isShell ? inScope(SHELL) : url.origin + url.pathname;
  const hit = await cache.match(key, { ignoreVary: true });
  if (hit) return hit;

  try {
    const response = await fetch(request);
    // One of our own files was missing (a browser can trim a cache): store it again for next time.
    const ours = (isPage && isShell) || FILES.includes(url.pathname.slice(scopePath.length));
    if (response.ok && ours) {
      const copy = response.clone();
      event.waitUntil(
        plain(copy)
          .then((stored) => cache.put(key, stored))
          .catch(() => undefined),
      );
    }
    return response;
  } catch (error) {
    // Offline and not one of our files: any page navigation still gets the game.
    if (isPage) {
      const shell = await cache.match(inScope(SHELL), { ignoreVary: true });
      if (shell) return shell;
    }
    throw error;
  }
}
