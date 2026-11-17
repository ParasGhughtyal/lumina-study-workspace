/* Lumina service worker — offline-first shell for a local-first app. */
const VERSION = 'lumina-v2'
const SHELL = `${VERSION}-shell`
const RUNTIME = `${VERSION}-runtime`

const CORE = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL)
    await cache.addAll(CORE).catch(() => {})
    self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k.startsWith('lumina-') && !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Never cache API traffic — answers must always be live.
  if (url.origin !== location.origin && /generativelanguage|openrouter|groq|openai\.com|api\.openai/.test(url.hostname)) return

  if (url.origin === location.origin && url.pathname.startsWith('/assets/')) {
    // Hashed build output: immutable, cache-first forever.
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME)
      const hit = await cache.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) cache.put(req, res.clone())
      return res
    })())
    return
  }

  if (req.mode === 'navigate') {
    // App shell: network first, fall back to the cached shell when offline.
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        const cache = await caches.open(SHELL)
        cache.put('/index.html', res.clone())
        return res
      } catch {
        const cache = await caches.open(SHELL)
        return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error()
      }
    })())
    return
  }

  // Fonts and everything else: stale-while-revalidate.
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME)
    const hit = await cache.match(req)
    const refresh = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone())
      return res
    }).catch(() => null)
    return hit || (await refresh) || Response.error()
  })())
})
