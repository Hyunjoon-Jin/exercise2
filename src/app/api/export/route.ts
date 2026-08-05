import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * 내 데이터 내려받기.
 *
 * 두 가지 약속을 코드로 지키는 자리다.
 *   - 개인정보 처리방침 §7 열람권 — 화면에서 하나씩 보는 것 말고, 전체를
 *     한 번에 받아 볼 수 있어야 실질적인 열람이다
 *   - 이용약관 제7조 ③ 서비스 종료 시 데이터 반출
 *
 * RLS 를 우회하지 않는 클라이언트로 읽는다. 각 쿼리에 user_id 조건을 걸지
 * 않아도 정책이 자기 행만 돌려주므로, 조건을 빠뜨려 남의 데이터가 섞이는
 * 사고가 구조적으로 일어나지 않는다.
 */

/** 내보낼 테이블. 사용자 소유 데이터만 — 마스터 데이터는 뺀다. */
const TABLES = [
  "profiles",
  "health_metrics",
  "sleep_records",
  "medications",
  "medication_schedules",
  "medication_logs",
  "user_foods",
  "meals",
  "meal_items",
  "workouts",
  "checkups",
  "checkup_documents",
  "checkup_extractions",
  "checkup_extraction_items",
  "user_consents",
] as const;

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const data: Record<string, unknown[]> = {};

  for (const table of TABLES) {
    const { data: rows, error } = await supabase.from(table).select("*");

    if (error) {
      return NextResponse.json({ error: "query_failed", table }, { status: 500 });
    }

    data[table] = rows ?? [];
  }

  const exportedAt = new Date();

  const body = {
    exported_at: exportedAt.toISOString(),
    account: { id: user.id, email: user.email },
    // 결과지 원본 파일은 포함하지 않는다. 파일까지 담으면 응답이 수십 MB 가
    // 되고, 원본은 검진 화면에서 따로 내려받을 수 있다. 경로 목록은
    // checkup_documents 에 들어 있다.
    note:
      "검진 결과지 원본 파일은 포함되어 있지 않습니다. 각 검진 화면에서 내려받을 수 있습니다.",
    data,
  };

  const filename = `건강기록_내보내기_${exportedAt.toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // RFC 5987 — 한글 파일명을 그대로 쓰면 헤더에서 깨진다.
      "Content-Disposition": `attachment; filename="health-record-export.json"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
