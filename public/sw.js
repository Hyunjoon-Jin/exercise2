/* 서비스 워커 — 복약 알림 + 오프라인 앱 셸.
 *
 * 이 파일은 번들러를 거치지 않고 그대로 서빙된다. 최신 문법을 쓰기보다
 * 브라우저가 바로 이해할 수 있는 형태로 단순하게 유지한다.
 *
 * ===========================================================================
 * ⚠️ 캐시 규칙 — 건강 데이터는 캐시하지 않는다
 *
 * 캐시에 들어가는 것은 두 가지뿐이다:
 *   1. 오프라인 안내 페이지 (개인 정보 없음)
 *   2. /_next/static 의 해시 붙은 정적 자산 (개인 정보 없음)
 *
 * 화면 HTML, RSC 페이로드, API 응답에는 복약 이력과 검진 수치가 실려 있다.
 * 서비스 워커 캐시는 오리진 단위로 디스크에 남는 저장소라, 공용 기기에서
 * 로그아웃한 뒤에도 그 내용이 남는다. 민감정보를 그렇게 흘릴 수는 없다.
 * 네트워크 응답은 캐시하지 않고, 실패했을 때 안내만 띄운다.
 * ===========================================================================
 */

const CACHE = "health-shell-v1";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));

  // 새 워커를 즉시 활성화한다. 알림 로직이 바뀌었을 때 사용자가 모든 탭을
  // 닫을 때까지 기다리게 하지 않기 위함.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // 이전 버전 캐시를 지운다. 남겨두면 옛 정적 자산이 계속 살아난다.
      .then((keys) =>
        Promise.all(keys.map((key) => (key === CACHE ? undefined : caches.delete(key)))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 정적 자산: 캐시 우선. 개인 정보가 없고 파일명 해시로 버전이 갈린다.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response && response.status === 200) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // 화면 이동: 항상 네트워크. 실패했을 때만 오프라인 안내를 띄운다.
  // 응답은 캐시하지 않는다 — 건강 화면 HTML 이 디스크에 남는다.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match(OFFLINE_URL)
          .then(
            (cached) =>
              cached ||
              new Response("오프라인입니다.", {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              }),
          ),
      ),
    );
    return;
  }

  // 나머지(RSC 페이로드, API, Supabase)는 손대지 않는다.
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "복약 알림";
  const options = {
    body: payload.body || "복용할 시간입니다.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || "medication",
    // 같은 태그의 알림을 갱신할 때 다시 소리를 내지 않는다.
    renotify: false,
    data: { url: payload.url || "/medications" },
    actions: [{ action: "open", title: "확인하기" }],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || "/medications";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // 이미 열려 있는 탭이 있으면 새 창을 띄우지 않고 그쪽으로 보낸다.
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
