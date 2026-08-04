import assert from "node:assert/strict";
import test from "node:test";

import type { MetricReferenceRange } from "@/lib/db/types";

import {
  approximateAge,
  calculateBmi,
  evaluateMetric,
  formatReferenceRange,
  isPlausibleValue,
  resolveReferenceRange,
} from "./status.ts";

/**
 * 지표 판정 로직 테스트.
 *
 * 이 로직은 의료법 경계를 강제하는 지점이다 — 정상/주의/범위밖 판정이
 * 조용히 바뀌면 사용자에게 잘못된 신호를 준다. 경계값을 명시적으로 고정한다.
 *
 * 사용한 값은 0003_seed_metric_definitions.sql 의 실제 시드 데이터와 같다.
 */

function range(overrides: Partial<MetricReferenceRange> = {}): MetricReferenceRange {
  return {
    id: "test-range",
    metric_code: "TEST",
    sex: null,
    age_min: null,
    age_max: null,
    normal_low: null,
    normal_high: null,
    caution_low: null,
    caution_high: null,
    source: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("공복혈당: 정상/주의/범위밖 경계", () => {
  const r = range({
    normal_low: 70,
    normal_high: 99,
    caution_low: 100,
    caution_high: 125,
  });

  assert.equal(evaluateMetric(85, r), "normal");
  assert.equal(evaluateMetric(99, r), "normal", "정상 상한은 포함된다");
  assert.equal(evaluateMetric(100, r), "caution", "주의 하한은 포함된다");
  assert.equal(evaluateMetric(125, r), "caution");
  assert.equal(evaluateMetric(126, r), "out_of_range");
  assert.equal(evaluateMetric(60, r), "out_of_range", "정상 하한 미만");
});

test("HDL(남): 하한만 있는 지표는 높아도 정상", () => {
  const r = range({
    sex: "male",
    normal_low: 40,
    normal_high: null,
    caution_low: 35,
    caution_high: 39,
  });

  assert.equal(evaluateMetric(55, r), "normal");
  assert.equal(evaluateMetric(40, r), "normal");
  assert.equal(evaluateMetric(37, r), "caution");
  assert.equal(evaluateMetric(30, r), "out_of_range");
});

test("LDL: 상한만 있는 지표는 낮아도 정상", () => {
  const r = range({
    normal_low: null,
    normal_high: 129,
    caution_low: 130,
    caution_high: 159,
  });

  assert.equal(evaluateMetric(90, r), "normal");
  assert.equal(evaluateMetric(140, r), "caution");
  assert.equal(evaluateMetric(200, r), "out_of_range");
});

test("참고범위가 없으면 판정하지 않는다", () => {
  assert.equal(evaluateMetric(100, null), "unknown");
  assert.equal(
    evaluateMetric(100, range()),
    "unknown",
    "정상범위가 비어 있으면 임의로 판정하지 않는다",
  );
});

test("주의 구간이 없는 지표는 정상 아니면 범위밖", () => {
  const r = range({ normal_low: 4.0, normal_high: 10.0 });

  assert.equal(evaluateMetric(7, r), "normal");
  assert.equal(evaluateMetric(12, r), "out_of_range");
});

test("성별 지정 범위가 성별 무관 범위보다 우선한다", () => {
  const ranges = [
    range({ id: "generic", sex: null, normal_low: 1, normal_high: 100 }),
    range({ id: "female", sex: "female", normal_low: 12, normal_high: 15.5 }),
  ];

  assert.equal(
    resolveReferenceRange(ranges, { sex: "female", age: 30 })?.id,
    "female",
  );
});

test("성별이 다른 범위는 후보에서 제외된다", () => {
  const ranges = [range({ sex: "male", normal_low: 13, normal_high: 16.5 })];

  assert.equal(resolveReferenceRange(ranges, { sex: "female", age: 30 }), null);
});

test("나이를 모르면 연령 조건이 붙은 범위는 적용하지 않는다", () => {
  const ranges = [range({ age_min: 19, normal_low: 18.5, normal_high: 22.9 })];

  assert.equal(resolveReferenceRange(ranges, { sex: "unspecified", age: null }), null);
  assert.notEqual(
    resolveReferenceRange(ranges, { sex: "unspecified", age: 30 }),
    null,
  );
});

test("연령 범위 밖이면 적용하지 않는다", () => {
  const ranges = [range({ age_min: 19, age_max: 64 })];

  assert.equal(resolveReferenceRange(ranges, { sex: "unspecified", age: 70 }), null);
});

test("참고범위 문자열 표기", () => {
  const definition = { decimal_places: 0, unit: "mg/dL" };

  assert.equal(
    formatReferenceRange(range({ normal_low: 70, normal_high: 99 }), definition),
    "70 ~ 99",
  );
  assert.equal(formatReferenceRange(range({ normal_low: 40 }), definition), "40 이상");
  assert.equal(
    formatReferenceRange(range({ normal_high: 129 }), definition),
    "129 이하",
  );
  assert.equal(formatReferenceRange(null, definition), null);
});

test("물리적으로 불가능한 입력을 거른다", () => {
  const weight = { min_valid: 1, max_valid: 400 };

  assert.equal(isPlausibleValue(68.5, weight), true);
  assert.equal(isPlausibleValue(700, weight), false, "체중 700kg 은 오타다");
  assert.equal(isPlausibleValue(0, weight), false);
  assert.equal(isPlausibleValue(Number.NaN, weight), false);
});

test("BMI 계산", () => {
  const bmi = calculateBmi(68.5, 172);

  assert.ok(bmi !== null);
  assert.ok(Math.abs(bmi - 23.16) < 0.01, `예상 23.16, 실제 ${bmi}`);
  assert.equal(calculateBmi(68.5, 0), null);
});

test("출생연도로 나이를 근사한다", () => {
  assert.equal(approximateAge(1990, new Date("2026-08-04")), 36);
  assert.equal(approximateAge(null), null);
});
