"use client";

import { useEffect } from "react";

/**
 * 서비스 워커 등록.
 *
 * 복약 알림을 켤 때만 등록하면, 알림을 쓰지 않는 사용자는 오프라인 안내도
 * 받지 못한다. 앱을 열 때 한 번 등록해 두 기능이 같은 워커를 공유하게 한다.
 *
 * 렌더링에 관여하지 않으므로 아무것도 그리지 않는다.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // 첫 화면 렌더를 워커 등록과 경쟁시키지 않는다.
    const timer = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 등록 실패는 조용히 넘긴다. 워커 없이도 앱은 그대로 동작한다.
      });
    }, 1_000);

    return () => clearTimeout(timer);
  }, []);

  return null;
}
