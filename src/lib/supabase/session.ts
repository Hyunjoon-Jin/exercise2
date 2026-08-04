import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/db/types";

import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/** 로그인 없이 접근 가능한 경로 */
const PUBLIC_PATHS = ["/", "/login", "/signup", "/auth", "/legal"];

/** 동의를 아직 마치지 않아도 접근 가능한 경로 (동의 절차 자체 + 로그아웃) */
const CONSENT_EXEMPT_PATHS = ["/onboarding", "/auth", "/legal"];

function matches(pathname: string, paths: string[]): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * 세션 갱신 + 접근 제어.
 *
 * 중요: getUser() 를 반드시 호출해야 한다. getSession() 은 쿠키를 그대로
 * 신뢰하므로 위조 가능하지만, getUser() 는 Supabase 서버에 토큰을 검증시킨다.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // 미인증 사용자가 보호된 경로에 접근 → 로그인으로
  if (!user && !matches(pathname, PUBLIC_PATHS)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user) {
    // 이미 로그인한 사용자가 로그인/가입 페이지에 접근 → 대시보드로
    if (pathname === "/login" || pathname === "/signup") {
      const url = request.nextUrl.clone();
      url.pathname = "/today";
      url.search = "";
      return NextResponse.redirect(url);
    }

    // 필수 동의를 마치지 않았으면 온보딩으로 강제 이동.
    //
    // 건강정보는 민감정보이므로 별도 동의 없이 어떤 건강 데이터도
    // 수집·표시해서는 안 된다. 이 게이트가 그 경계다.
    if (!matches(pathname, CONSENT_EXEMPT_PATHS)) {
      const { data: hasConsent } = await supabase.rpc("has_required_consents");

      if (hasConsent === false) {
        const url = request.nextUrl.clone();
        url.pathname = "/onboarding/consent";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}
