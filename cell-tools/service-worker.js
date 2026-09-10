/* 인계용 워커 — 서비스워커가 사이트 최상위(/service-worker.js)로 이동했습니다.
 * 이 파일은 기존 /cell-tools/ 범위로 설치된 클라이언트를 넘겨주기 위해 남겨둡니다.
 *
 * 이 워커가 하는 일
 *  1) 인계가 끝날 때까지 옛 캐시로 오프라인 응답을 계속 제공한다.
 *     (fetch 핸들러가 없으면 이 워커가 제어하는 페이지는 오프라인에서 아무 응답도 못 받는다.)
 *  2) 최상위 워커가 activate를 마치며 남긴 준비 표식을 확인한 뒤에만 물러난다.
 *     표식은 최상위 워커의 activate 마지막에 기록되므로,
 *     표식의 존재 = "필수 파일 저장 + 활성화 완료"를 뜻한다.
 *     캐시가 생겼는지(caches.has)나 install 완료만으로는 이 보장을 얻을 수 없다.
 *  3) 확인은 activate 한 번이 아니라 매 요청 때 다시 한다.
 *     activate는 워커 버전당 한 번만 실행되므로, 거기서 그냥 돌아오면 재시도 기회가 없다.
 *  4) 물러날 때 열려 있는 창을 강제로 새로고침하지 않는다.
 *     계산기에 입력 중인 값이 사라질 수 있다. 등록만 해제하면
 *     사용자가 다음에 페이지를 열 때 최상위 워커가 자연스럽게 담당한다.
 */
const NEW_CACHE = 'dovbio-v7';
const READY_KEY = '/__sw-ready__';
const OLD_CACHE_PREFIX = 'dovbio-cell-tools-';

let retiring = false;

async function newWorkerReady() {
  try {
    // cacheName을 지정해 조회한다. caches.open을 쓰면 없는 캐시를 만들어버린다.
    const hit = await caches.match(READY_KEY, { cacheName: NEW_CACHE });
    return !!hit;
  } catch (e) {
    return false;
  }
}

async function retireIfReady() {
  if (retiring) return;
  if (!(await newWorkerReady())) return;   // 아직이면 이번 요청에서는 그대로 둔다.
  retiring = true;

  try {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith(OLD_CACHE_PREFIX)).map((k) => caches.delete(k))
    );
  } catch (e) {}

  try { await self.registration.unregister(); } catch (e) {}
  // 창 새로고침은 하지 않는다 — 위 4) 참고.
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim().then(retireIfReady));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // 다른 도메인(분석·폰트 등) 요청은 건드리지 않는다.
  if (new URL(req.url).origin !== self.location.origin) return;

  // 매 요청마다 인계 조건을 다시 확인한다. 응답 처리와는 분리한다.
  event.waitUntil(retireIfReady());

  // 페이지 이동만 HTML로 폴백한다.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () =>
        (await caches.match(req, { ignoreSearch: true }))
        || (await caches.match('/cell-tools/index.html'))
        || Response.error()
      )
    );
    return;
  }

  // 그 외 리소스(이미지·CSS·JS)는 해당 요청의 캐시만 반환한다.
  // 실패했다고 HTML을 돌려주면 이미지 자리에 HTML이 들어가는 꼴이 된다.
  event.respondWith(
    fetch(req).catch(async () =>
      (await caches.match(req, { ignoreSearch: true })) || Response.error()
    )
  );
});
