import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeCheckupDate, normalizeExtraction } from "./normalize.ts";
import { buildExtractionSchema, buildSystemPrompt } from "./schema.ts";
import type { ExtractedCheckup, ExtractedResult } from "./schema.ts";

const VALID = new Set(["glucose_fasting", "hdl_cholesterol", "systolic_bp"]);

function result(overrides: Partial<ExtractedResult> = {}): ExtractedResult {
  return {
    raw_label: "공복혈당",
    raw_value: "98",
    raw_unit: "mg/dL",
    reference_range: "70-99",
    metric_code: "glucose_fasting",
    value: 98,
    unit: "mg/dL",
    page_number: 1,
    confidence: 0.97,
    ...overrides,
  };
}

function payload(results: ExtractedResult[]): ExtractedCheckup {
  return { checkup_date: "2026-03-11", institution: "○○검진센터", results };
}

describe("normalizeExtraction", () => {
  it("깨끗한 행은 그대로 통과시킨다", () => {
    const { results, droppedCount } = normalizeExtraction(payload([result()]), {
      validCodes: VALID,
    });

    assert.equal(droppedCount, 0);
    assert.equal(results.length, 1);
    assert.equal(results[0].metric_code, "glucose_fasting");
    assert.equal(results[0].value, 98);
    assert.equal(results[0].needsAttention, false);
  });

  it("목록에 없는 지표 코드는 null 로 만든다", () => {
    // 스키마 enum 을 통과했더라도 서버가 다시 확인한다. 지어낸 코드가
    // 들어오면 metric_definitions 외래키에서 저장이 통째로 실패한다.
    const { results } = normalizeExtraction(
      payload([result({ metric_code: "made_up_code" })]),
      { validCodes: VALID },
    );

    assert.equal(results[0].metric_code, null);
    assert.equal(results[0].needsAttention, true);
    // 원본은 남는다 — 사용자가 지표를 직접 고르면 살아난다.
    assert.equal(results[0].raw_value, "98");
  });

  it("항목명도 값도 없는 행은 버린다", () => {
    const { results, droppedCount } = normalizeExtraction(
      payload([result({ raw_label: "  ", raw_value: "" }), result()]),
      { validCodes: VALID },
    );

    assert.equal(droppedCount, 1);
    assert.equal(results.length, 1);
  });

  it("정성 결과는 값 없이 남긴다", () => {
    const { results } = normalizeExtraction(
      payload([
        result({
          raw_label: "요단백",
          raw_value: "음성",
          metric_code: null,
          value: null,
          unit: null,
        }),
      ]),
      { validCodes: VALID },
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].value, null);
    assert.equal(results[0].raw_value, "음성");
    assert.equal(results[0].needsAttention, true);
  });

  it("confidence 를 0~1 로 자르고 숫자가 아니면 0 으로 둔다", () => {
    const { results } = normalizeExtraction(
      payload([
        result({ confidence: 1.4 }),
        result({ confidence: -2 }),
        result({ confidence: "높음" as unknown as number }),
      ]),
      { validCodes: VALID },
    );

    const confidences = results.map((row) => row.confidence).sort();
    assert.deepEqual(confidences, [0, 0, 1]);
  });

  it("임계값보다 낮은 confidence 는 확인 대상으로 표시한다", () => {
    const { results } = normalizeExtraction(payload([result({ confidence: 0.7 })]), {
      validCodes: VALID,
      confidenceThreshold: 0.85,
    });

    assert.equal(results[0].needsAttention, true);
  });

  it("확인이 필요한 항목을 앞으로 올린다", () => {
    const { results } = normalizeExtraction(
      payload([
        result({ raw_label: "확실", page_number: 1 }),
        result({ raw_label: "애매", page_number: 2, confidence: 0.3 }),
      ]),
      { validCodes: VALID },
    );

    assert.equal(results[0].raw_label, "애매");
    assert.equal(results[1].raw_label, "확실");
  });

  it("빈 문자열 단위와 참고치는 null 로 정리한다", () => {
    const { results } = normalizeExtraction(
      payload([result({ raw_unit: "   ", reference_range: "" })]),
      { validCodes: VALID },
    );

    assert.equal(results[0].raw_unit, null);
    assert.equal(results[0].reference_range, null);
  });

  it("results 가 없어도 터지지 않는다", () => {
    const { results, droppedCount } = normalizeExtraction(
      { checkup_date: null, institution: null } as ExtractedCheckup,
      { validCodes: VALID },
    );

    assert.equal(results.length, 0);
    assert.equal(droppedCount, 0);
  });

  it("0 이하 페이지 번호는 버린다", () => {
    const { results } = normalizeExtraction(payload([result({ page_number: 0 })]), {
      validCodes: VALID,
    });

    assert.equal(results[0].page_number, null);
  });
});

describe("normalizeCheckupDate", () => {
  const now = new Date("2026-08-05T00:00:00Z");

  it("정상 날짜를 통과시킨다", () => {
    assert.equal(normalizeCheckupDate("2026-03-11", now), "2026-03-11");
  });

  it("미래 날짜를 버린다", () => {
    // 결과지에 미래 날짜가 있을 수 없다. 있다면 다른 숫자를 잘못 읽은 것이다.
    assert.equal(normalizeCheckupDate("2027-01-01", now), null);
  });

  it("타임존 차이만큼은 봐준다", () => {
    assert.equal(normalizeCheckupDate("2026-08-05", now), "2026-08-05");
  });

  it("형식이 다르면 버린다", () => {
    assert.equal(normalizeCheckupDate("2026/03/11", now), null);
    assert.equal(normalizeCheckupDate("26-03-11", now), null);
    assert.equal(normalizeCheckupDate("", now), null);
    assert.equal(normalizeCheckupDate(null, now), null);
  });

  it("1900년 이전은 버린다", () => {
    assert.equal(normalizeCheckupDate("1899-12-31", now), null);
  });
});

describe("buildExtractionSchema", () => {
  it("지표 코드를 enum 으로 박고 null 을 허용한다", () => {
    const schema = buildExtractionSchema(["a", "b"]) as {
      properties: {
        results: { items: { properties: { metric_code: { enum: unknown[] } } } };
      };
    };

    assert.deepEqual(schema.properties.results.items.properties.metric_code.enum, [
      "a",
      "b",
      null,
    ]);
  });

  it("모든 필드를 required 로 두고 추가 필드를 막는다", () => {
    // Structured Outputs 에서 required 를 빼면 모델이 필드를 조용히 생략한다.
    const schema = buildExtractionSchema(["a"]) as {
      properties: {
        results: {
          items: { required: string[]; additionalProperties: boolean };
        };
      };
      required: string[];
    };

    const item = schema.properties.results.items;
    assert.equal(item.additionalProperties, false);
    assert.ok(item.required.includes("raw_label"));
    assert.ok(item.required.includes("confidence"));
    assert.deepEqual(schema.required, ["checkup_date", "institution", "results"]);
  });
});

describe("buildSystemPrompt", () => {
  it("지표 표를 프롬프트에 넣는다", () => {
    const prompt = buildSystemPrompt([
      { code: "glucose_fasting", display_name: "공복혈당", unit: "mg/dL" },
    ]);

    assert.ok(prompt.includes("glucose_fasting | 공복혈당 | mg/dL"));
  });

  it("판정 문구를 옮기지 말라고 지시한다", () => {
    // 의료법 경계. 결과지의 소견을 그대로 옮기면 우리가 판정을 제공하는 셈이 된다.
    const prompt = buildSystemPrompt([]);
    assert.ok(prompt.includes("판정"));
    assert.ok(prompt.includes("진단"));
  });
});
