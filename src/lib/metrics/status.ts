import type {
  BiologicalSex,
  MetricDefinition,
  MetricReferenceRange,
} from "@/lib/db/types";

/**
 * 지표 상태 판정.
 *
 * ⚠️ 의료법 준수 — 여기서 나오는 라벨은 "정상 / 주의 / 범위 밖 / 판정 불가"
 *    네 가지뿐이다. 질병명이나 진단성 표현("당뇨 의심", "고혈압" 등)을
 *    추가해서는 안 된다. 이 파일이 그 경계를 강제하는 단일 지점이다.
 */
export type MetricStatus = "normal" | "caution" | "out_of_range" | "unknown";

export const METRIC_STATUS_LABEL: Record<MetricStatus, string> = {
  normal: "정상",
  caution: "주의",
  out_of_range: "범위 밖",
  unknown: "판정 기준 없음",
};

export interface EvaluationSubject {
  sex: BiologicalSex;
  /** 만 나이. 출생연도만 수집하므로 근사치다. */
  age: number | null;
}

function withinBounds(value: number, low: number | null, high: number | null): boolean {
  if (low === null && high === null) return false;
  if (low !== null && value < low) return false;
  if (high !== null && value > high) return false;
  return true;
}

/**
 * 후보 참고범위 중 대상자에게 가장 구체적으로 들어맞는 것을 고른다.
 *
 * 구체성 순위: 성별 지정 > 성별 무관, 연령 지정 > 연령 무관.
 * 조건에 맞지 않는 범위는 애초에 후보에서 제외한다.
 */
export function resolveReferenceRange(
  ranges: MetricReferenceRange[],
  subject: EvaluationSubject,
): MetricReferenceRange | null {
  const applicable = ranges.filter((range) => {
    if (range.sex !== null && range.sex !== subject.sex) return false;

    const hasAgeBound = range.age_min !== null || range.age_max !== null;
    if (hasAgeBound) {
      // 나이를 모르면 연령 조건이 붙은 범위는 적용할 수 없다.
      if (subject.age === null) return false;
      if (range.age_min !== null && subject.age < range.age_min) return false;
      if (range.age_max !== null && subject.age > range.age_max) return false;
    }

    return true;
  });

  if (applicable.length === 0) return null;

  return applicable.reduce((best, candidate) =>
    specificity(candidate) > specificity(best) ? candidate : best,
  );
}

function specificity(range: MetricReferenceRange): number {
  let score = 0;
  if (range.sex !== null) score += 2;
  if (range.age_min !== null || range.age_max !== null) score += 1;
  return score;
}

/**
 * 값 하나를 참고범위에 대조해 상태를 판정한다.
 *
 * 판정 순서
 *   1. 정상 구간 안이면 정상
 *   2. 주의 구간(경계값)이 정의돼 있고 그 안이면 주의
 *   3. 그 외에는 범위 밖
 *
 * 정상 구간이 한쪽만 열려 있는 지표(HDL 은 하한만, LDL 은 상한만)도
 * null 을 "제한 없음"으로 처리하므로 같은 코드로 판정된다.
 */
export function evaluateMetric(
  value: number,
  range: MetricReferenceRange | null,
): MetricStatus {
  if (!range) return "unknown";

  const hasNormal = range.normal_low !== null || range.normal_high !== null;
  if (!hasNormal) return "unknown";

  if (withinBounds(value, range.normal_low, range.normal_high)) {
    return "normal";
  }

  const hasCaution = range.caution_low !== null || range.caution_high !== null;
  if (hasCaution && withinBounds(value, range.caution_low, range.caution_high)) {
    return "caution";
  }

  return "out_of_range";
}

/** 참고범위를 사용자에게 보여줄 문자열로. 예: "70 ~ 99", "40 이상", "199 이하" */
export function formatReferenceRange(
  range: MetricReferenceRange | null,
  definition: Pick<MetricDefinition, "decimal_places" | "unit">,
): string | null {
  if (!range) return null;

  const { normal_low: low, normal_high: high } = range;
  const fmt = (n: number) => n.toFixed(definition.decimal_places);

  if (low !== null && high !== null) return `${fmt(low)} ~ ${fmt(high)}`;
  if (low !== null) return `${fmt(low)} 이상`;
  if (high !== null) return `${fmt(high)} 이하`;
  return null;
}

/** 지표 정의의 소수점 자리수에 맞춰 값을 표시한다. */
export function formatMetricValue(
  value: number,
  definition: Pick<MetricDefinition, "decimal_places">,
): string {
  return value.toFixed(definition.decimal_places);
}

/** 입력값이 물리적으로 가능한 범위인지. 오타(체중 700kg 등)를 거른다. */
export function isPlausibleValue(
  value: number,
  definition: Pick<MetricDefinition, "min_valid" | "max_valid">,
): boolean {
  if (!Number.isFinite(value)) return false;
  if (definition.min_valid !== null && value < definition.min_valid) return false;
  if (definition.max_valid !== null && value > definition.max_valid) return false;
  return true;
}

/** 출생연도로 만 나이를 근사한다. 생년월일을 수집하지 않으므로 ±1년 오차가 있다. */
export function approximateAge(birthYear: number | null, now = new Date()): number | null {
  if (birthYear === null) return null;
  return now.getFullYear() - birthYear;
}

/** 체중과 키로 BMI 를 계산한다. */
export function calculateBmi(weightKg: number, heightCm: number): number | null {
  if (heightCm <= 0 || weightKg <= 0) return null;
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}
