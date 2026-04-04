/**
 * EHSC Connect — Service Worker
 * ──────────────────────────────────────────────────────────────
 *
 * 역할:
 *   1. PWA 설치 가능 조건 충족 (manifest + HTTPS + SW)
 *   2. 정적 파일 캐싱으로 재방문 속도 향상
 *   3. 오프라인 시 앱 셸(index.html) 제공
 *
 * 캐시 전략:
 *   - 탐색(navigate) 요청    → 네트워크 우선, 실패 시 캐시된 index.html 반환
 *   - JS/CSS/이미지/폰트     → 캐시 우선, 캐시 미스 시 네트워크 fetch 후 캐시 저장
 *   - Notion Worker API 호출 → SW 관여 없음 (cross-origin, fetch 그대로 통과)
 *
 * 버전 업그레이드 방법:
 *   CACHE_NAME의 버전 숫자를 올리면 다음 방문 시 자동으로 구 캐시 삭제 후 갱신됩니다.
 *   예: 'ehsc-connect-v1' → 'ehsc-connect-v2'
 */

const CACHE_NAME = 'ehsc-connect-v1';

// 설치 시 미리 캐싱할 앱 셸 리소스
const PRECACHE_URLS = [
  '/',
  '/index.html',
];

// ── 설치 ──────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // 이전 SW를 기다리지 않고 즉시 활성화
  self.skipWaiting();
});

// ── 활성화 ────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) =>
      Promise.all(
        keyList
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // 새 SW가 열려 있는 모든 탭을 즉시 제어
  self.clients.claim();
});

// ── 요청 가로채기 ─────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // GET 이외의 요청(POST 등)은 SW 관여 없음
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 동일 출처가 아닌 외부 API(Notion Worker 등)는 SW 관여 없음
  if (url.origin !== self.location.origin) return;

  // ── 탐색 요청 (HTML 페이지 이동): 네트워크 우선 ──
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // ── 정적 파일: 캐시 우선, 없으면 네트워크 후 캐시 저장 ──
  if (/\.(js|css|png|jpg|jpeg|svg|ico|webp|woff|woff2)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          // 정상 응답만 캐시 (오류 응답은 저장하지 않음)
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          return response;
        });
      })
    );
  }
});
