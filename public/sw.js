/* 복약 알림용 서비스 워커.
 *
 * 이 파일은 번들러를 거치지 않고 그대로 서빙된다. 최신 문법을 쓰기보다
 * 브라우저가 바로 이해할 수 있는 형태로 단순하게 유지한다.
 */

self.addEventListener("install", () => {
  // 새 워커를 즉시 활성화한다. 알림 로직이 바뀌었을 때 사용자가 모든 탭을
  // 닫을 때까지 기다리게 하지 않기 위함.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
