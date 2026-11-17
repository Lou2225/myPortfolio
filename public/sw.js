const CACHE_PREFIX = "lou-portfolio-";
const SHELL_CACHE = "lou-portfolio-shell-v3";
const STATIC_CACHE = "lou-portfolio-static-v3";
const MEDIA_CACHE = "lou-portfolio-media-v3";
const ACTIVE_CACHES = [SHELL_CACHE, STATIC_CACHE, MEDIA_CACHE];
const MAX_MEDIA_ENTRIES = 60;

const PRECACHE_URLS = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/assets/hero/avatar.webp",
  "/images/projects/capstone.webp",
  "/images/projects/analytics.webp",
  "/images/projects/portfolio.webp",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

function isHtmlResponse(res) {
  const ct = res.headers.get("content-type") || "";
  return ct.includes("text/html");
}

function isNextRscRequest(request, url) {
  return (
    url.searchParams.has("_rsc") ||
    request.headers.get("RSC") === "1" ||
    Boolean(request.headers.get("Next-Router-State-Tree"))
  );
}

function isSupabasePublicMediaUrl(url) {
  return (
    url.protocol === "https:" &&
    url.hostname.endsWith(".supabase.co") &&
    url.pathname.startsWith("/storage/v1/object/public/")
  );
}

function isSameOriginMediaPath(pathname) {
  return (
    pathname.startsWith("/_next/image") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/uploads/")
  );
}

function isSameOriginStaticPath(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico"
  );
}

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function trimMediaCache() {
  try {
    const cache = await caches.open(MEDIA_CACHE);
    const keys = await cache.keys();
    if (keys.length <= MAX_MEDIA_ENTRIES) return;
    const excess = keys.slice(0, keys.length - MAX_MEDIA_ENTRIES);
    await Promise.all(excess.map((req) => cache.delete(req)));
  } catch {
    // Ignore cache trim errors
  }
}

async function prewarmUrls(urls) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return { cached: 0, total: 0 };
  }

  let cached = 0;
  const unique = Array.from(
    new Set(urls.filter((u) => typeof u === "string" && u.trim().length > 0))
  ).slice(0, 40);

  const shellCache = await caches.open(SHELL_CACHE);
  const mediaCache = await caches.open(MEDIA_CACHE);

  await Promise.allSettled(
    unique.map(async (rawUrl) => {
      try {
        const target = new URL(rawUrl, self.location.origin);
        const sameOrigin = target.origin === self.location.origin;
        if (!sameOrigin && !isSupabasePublicMediaUrl(target)) {
          return;
        }
        if (sameOrigin && target.pathname.startsWith("/admin")) {
          return;
        }

        const res = await fetch(target.toString(), {
          mode: sameOrigin ? "same-origin" : "cors",
        });
        if (!res.ok && res.type !== "opaque") {
          return;
        }

        const destCache =
          sameOrigin &&
          (target.pathname === "/" ||
            target.pathname === "/offline" ||
            target.pathname === "/api/portfolio")
            ? shellCache
            : mediaCache;

        await destCache.put(target.toString(), res.clone());
        cached += 1;
      } catch {
        // Ignore single-asset failure during prewarm
      }
    })
  );

  await trimMediaCache();
  return { cached, total: unique.length };
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(SHELL_CACHE);
      const staticCache = await caches.open(STATIC_CACHE);
      const mediaCache = await caches.open(MEDIA_CACHE);

      await Promise.allSettled(
        PRECACHE_URLS.map(async (assetUrl) => {
          try {
            const res = await fetch(assetUrl, { cache: "reload" });
            if (!res.ok) return;

            if (assetUrl === "/" || assetUrl === "/offline") {
              await shellCache.put(assetUrl, res);
            } else if (isSameOriginStaticPath(assetUrl)) {
              await staticCache.put(assetUrl, res);
            } else {
              await mediaCache.put(assetUrl, res);
            }
          } catch {
            // Skip unreachable optional assets during precache
          }
        })
      );

      // Activate immediately on first install; keep waiting on upgrade for explicit prompt
      if (!self.registration.active) {
        await self.skipWaiting();
      }
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) => key.startsWith(CACHE_PREFIX) && !ACTIVE_CACHES.includes(key)
          )
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  const replyPort = event.ports && event.ports[0] ? event.ports[0] : null;

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (data.type === "CLEAR_CACHES") {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX))
            .map((key) => caches.delete(key))
        );
        if (replyPort) replyPort.postMessage({ cleared: true });
      })()
    );
  }

  if (data.type === "PREWARM_URLS") {
    event.waitUntil(
      (async () => {
        const result = await prewarmUrls(data.urls);
        if (replyPort) replyPort.postMessage(result);
      })()
    );
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "lou-contact-outbox-sync") {
    event.waitUntil(
      (async () => {
        const windowClients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: false,
        });
        for (const client of windowClients) {
          client.postMessage({ type: "FLUSH_OUTBOX" });
        }
      })()
    );
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const networkRes = await fetch(request);
  if (networkRes.ok) {
    await cache.put(request, networkRes.clone());
  }
  return networkRes;
}

async function staleWhileRevalidate(request, url, cacheName, shouldTrimMedia) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(async (res) => {
      if (res.ok || res.type === "opaque") {
        await cache.put(request, res.clone());
        if (shouldTrimMedia) {
          void trimMediaCache();
        }
      }
      return res;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const networkRes = await networkPromise;
  if (networkRes) {
    return networkRes;
  }

  // Fallback for Next.js optimized /_next/image?url=... when source file was precached
  if (url.origin === self.location.origin && url.pathname === "/_next/image") {
    const rawTarget = url.searchParams.get("url");
    if (rawTarget && (rawTarget.startsWith("/") || rawTarget.startsWith("https://"))) {
      const originImage = await cache.match(rawTarget);
      if (originImage) return originImage;
    }
  }

  return new Response("", { status: 504, statusText: "Offline asset miss" });
}

async function networkFirstJson(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const networkRes = await fetchWithTimeout(request, 3500);
    if (networkRes.ok) {
      await cache.put(request, networkRes.clone());
    }
    return networkRes;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({
        error: "Offline — cached portfolio snapshot unavailable.",
        offline: true,
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

async function networkFirstNavigation(request, url) {
  const cache = await caches.open(SHELL_CACHE);

  // Admin portal stays strictly online-first and is never cached in CacheStorage
  if (url.pathname.startsWith("/admin")) {
    try {
      return await fetchWithTimeout(request, 4500);
    } catch {
      const offlinePage = await cache.match("/offline");
      return (
        offlinePage ||
        new Response("Offline — Reconnect to access /admin.", { status: 503 })
      );
    }
  }

  try {
    const networkRes = await fetchWithTimeout(request, 4000);
    if (networkRes.ok && isHtmlResponse(networkRes)) {
      await cache.put(url.pathname, networkRes.clone());
    }
    return networkRes;
  } catch {
    const cachedPage =
      (await cache.match(url.pathname)) ||
      (await cache.match("/")) ||
      (await cache.match("/offline"));

    return (
      cachedPage ||
      new Response("Offline — Unable to load cached page.", { status: 503 })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (!sameOrigin) {
    if (isSupabasePublicMediaUrl(url)) {
      event.respondWith(staleWhileRevalidate(request, url, MEDIA_CACHE, true));
    }
    return;
  }

  // Never cache authenticated admin APIs, contact submissions, analytics, or live Next RSC payloads
  if (
    url.pathname.startsWith("/api/admin") ||
    url.pathname.startsWith("/api/contact") ||
    url.pathname.startsWith("/api/analytics") ||
    isNextRscRequest(request, url)
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request, url));
    return;
  }

  if (url.pathname === "/api/portfolio") {
    event.respondWith(networkFirstJson(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isSameOriginStaticPath(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, url, STATIC_CACHE, false));
    return;
  }

  if (isSameOriginMediaPath(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, url, MEDIA_CACHE, true));
  }
});
