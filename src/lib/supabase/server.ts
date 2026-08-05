import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/db/types";

import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * 서버 컴포넌트 / 서버 액션 / 라우트 핸들러용 Supabase 클라이언트.
 *
 * Next.js 16 에서 cookies() 는 비동기이므로 이 함수도 async 다.
 * 호출할 때마다 새로 만들어야 한다 — 요청 간에 재사용하면 다른 사용자의
 * 세션으로 쿼리가 나갈 수 있다.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다.
          // 세션 갱신은 proxy.ts 가 담당하므로 여기서는 무시해도 된다.
        }
      },
    },
  });
}
