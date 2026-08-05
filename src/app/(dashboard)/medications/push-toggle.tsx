"use client";

import { useEffect, useState } from "react";

type PushState =
  | "loading"
  | "unsupported"
  | "not_configured"
  | "denied"
  | "off"
  | "on"
  | "working";

/**
 * base64url VAPID 공개키를 Uint8Array 로. 브라우저 API 가 이 형식만 받는다.
 *
 * ArrayBuffer 를 먼저 만들고 뷰를 씌우는 이유: Uint8Array.from() 이 돌려주는
 * Uint8Array<ArrayBufferLike> 는 BufferSource(ArrayBuffer 기반)로 받아들여지지 않는다.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);

  const view = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    view[i] = raw.charCodeAt(i);
  }
  return view;
}

/**
 * 복용 알림 켜기/끄기.
 *
 * iOS Safari 는 홈 화면에 추가한 PWA 에서만 웹 푸시를 지원한다.
 * 지원하지 않는 환경에서 버튼만 덩그러니 두면 눌러도 아무 일이 없으므로
 * 상태별로 이유를 설명한다.
 */
export function PushToggle() {
  const [state, setState] = useState<PushState>("loading");
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    let cancelled = false;

    // 판정을 async 함수 하나로 모아 setState 를 한 번만 호출한다.
    // 분기마다 동기적으로 setState 하면 렌더가 연쇄로 일어난다.
    async function resolveState(): Promise<PushState> {
      if (!publicKey) return "not_configured";
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return "unsupported";
      }
      if (Notification.permission === "denied") return "denied";

      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();
        return subscription ? "on" : "off";
      } catch {
        return "unsupported";
      }
    }

    resolveState().then((next) => {
      if (!cancelled) setState(next);
    });

    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  async function enable() {
    if (!publicKey) return;
    setState("working");

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      setState(response.ok ? "on" : "off");
    } catch {
      setState("off");
    }
  }

  async function disable() {
    setState("working");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch(
          `/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`,
          { method: "DELETE" },
        );
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setState("on");
    }
  }

  if (state === "loading") {
    return <p className="text-sm text-muted">확인 중…</p>;
  }

  if (state === "not_configured") {
    return (
      <p className="text-sm text-muted">
        알림 서버가 아직 설정되지 않았습니다. 관리자가 VAPID 키를 등록하면 사용할 수
        있습니다.
      </p>
    );
  }

  if (state === "unsupported") {
    return (
      <p className="text-sm text-muted">
        이 브라우저에서는 웹 알림을 지원하지 않습니다. iPhone 은 사파리에서 &lsquo;홈
        화면에 추가&rsquo; 후 사용할 수 있습니다.
      </p>
    );
  }

  if (state === "denied") {
    return (
      <p className="text-sm text-muted">
        알림이 차단되어 있습니다. 브라우저 사이트 설정에서 알림을 허용해 주세요.
      </p>
    );
  }

  const on = state === "on";
  const working = state === "working";

  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm text-muted">
        {on
          ? "복용 시간에 알림을 받습니다."
          : "복용 시간에 알림을 받으려면 켜 주세요."}
      </p>
      <button
        type="button"
        onClick={on ? disable : enable}
        disabled={working}
        className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
          on
            ? "border border-border hover:bg-surface"
            : "bg-brand-600 text-white hover:bg-brand-700"
        }`}
      >
        {working ? "처리 중…" : on ? "끄기" : "알림 켜기"}
      </button>
    </div>
  );
}
