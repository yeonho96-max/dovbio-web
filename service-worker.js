/* DOVBIO — Service Worker (사이트 최상위)
 * 범위: / 전체. 대문·계산기 어느 화면에서도 홈화면 추가 시 앱으로 설치된다.
 * 전략: 필수 앱 파일은 precache, 외부 폰트는 실패해도 되는 runtime cache.
 *       폰트 캐싱 실패가 SW 설치 전체를 막지 않도록 분리한다.
 */
const CACHE = 'dovbio-v4';

// 필수 파일 (하나라도 실패하면 설치 실패 → 반드시 존재하는 것만)
const APP_SHELL = [
  '/',
  '/index.html',
  '/cell-tools/',
  '/cell-tools/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png'
];

// 런타임 캐시 대상 (외부 폰트 CDN) — 실패해도 무방
const FONT_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
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

  // 1) 외부 폰트: 캐시 우선, 없으면 네트워크 시도 후 저장. 실패해도 조용히 넘어감.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req).then((hit) => {
          if (hit) return hit;
          return fetch(req).then((res) => {
            try { cache.put(req, res.clone()); } catch (e) {}
            return res;
          }).catch(() => hit); // 오프라인이고 캐시도 없으면 시스템 폰트로 대체됨
        })
      )
    );
    return;
  }

  // 분석/외부 요청은 서비스워커가 건드리지 않는다.
  if (url.origin !== self.location.origin) return;

  // 2) 페이지 이동: 네트워크 우선, 실패 시 같은 경로의 캐시본, 없으면 계산기로 폴백.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(req).then((hit) =>
          hit || caches.match('/cell-tools/index.html')
        )
      )
    );
    return;
  }

  // 3) 그 외 리소스: 캐시 우선, 없으면 네트워크
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req))
  );
});
