import { NextResponse, type NextRequest } from "next/server";

import { ExtractionError, extractCheckup, isExtractionConfigured } from "@/lib/checkup/extract";
import { normalizeCheckupDate, normalizeExtraction } from "@/lib/checkup/normalize";
import type { MetricHint } from "@/lib/checkup/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * 결과지 한 장을 판독하는 데 수십 초가 걸린다. 항목이 많은 종합검진표는
 * 1분을 넘기기도 한다. 기본 상한(초 단위)으로는 중간에 잘린다.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** 사용자에게 보여줄 실패 메시지와 HTTP 코드. */
const ERROR_STATUS: Record<ExtractionError["kind"], number> = {
  not_configured: 503,
  unsupported_type: 415,
  too_large: 413,
  refused: 422,
  api: 502,
};

/**
 * 검진 결과지 자동 판독.
 *
 * 흐름: 문서 확인 → extraction(running) 생성 → 파일 내려받기 → 모델 호출 →
 *       정규화 → items 저장 → status=review.
 *
 * ⚠️ 여기서 health_metrics 에는 아무것도 쓰지 않는다. 저장은 사용자가 검수
 *    화면에서 확정할 때 confirm_checkup_extraction() 이 한다. (docs/PLAN.md §6)
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: checkupId } = await params;

  if (!isExtractionConfigured()) {
    return NextResponse.json(
      { error: "not_configured", message: "판독 서버가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // RLS 가 남의 검진을 걸러 주므로 소유권 검사를 따로 하지 않는다.
  const { data: document } = await supabase
    .from("checkup_documents")
    .select("id, storage_path, mime_type")
    .eq("checkup_id", checkupId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!document) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // 이미 돌고 있는 판독이 있으면 중복 호출을 막는다. 같은 문서를 두 번
  // 판독하면 비용만 두 배가 되고 검수 화면에는 항목이 두 벌 뜬다.
  const { data: running } = await supabase
    .from("checkup_extractions")
    .select("id")
    .eq("checkup_id", checkupId)
    .in("status", ["pending", "running"])
    .limit(1)
    .maybeSingle();

  if (running) {
    return NextResponse.json(
      { error: "already_running", message: "이미 판독 중입니다." },
      { status: 409 },
    );
  }

  const { data: extraction, error: extractionError } = await supabase
    .from("checkup_extractions")
    .insert({
      checkup_id: checkupId,
      document_id: document.id,
      user_id: user.id,
      model: "claude-opus-5",
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (extractionError || !extraction) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  /** 실패해도 흔적을 남긴다 — 사용자가 왜 안 됐는지 볼 수 있어야 한다. */
  const fail = async (kind: ExtractionError["kind"] | "internal", message: string) => {
    await supabase
      .from("checkup_extractions")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", extraction.id);

    const status = kind === "internal" ? 500 : ERROR_STATUS[kind];
    return NextResponse.json({ error: kind, message }, { status });
  };

  const { data: blob, error: downloadError } = await supabase.storage
    .from("checkup-documents")
    .download(document.storage_path);

  if (downloadError || !blob) {
    return fail("internal", "원본 파일을 읽지 못했습니다.");
  }

  // 판독에 쓸 지표 목록. 스키마 enum 과 프롬프트 표가 같은 출처에서 나와야
  // 모델이 낸 코드를 서버가 다시 걸러낼 일이 없다.
  const { data: definitions } = await supabase
    .from("metric_definitions")
    .select("code, display_name, unit")
    .order("code");

  const metrics: MetricHint[] = definitions ?? [];

  if (metrics.length === 0) {
    return fail("internal", "지표 정의를 읽지 못했습니다.");
  }

  let result;
  try {
    result = await extractCheckup(
      {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        mimeType: document.mime_type,
      },
      metrics,
    );
  } catch (error) {
    if (error instanceof ExtractionError) return fail(error.kind, error.message);
    return fail("internal", "판독 중 오류가 발생했습니다.");
  }

  const { results, droppedCount } = normalizeExtraction(result.payload, {
    validCodes: new Set(metrics.map((metric) => metric.code)),
  });

  if (results.length > 0) {
    const { error: itemsError } = await supabase.from("checkup_extraction_items").insert(
      results.map((row) => ({
        extraction_id: extraction.id,
        user_id: user.id,
        raw_label: row.raw_label || row.raw_value,
        raw_value: row.raw_value || null,
        raw_unit: row.raw_unit,
        reference_range: row.reference_range,
        confidence: row.confidence,
        page_number: row.page_number,
        metric_code: row.metric_code,
        value: row.value,
        unit: row.unit,
      })),
    );

    if (itemsError) {
      return fail("internal", "판독 결과를 저장하지 못했습니다.");
    }
  }

  await supabase
    .from("checkup_extractions")
    .update({
      status: "review",
      // 원본 응답을 남긴다. 판독이 틀렸을 때 프롬프트 탓인지 모델 탓인지
      // 되짚으려면 정규화 전 값이 필요하다.
      raw_output: result.payload as unknown as Record<string, never>,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      completed_at: new Date().toISOString(),
    })
    .eq("id", extraction.id);

  // 결과지에서 읽은 검진일이 사용자가 입력한 것과 다를 수 있다. 덮어쓰지
  // 않고 응답으로만 알려 준다 — 어느 쪽이 맞는지는 사용자가 판단한다.
  const detectedDate = normalizeCheckupDate(result.payload.checkup_date);

  return NextResponse.json({
    extraction_id: extraction.id,
    item_count: results.length,
    needs_attention: results.filter((row) => row.needsAttention).length,
    dropped_count: droppedCount,
    detected_date: detectedDate,
    detected_institution: result.payload.institution ?? null,
  });
}
