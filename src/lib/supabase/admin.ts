import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";

import { getSupabaseUrl } from "./env";

/**
 * service_role 클라이언트 — RLS 를 우회한다.
 *
 * 스케줄러처럼 사용자 세션이 없는 서버 작업에서만 쓴다. 이 클라이언트가
 * 요청 처리 경로로 새어 들어가면 사용자 격리가 통째로 무력화되므로,
 * 호출부는 반드시 별도의 인증(예: CRON_SECRET)을 먼저 통과시켜야 한다.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다.");
  }

  return createSupabaseClient<Database>(getSupabaseUrl(), serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
