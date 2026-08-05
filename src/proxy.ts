import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/session";

/**
 * Next.js 16 의 proxy 규약. (15 이전의 middleware.ts 를 대체한다)
 *
 * 여기서 하는 일은 두 가지다.
 *   1. Supabase 세션 토큰 갱신 — 건너뛰면 만료된 토큰으로 렌더링되어
 *      로그아웃된 것처럼 보인다.
 *   2. 접근 제어 — 미인증 차단 + 필수 동의 게이트.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // 정적 자산을 제외한 모든 경로. 세션 갱신이 필요하므로 범위를 넓게 잡는다.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
