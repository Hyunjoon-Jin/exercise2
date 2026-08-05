import type { ExtractedCheckup, ExtractedResult } from "./schema.ts";

export interface NormalizedResult extends ExtractedResult {
  /** 검수 UI 에서 확인이 필요한 항목을 위로 올리기 위한 표시 */
  needsAttention: boolean;
}

export interface NormalizeOptions {
  /** metric_definitions 에 실제로 존재하는 코드 */
  validCodes: Set<string>;
  /** 이 값 미만이면 검수 필요로 표시 */
  confidenceThreshold?: number;
}

const DEFAULT_THRESHOLD = 0.85;

/**
 * 모델 출력을 저장 가능한 형태로 정리한다.
 *
 * Structured Outputs 가 스키마는 보장하지만 내용까지 보장하지는 않는다.
 * 여기서 거르는 것들:
 *   - 목록에 없는 지표 코드 (스키마 enum 을 우회한 경우의 안전망)
 *   - 값 없이 이름만 있는 행
 *   - 범위를 벗어난 confidence
 */
export function normalizeExtraction(
  payload: ExtractedCheckup,
  options: NormalizeOptions,
): { results: NormalizedResult[]; droppedCount: number } {
  const threshold = options.confidenceThreshold ?? DEFAULT_THRESHOLD;
  const results: NormalizedResult[] = [];
  let dropped = 0;

  for (const raw of payload.results ?? []) {
    const label = typeof raw.raw_label === "string" ? raw.raw_label.trim() : "";
    const value = typeof raw.raw_value === "string" ? raw.raw_value.trim() : "";

    // 항목명도 값도 없으면 남길 이유가 없다.
    if (!label && !value) {
      dropped += 1;
      continue;
    }

    const code =
      raw.metric_code && options.validCodes.has(raw.metric_code) ? raw.metric_code : null;

    const numeric =
      typeof raw.value === "number" && Number.isFinite(raw.value) ? raw.value : null;

    const confidence = clamp01(raw.confidence);

    results.push({
      raw_label: label,
      raw_value: value,
      raw_unit: emptyToNull(raw.raw_unit),
      reference_range: emptyToNull(raw.reference_range),
      metric_code: code,
      // 코드가 없으면 값만 있어도 저장할 곳이 없다. 사용자가 코드를 지정하면 살아난다.
      value: numeric,
      unit: emptyToNull(raw.unit),
      page_number:
        typeof raw.page_number === "number" && raw.page_number > 0
          ? Math.floor(raw.page_number)
          : null,
      confidence,
      needsAttention: confidence < threshold || code === null || numeric === null,
    });
  }

  // 확인이 필요한 항목을 위로. 검수 화면에서 먼저 눈에 들어와야 한다.
  results.sort((a, b) => {
    if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
    return (a.page_number ?? 0) - (b.page_number ?? 0);
  });

  return { results, droppedCount: dropped };
}

function clamp01(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function emptyToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** 검진일 문자열이 쓸만한지 확인한다. 미래이거나 형식이 틀리면 버린다. */
export function normalizeCheckupDate(value: unknown, now = new Date()): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

  const parsed = Date.parse(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;

  // 미래 검진일은 오독이다. 하루 여유만 둔다 (타임존 차이).
  if (parsed > now.getTime() + 86_400_000) return null;
  // 1900년 이전도 오독.
  if (parsed < Date.parse("1900-01-01T00:00:00Z")) return null;

  return trimmed;
}
