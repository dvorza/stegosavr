const CACHE_PREFIX = "stegosavr-pwa";
const CACHE_NAME = `${CACHE_PREFIX}-v2`;

const appScope = new URL(self.registration.scope);
const stableShellUrls = ["./", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"].map(
  (path) => new URL(path, appScope).toString(),
);
const fallbackDocumentUrl = new URL("./index.html", appScope).toString();

self.addEventListener("install", (event) => {
  event.waitUntil(precacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetchAndCache(request).catch(() => caches.match(fallbackDocumentUrl)));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached ?? fetchAndCache(request)));
});

async function fetchAndCache(request) {
  const response = await fetch(request);

  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }

  return response;
}

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(stableShellUrls);

  const indexResponse = await fetch(fallbackDocumentUrl, { cache: "reload" });

  if (!indexResponse.ok) {
    throw new Error("Unable to cache app shell.");
  }

  await cache.put(fallbackDocumentUrl, indexResponse.clone());
  const indexHtml = await indexResponse.text();
  const indexAssets = extractHtmlAssetUrls(indexHtml, fallbackDocumentUrl);
  await cache.addAll(indexAssets);

  const scriptUrls = indexAssets.filter((url) => url.endsWith(".js"));
  const wasmUrls = await extractWasmUrlsFromScripts(scriptUrls);

  if (wasmUrls.length > 0) {
    await cache.addAll(wasmUrls);
  }
}

function extractHtmlAssetUrls(html, baseUrl) {
  return uniqueSameOriginUrls(
    [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((match) => new URL(match[1], baseUrl).toString()),
  );
}

async function extractWasmUrlsFromScripts(scriptUrls) {
  const scriptTexts = await Promise.all(
    scriptUrls.map((url) => fetch(url, { cache: "reload" }).then((response) => (response.ok ? response.text() : ""))),
  );
  return uniqueSameOriginUrls(
    scriptTexts.flatMap((text) =>
      [...text.matchAll(/["'`]([^"'`]+\.wasm)["'`]/g)].map((match) => new URL(match[1], appScope).toString()),
    ),
  );
}

function uniqueSameOriginUrls(urls) {
  return [...new Set(urls)].filter((url) => {
    const parsed = new URL(url);

    return parsed.origin === self.location.origin && parsed.pathname.startsWith(appScope.pathname);
  });
}
