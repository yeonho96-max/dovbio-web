/* DOVBIO Cell Tools — Service Worker
 * 전략: 필수 앱 파일은 반드시 precache, 외부 폰트는 실패해도 되는 runtime cache.
 * 폰트 캐싱 실패가 SW 설치 전체를 막지 않도록 분리한다.
 */
const CACHE = 'dovbio-cell-tools-v2';

// 필수 앱 파일 (하나라도 실패하면 설치 실패 → 반드시 존재해야 하는 것만)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

// 런타임 캐시 대상 (외부 폰트 CDN) — 실패해도 무방
const FONT_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      // 필수 파일만 addAll. 폰트는 여기 넣지 않는다(하나 실패 시 전체 실패 방지).
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) 외부 폰트: 캐시 우선, 없으면 네트워크 시도 후 캐시에 저장. 실패해도 조용히 넘어감.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req).then((hit) => {
          if (hit) return hit;
          return fetch(req).then((res) => {
            // opaque 응답도 캐시(폰트 CORS). 실패하면 그냥 네트워크 결과 반환.
            try { cache.put(req, res.clone()); } catch (e) {}
            return res;
          }).catch(() => hit); // 오프라인이고 캐시도 없으면 undefined → 시스템 폰트로 대체됨
        })
      )
    );
    return;
  }

  // 2) 페이지 네비게이션: 네트워크 우선, 실패 시 캐시된 index.html (오프라인 재실행 보장)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 3) 그 외 앱 리소스: 캐시 우선, 없으면 네트워크
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req))
  );
});
