#!/usr/bin/env node
/**
 * 식품영양성분 API 연결 확인 + 픽스처 생성.
 *
 *   npm run food:check           # 기본 검색어 "사과"
 *   npm run food:check 닭가슴살
 *
 * .env.local 의 FOOD_API_KEY 를 읽어 실제 응답을 받아보고, 어떤 오퍼레이션·
 * 파라미터 조합이 통하는지 알려준다. 앱이 실제로 쓰는 클라이언트를 그대로
 * 호출하므로, 여기서 통과하면 앱에서도 통과한다.
 *
 * ⚠️ 인증키는 출력하지 않는다. 결과를 그대로 공유해도 키는 새지 않는다.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  NAME_PARAM_CANDIDATES,
  OPERATION_CANDIDATES,
  TYPE_PARAM_CANDIDATES,
  buildSearchUrl,
  normalizeServiceKey,
  parseSearchResponse,
  type RequestShape,
} from "../src/lib/food/mfds.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal(): void {
  try {
    const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // .env.local 이 없으면 환경변수만 쓴다
  }
}

/** 응답 본문에 혹시 키가 섞여 나오더라도 가린다. */
function redact(text: string, key: string): string {
  return text
    .split(key)
    .join("<REDACTED_KEY>")
    .split(encodeURIComponent(key))
    .join("<REDACTED_KEY>");
}

async function tryShape(
  key: string,
  query: string,
  shape: RequestShape,
): Promise<{ ok: true; payload: unknown } | { ok: false; reason: string }> {
  const url = buildSearchUrl(key, query, shape, { numOfRows: 3 });

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    return { ok: false, reason: `요청 실패 — ${(error as Error).message}` };
  }

  const body = redact(await response.text(), normalizeServiceKey(key));
  const trimmed = body.trimStart();

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    // data.go.kr 은 오류도 200 + XML 로 준다. 앞부분만 보여준다.
    return {
      ok: false,
      reason: `HTTP ${response.status} — ${body.replace(/\s+/g, " ").slice(0, 140)}`,
    };
  }

  try {
    return { ok: true, payload: JSON.parse(body) };
  } catch {
    return { ok: false, reason: "JSON 파싱 실패" };
  }
}

async function main(): Promise<void> {
  loadEnvLocal();

  const rawKey = process.env.FOOD_API_KEY;
  if (!rawKey) {
    console.error("FOOD_API_KEY 가 없습니다. .env.local 에 넣어 주세요.");
    console.error("  echo 'FOOD_API_KEY=발급받은키' >> .env.local");
    process.exit(1);
  }

  const query = process.argv[2] ?? "사과";
  const normalized = normalizeServiceKey(rawKey);

  console.log(`검색어: ${query}`);
  console.log(
    `키 형태: ${rawKey === normalized ? "Decoding(원본)" : "Encoding — 디코딩해서 사용"}\n`,
  );

  for (const operation of OPERATION_CANDIDATES) {
    for (const typeParam of TYPE_PARAM_CANDIDATES) {
      for (const nameParam of NAME_PARAM_CANDIDATES) {
        const shape: RequestShape = { operation, typeParam, nameParam };
        const result = await tryShape(rawKey, query, shape);

        if (!result.ok) {
          console.log(`✗ ${operation} / ${typeParam} / ${nameParam} — ${result.reason}`);
          continue;
        }

        console.log(`\n✅ 통한 조합`);
        console.log(`   operation : ${operation}`);
        console.log(`   type 파라미터: ${typeParam}=json`);
        console.log(`   검색어 파라미터: ${nameParam}\n`);

        // 픽스처 저장 — 커밋하면 키 없이도 파서 테스트가 돌아간다.
        const fixtureDir = join(ROOT, "src/lib/food/__fixtures__");
        mkdirSync(fixtureDir, { recursive: true });
        const fixturePath = join(fixtureDir, "search-response.json");
        writeFileSync(fixturePath, JSON.stringify(result.payload, null, 2));

        // 실제 필드명을 그대로 보여준다. 매핑을 맞추려면 이 목록이 필요하다.
        const { items } = parseSearchResponse(result.payload);
        const rawEnvelope = result.payload as Record<string, unknown>;
        const firstRaw = JSON.stringify(rawEnvelope).slice(0, 1500);

        console.log("응답 원문 (앞부분):");
        console.log(firstRaw);
        console.log(`\n픽스처 저장: ${fixturePath}`);

        console.log(`\n파싱 결과: ${items.length}건`);
        if (items.length > 0) {
          console.log(JSON.stringify(items[0], null, 2));
        } else {
          console.log(
            "⚠️ 파싱은 0건입니다. 필드명이 예상과 달라 매핑을 고쳐야 합니다.\n" +
              "   위 응답 원문의 필드명을 알려주시면 맞추겠습니다.",
          );
        }

        console.log(
          "\n다음 단계: src/lib/food/mfds.ts 의 DEFAULT_SHAPE 를 위 조합으로 고정하고,\n" +
            "필드 매핑(FIELD_ALIASES)에서 맞는 이름만 남기면 됩니다.",
        );
        return;
      }
    }
  }

  console.error("\n통하는 조합을 찾지 못했습니다.");
  console.error("포털 활용신청 상세 화면의 '상세기능' 목록에서 오퍼레이션 이름을");
  console.error("확인해 알려주시면 후보에 추가하겠습니다.");
  process.exit(1);
}

main();
