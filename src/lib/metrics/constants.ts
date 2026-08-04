import type { MetricCategory } from "@/lib/db/types";

export const CATEGORY_LABEL: Record<MetricCategory, string> = {
  body: "체성분",
  vital: "활력징후",
  glucose: "혈당",
  lipid: "지질",
  liver: "간기능",
  kidney: "신장기능",
  blood: "혈액",
  thyroid: "갑상선",
  urine: "요검사",
  lifestyle: "생활 지표",
};

export const CATEGORY_ORDER: MetricCategory[] = [
  "body",
  "vital",
  "glucose",
  "lipid",
  "liver",
  "kidney",
  "blood",
  "thyroid",
  "urine",
  "lifestyle",
];

/**
 * 사용자가 직접 입력할 수 없는 지표.
 *
 * BMI 는 체중에서, 생활 지표는 식단·운동·수면 기록에서 자동 계산된다.
 * 직접 입력을 허용하면 원본 기록과 어긋난 값이 생겨 어느 쪽이 맞는지
 * 알 수 없게 된다.
 */
export const DERIVED_ONLY_CODES = new Set(["BMI"]);

export function isSelfRecordable(code: string, category: MetricCategory): boolean {
  return category !== "lifestyle" && !DERIVED_ONLY_CODES.has(code);
}

/** 지표 목록 화면에서 위로 올릴 자주 쓰는 지표 */
export const PINNED_CODES = [
  "WEIGHT",
  "BMI",
  "BP_SYSTOLIC",
  "BP_DIASTOLIC",
  "GLUCOSE_FASTING",
];
