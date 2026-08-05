/**
 * 검진 결과지에서 뽑아낼 구조.
 *
 * Structured Outputs 로 스키마를 강제하므로 JSON 파싱 실패나 재시도 루프가
 * 필요 없다. 대신 스키마가 곧 계약이라 필드를 바꾸면 프롬프트도 함께 봐야 한다.
 */

export interface ExtractedResult {
  /** 결과지에 인쇄된 항목명 그대로 */
  raw_label: string;
  /** 인쇄된 값 그대로 (단위·부등호 포함 가능) */
  raw_value: string;
  raw_unit: string | null;
  /** 결과지에 적힌 참고치 문자열 */
  reference_range: string | null;
  /** 우리 지표 코드로의 매핑. 확신이 없으면 null */
  metric_code: string | null;
  /** 숫자로 해석한 값. 정성 결과("음성" 등)면 null */
  value: number | null;
  unit: string | null;
  page_number: number | null;
  /** 0~1. 판독 자신도 — 검수 UI 에서 낮은 항목을 강조한다 */
  confidence: number;
}

export interface ExtractedCheckup {
  checkup_date: string | null;
  institution: string | null;
  results: ExtractedResult[];
}

/**
 * 지표 코드 목록을 enum 으로 박아 스키마를 만든다.
 *
 * enum 없이 자유 문자열로 두면 존재하지 않는 코드를 지어내고, 그걸 서버에서
 * 걸러내면 그 항목은 통째로 버려진다. enum 이면 모델이 애초에 유효한 코드
 * 아니면 null 만 낼 수 있다.
 */
export function buildExtractionSchema(metricCodes: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      checkup_date: {
        type: ["string", "null"],
        description: "검진 시행일. YYYY-MM-DD. 결과지에 없으면 null.",
      },
      institution: {
        type: ["string", "null"],
        description: "검진 기관명. 없으면 null.",
      },
      results: {
        type: "array",
        description: "결과지에 인쇄된 모든 검사 항목.",
        items: {
          type: "object",
          properties: {
            raw_label: {
              type: "string",
              description: "결과지에 인쇄된 항목명 그대로. 번역하거나 고치지 말 것.",
            },
            raw_value: {
              type: "string",
              description: "인쇄된 값 그대로. '<5', '음성', '1,234' 같은 표기도 그대로.",
            },
            raw_unit: { type: ["string", "null"], description: "인쇄된 단위." },
            reference_range: {
              type: ["string", "null"],
              description: "결과지에 적힌 참고치 문자열 그대로.",
            },
            metric_code: {
              type: ["string", "null"],
              enum: [...metricCodes, null],
              description:
                "이 항목에 해당하는 지표 코드. 확실하지 않으면 null. 추측하지 말 것.",
            },
            value: {
              type: ["number", "null"],
              description:
                "숫자로 해석한 값. 정성 결과(음성/양성 등)이거나 숫자가 아니면 null.",
            },
            unit: {
              type: ["string", "null"],
              description: "지표 코드의 표준 단위로 표현한 단위.",
            },
            page_number: {
              type: ["integer", "null"],
              description: "이 항목이 있는 페이지 번호 (1부터).",
            },
            confidence: {
              type: "number",
              description:
                "0에서 1 사이. 값을 정확히 읽었다는 확신. 흐릿하거나 애매하면 낮게.",
            },
          },
          required: [
            "raw_label",
            "raw_value",
            "raw_unit",
            "reference_range",
            "metric_code",
            "value",
            "unit",
            "page_number",
            "confidence",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["checkup_date", "institution", "results"],
    additionalProperties: false,
  };
}

export interface MetricHint {
  code: string;
  display_name: string;
  unit: string;
}

/**
 * 시스템 프롬프트.
 *
 * 지표 목록을 넣어 매핑을 맡긴다. 병원마다 항목명 표기가 달라
 * (공복혈당/식전혈당/FBS) 문자열 규칙으로는 감당이 안 된다.
 */
export function buildSystemPrompt(metrics: MetricHint[]): string {
  const table = metrics
    .map((metric) => `${metric.code} | ${metric.display_name} | ${metric.unit}`)
    .join("\n");

  return `건강검진 결과지에서 검사 항목과 수치를 그대로 옮겨 적는 작업입니다.

원칙
- 결과지에 인쇄된 것만 옮깁니다. 없는 항목을 만들어 내지 마세요.
- raw_label 과 raw_value 는 인쇄된 그대로 둡니다. 단위 변환이나 표기 정리를 하지 마세요.
- 값이 흐릿하거나 여러 해석이 가능하면 confidence 를 낮게 주세요. 추측한 값을 높은
  confidence 로 내면 사용자가 검수 단계에서 놓칩니다.
- 판정·소견·진단 문구는 옮기지 마세요. 수치 항목만 대상입니다.
- 정성 결과(음성/양성/정상 등)는 raw_value 에 그대로 두고 value 는 null 로 두세요.

지표 코드 매핑
아래 목록에서 해당하는 코드를 고릅니다. 애매하면 null 로 두세요 — 사용자가
직접 지정합니다. 틀린 코드로 매핑하면 엉뚱한 그래프에 값이 들어갑니다.

코드 | 이름 | 표준 단위
${table}

단위가 결과지와 다르면 표준 단위로 환산한 값을 value 에, 표준 단위를 unit 에
넣습니다. 환산이 확실하지 않으면 value 를 null 로 두고 raw_value 만 남기세요.`;
}
