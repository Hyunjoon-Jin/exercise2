import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import {
  buildExtractionSchema,
  buildSystemPrompt,
  type ExtractedCheckup,
  type MetricHint,
} from "./schema";

/** 판독에 쓸 모델. 결과지는 표·수치가 밀집한 문서라 정확도가 곧 제품 신뢰도다. */
const MODEL = "claude-opus-5";

/**
 * 항목이 많은 결과지도 한 번에 담기게 넉넉히 잡는다.
 * 스트리밍 없이 쓰므로 SDK 의 장시간 요청 가드(약 10분)를 넘지 않는 범위.
 */
const MAX_TOKENS = 16_000;

/** base64 는 원본보다 약 1.33배 커진다. 요청 상한 32MB 안에 들어와야 한다. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export class ExtractionError extends Error {
  readonly kind: "not_configured" | "unsupported_type" | "too_large" | "refused" | "api";

  constructor(
    kind: "not_configured" | "unsupported_type" | "too_large" | "refused" | "api",
    message: string,
  ) {
    super(message);
    this.name = "ExtractionError";
    this.kind = kind;
  }
}

export interface ExtractionResult {
  payload: ExtractedCheckup;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export function isExtractionConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * 검진 결과지 한 건을 판독한다.
 *
 * PDF 는 별도 OCR 없이 document 블록으로 그대로 넘긴다 — 스캔 PDF 도 처리된다.
 * 결과는 Structured Outputs 로 스키마가 강제되므로 파싱 실패 재시도가 없다.
 *
 * ⚠️ 이 함수의 반환값은 "후보"다. 사용자가 원본과 대조해 확정하기 전에는
 *    health_metrics 로 넘어가지 않는다. (docs/PLAN.md §6)
 */
export async function extractCheckup(
  file: { bytes: Uint8Array; mimeType: string },
  metrics: MetricHint[],
): Promise<ExtractionResult> {
  if (!isExtractionConfigured()) {
    throw new ExtractionError(
      "not_configured",
      "판독 서버가 설정되지 않았습니다. 관리자에게 문의해 주세요.",
    );
  }

  if (file.bytes.byteLength > MAX_FILE_BYTES) {
    throw new ExtractionError(
      "too_large",
      "파일이 너무 큽니다. 20MB 이하로 올려 주세요.",
    );
  }

  const isPdf = file.mimeType === "application/pdf";
  const isImage = SUPPORTED_IMAGE_TYPES.has(file.mimeType);

  if (!isPdf && !isImage) {
    throw new ExtractionError(
      "unsupported_type",
      "PDF 또는 이미지(JPG, PNG, WebP) 파일만 판독할 수 있습니다.",
    );
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const data = Buffer.from(file.bytes).toString("base64");

  // 문서 블록을 텍스트보다 앞에 둔다.
  const documentBlock = isPdf
    ? ({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data },
      } as const)
    : ({
        type: "image",
        source: {
          type: "base64",
          media_type: file.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
          data,
        },
      } as const);

  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(metrics),
      // 안전 분류기가 거절해도 요청이 그냥 멈추지 않도록 대체 모델로 넘긴다.
      // 검진 결과지는 생명과학 인접 문서라 오탐 여지가 있다.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "high",
        format: {
          type: "json_schema",
          schema: buildExtractionSchema(metrics.map((metric) => metric.code)),
        },
      },
      messages: [
        {
          role: "user",
          content: [
            documentBlock,
            {
              type: "text",
              text: "이 검진 결과지에 인쇄된 검사 항목과 수치를 모두 옮겨 주세요.",
            },
          ],
        },
      ],
    });
  } catch (error) {
    const message =
      error instanceof Anthropic.APIError
        ? `판독 요청이 실패했습니다 (${error.status}).`
        : "판독 서버에 연결하지 못했습니다.";
    throw new ExtractionError("api", message);
  }

  // content 를 읽기 전에 stop_reason 을 본다. 거절이면 content 가 비어 있다.
  if (response.stop_reason === "refusal") {
    throw new ExtractionError(
      "refused",
      "이 문서는 자동 판독이 거부되었습니다. 결과를 직접 입력해 주세요.",
    );
  }

  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") {
    throw new ExtractionError("api", "판독 결과가 비어 있습니다.");
  }

  let payload: ExtractedCheckup;
  try {
    payload = JSON.parse(text.text) as ExtractedCheckup;
  } catch {
    // Structured Outputs 를 쓰면 여기 올 일이 없다. 왔다면 응답이 잘린 것이다.
    throw new ExtractionError(
      "api",
      response.stop_reason === "max_tokens"
        ? "결과지 항목이 너무 많아 판독이 중간에 끊겼습니다. 페이지를 나눠 올려 주세요."
        : "판독 결과를 해석하지 못했습니다.",
    );
  }

  return {
    payload,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
