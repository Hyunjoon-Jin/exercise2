import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/db/types";

import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * 브라우저(클라이언트 컴포넌트)용 Supabase 클라이언트.
 *
 * 이 클라이언트로 오는 모든 쿼리는 사용자의 JWT 로 실행되므로
 * RLS 정책이 그대로 적용된다. 즉 다른 사용자의 행은 애초에 보이지 않는다.
 */
export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey());
}
