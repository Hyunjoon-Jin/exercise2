import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * 이메일 인증 링크 / OAuth 리디렉션 처리.
 *
 * 코드를 세션으로 교환한 뒤 온보딩으로 보낸다. 이미 동의를 마친 사용자는
 * proxy 가 대시보드로 다시 보내므로 여기서 분기할 필요는 없다.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/onboarding/consent";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  // 오픈 리디렉션 방지 — 내부 경로만 허용한다.
  const safeNext = next.startsWith("/") ? next : "/onboarding/consent";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
