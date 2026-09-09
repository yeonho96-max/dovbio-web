/* DOVBIO — Service Worker (사이트 최상위)
 * 범위: / 전체. 대문·계산기 어느 화면에서도 홈화면 추가 시 앱으로 설치된다.
 *
 * 설계 원칙
 *  1) REQUIRED(페이지 HTML)는 전부 저장돼야 설치 성공. 하나라도 실패하면 설치를 중단해,
 *     "대문이 빠진 채로 활성화되는" 상태를 만들지 않는다.
 *  2) OPTIONAL(아이콘·manifest·외부 폰트)은 실패해도 설치를 막지 않는다.
 *  3) REQUIRED가 전부 저장된 뒤에만 준비 표식(READY_KEY)을 마지막으로 기록한다.
 *     구 /cell-tools/ 워커는 이 표식이 있을 때만 물러난다.
 *     캐시 존재 여부(caches.has)는 open 시점에 이미 참이 되므로 준비 신호로 쓸 수 없다.
 *  4) 캐시 정리는 이 워커가 만든 'dovbio-v*'만 대상으로 한다.
 *     구 워커의 'dovbio-cell-tools-*'는 건드리지 않는다 — 전환이 끝날 때까지
 *     구 워커가 그 캐시로 오프라인 응답을 계속 제공해야 하기 때문이다.
 */
const CACHE = 'dovbio-v6';
const OWN_PREFIX = 'dovbio-v';
const READY_KEY = '/__sw-ready__';

// 반드시 저장돼야 하는 페이지. 하나라도 실패하면 설치 실패.
const REQUIRED = [
  '/',
  '/index.html',
  '/cell-tools/',
  '/cell-tools/index.html'
];

// 있으면 좋고 실패해도 무방한 것.
const OPTIONAL = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png'
];

// 런타임 캐시 대상 (외부 폰트 CDN) — 실패해도 무방
const FONT_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

function fetchAndPut(cache, url) {
  return fetch(new Request(url, { cache: 'reload' })).then((res) => {
    if (!res || !res.ok) throw new Error('bad response: ' + url);
    return cache.put(url, res);
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    // 이전 설치가 중간에 끊겼을 수 있으므로 준비 표식을 먼저 지운다.
    try { await cache.delete(READY_KEY); } catch (e) {}

    // 선택 리소스 — 실패는 삼킨다.
    await Promise.all(
      OPTIONAL.map((url) => fetchAndPut(cache, url).catch(() => null))
    );

    // 필수 페이지 — 하나라도 실패하면 예외가 올라가 설치가 실패한다.
    await Promise.all(REQUIRED.map((url) => fetchAndPut(cache, url)));

    // 준비 표식은 여기서 남기지 않는다. install 시점에는 아직 활성화 전이라,
    // 표식을 보고 구 워커가 물러나면 담당 워커가 없는 순간이 생긴다.
    // 표식은 activate 마지막에 기록한다.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 이 워커가 만든 이전 버전 캐시만 정리한다.
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith(OWN_PREFIX) && k !== CACHE).map((k) => caches.delete(k))
    );

    await self.clients.claim();

    // 활성화가 끝난 뒤에 준비 표식을 남긴다.
    // 표식이 dovbio-v6 캐시에 존재한다는 것은
    // "이 버전의 최상위 워커가 필수 파일을 갖추고 활성화까지 마쳤다"는 뜻이다.
    // 구 /cell-tools/ 워커는 이 표식만 보고 물러난다.
    const cache = await caches.open(CACHE);
    await cache.put(READY_KEY, new Response(CACHE, {
      headers: { 'Content-Type': 'text/plain' }
    }));
  })());
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

  // 분석 등 외부 도메인 요청은 서비스워커가 건드리지 않는다.
  if (url.origin !== self.location.origin) return;

  // 2) 페이지 이동: 네트워크 우선, 실패 시 같은 경로 → 대문 → 계산기 순으로 폴백
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const path = url.pathname;
        const c = await caches.open(CACHE);
        return (await c.match(req, { ignoreSearch: true }))
          || (await c.match(path))
          || (await c.match(path.endsWith('/') ? path + 'index.html' : path))
          || (await c.match('/index.html'))
          || (await c.match('/cell-tools/index.html'));
      })
    );
    return;
  }

  // 3) 그 외 리소스: 캐시 우선, 없으면 네트워크
  event.respondWith(
    caches.open(CACHE).then((c) => c.match(req)).then((hit) => hit || fetch(req))
  );
});
