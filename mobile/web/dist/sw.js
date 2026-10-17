/* WorkBuddy Mobile Service Worker
 * 只缓存带 hash 的静态资源与外壳；/m/api/* 一律走网络、绝不缓存
 * （账号、密钥明文、会话都在接口里，不能落进 Cache Storage）。
 */
const VERSION = 'wbm-v1'
const SHELL = ['/m/', '/m/manifest.webmanifest', '/m/icons/icon-192.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  if (url.pathname.startsWith('/m/api/')) return            // NetworkOnly
  if (url.pathname.startsWith('/m/assets/')) {               // CacheFirst（文件名带 hash）
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)) }
      return res
    })))
    return
  }
  if (e.request.mode === 'navigate') {                       // NetworkFirst，离线回落外壳
    e.respondWith(fetch(e.request).catch(() => caches.match('/m/')))
  }
})
