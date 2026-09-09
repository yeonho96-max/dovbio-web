/* 폐기됨 — 서비스워커가 사이트 최상위(/service-worker.js)로 이동했습니다.
 * 이 파일은 기존 /cell-tools/ 범위로 설치된 클라이언트를 정리하기 위해 남겨둡니다.
 * 하는 일: 옛 캐시를 지우고 자기 자신을 등록 해제한 뒤, 열려 있는 창을 새로고침합니다.
 * 새 서비스워커는 페이지가 다시 로드될 때 루트 범위로 등록됩니다.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {}

    try { await self.registration.unregister(); } catch (e) {}

    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => c.navigate(c.url));
    } catch (e) {}
  })());
});

/* fetch 가로채기 없음 — 모든 요청이 네트워크로 그대로 나간다. */
