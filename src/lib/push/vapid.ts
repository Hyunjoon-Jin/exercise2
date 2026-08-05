import "server-only";

import webpush from "web-push";

/**
 * VAPID 설정.
 *
 * 키 쌍은 한 번 만들어 환경변수로 넣는다:
 *   npx web-push generate-vapid-keys
 *
 * 공개키는 브라우저에 노출되어야 하므로 NEXT_PUBLIC_ 접두사를 쓰고,
 * 비밀키는 절대 클라이언트로 나가면 안 된다.
 */
let configured = false;

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

export function getWebPush(): typeof webpush | null {
  if (!isPushConfigured()) return null;

  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }

  return webpush;
}
