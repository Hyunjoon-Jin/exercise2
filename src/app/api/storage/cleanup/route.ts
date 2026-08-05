import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** 한 번에 처리할 최대 건수. 타임아웃보다 먼저 끝나야 다음 회차가 이어받는다. */
const BATCH_SIZE = 200;

/**
 * Storage 정리 배치.
 *
 * 0008 에서 만든 storage_cleanup_queue 의 소비자다. 검진 문서 행이 지워질 때
 * 트리거가 경로를 남기는데, 지금까지 그걸 읽는 쪽이 없어 파일이 그대로
 * 남아 있었다. 파기 의무는 "행을 지웠다"로 끝나지 않는다 — 객체가 사라져야
 * 끝난다.
 *
 * 앱이 정상 경로로 지울 때는 그 자리에서 파일도 지운다. 이 배치는 그게
 * 실패했거나(네트워크 오류) cascade 로만 지워진 경우를 뒤늦게 메운다.
 *
 * pg_cron 설정은 0006 하단 주석과 같은 방식이다 (하루 한 번이면 충분).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: pending, error } = await supabase
    .from("storage_cleanup_queue")
    .select("id, bucket_id, storage_path")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const rows = pending ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ pending: 0, removed: 0 });
  }

  // 버킷별로 묶어서 한 번씩 호출한다.
  const byBucket = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byBucket.get(row.bucket_id) ?? [];
    list.push(row);
    byBucket.set(row.bucket_id, list);
  }

  let removed = 0;
  const failedBuckets: string[] = [];

  for (const [bucket, items] of byBucket) {
    const { error: removeError } = await supabase.storage
      .from(bucket)
      .remove(items.map((item) => item.storage_path));

    if (removeError) {
      // 다음 회차에 다시 시도하도록 완료 표시를 하지 않는다.
      failedBuckets.push(bucket);
      continue;
    }

    // 이미 없는 객체를 지워도 remove 는 성공한다. 그래서 완료 표시를
    // 여기서 한 번에 해도 안전하다.
    const { error: markError } = await supabase
      .from("storage_cleanup_queue")
      .update({ deleted_at: new Date().toISOString() })
      .in(
        "id",
        items.map((item) => item.id),
      );

    if (markError) {
      // 파일은 지워졌는데 표시에 실패한 경우. 다음 회차가 같은 경로를
      // 다시 지우려 하지만 그건 무해하다.
      failedBuckets.push(bucket);
      continue;
    }

    removed += items.length;
  }

  return NextResponse.json({
    pending: rows.length,
    removed,
    failed_buckets: failedBuckets,
  });
}
