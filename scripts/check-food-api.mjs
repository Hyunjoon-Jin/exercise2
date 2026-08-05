#!/usr/bin/env node
/**
 * 식품영양성분 API 연결 확인 + 픽스처 생성.
 *
 *   node scripts/check-food-api.mjs [검색어]
 *
 * .env.local 의 FOOD_API_KEY 를 읽어 실제 응답을 받아보고,
 * 어떤 오퍼레이션·파라미터 조합이 통하는지 알려준다.
 *
 * 개발 컨테이너에서는 정부 포털 호스트가 막혀 있어 실행되지 않는다.
 * 로컬에서 한 번 돌리고 결과를 공유하면 그에 맞춰 클라이언트를 만든다.
 *
 * ⚠️ 인증키는 출력하지 않는다. 결과를 그대로 붙여넣어도 키는 새지 않는다.
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENDPOINT = "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02";

/** data.go.kr 은 API 마다 오퍼레이션 이름이 달라 문서를 봐야 한다. 흔한 순서로 시도. */
const OPERATIONS = [
  "getFoodNtrCpntDbInq02",
  "getFoodNtrCpntDbInq01",
  "getFoodNtrCpntDbInq",
  "getFoodNtrItdntList1",
];

/** JSON 을 요청하는 파라미터 이름도 API 마다 다르다. */
const TYPE_PARAMS = ["type", "_type"];

/** 검색어 파라미터 후보 */
const NAME_PARAMS = ["FOOD_NM_KR", "foodNm", "FOOD_NM"];

function loadEnvLocal() {
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

/**
 * 포털은 Encoding/Decoding 두 형태로 키를 준다.
 * URLSearchParams 가 다시 인코딩하므로 여기서는 디코딩된 원본이 필요하다.
 * 이미 인코딩된 키가 들어오면 되돌린다.
 */
function normalizeKey(key) {
  const looksEncoded = /%[0-9A-Fa-f]{2}/.test(key);
  return looksEncoded ? decodeURIComponent(key) : key;
}

function buildUrl(operation, key, typeParam, nameParam, query) {
  const params = new URLSearchParams({
    serviceKey: key,
    pageNo: "1",
    numOfRows: "3",
    [typeParam]: "json",
  });
  if (query) params.set(nameParam, query);
  return `${ENDPOINT}/${operation}?${params}`;
}

/** 응답 본문에서 키가 새지 않도록, 혹시 포함되면 가린다. */
function redact(text, key) {
  return text.split(key).join("<REDACTED_KEY>").split(encodeURIComponent(key)).join("<REDACTED_KEY>");
}

function summarizeShape(value, depth = 0) {
  if (depth > 3) return "…";
  if (Array.isArray(value)) {
    return value.length === 0 ? "[]" : [summarizeShape(value[0], depth + 1)];
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, summarizeShape(v, depth + 1)]),
    );
  }
  return typeof value;
}

async function main() {
  loadEnvLocal();

  const rawKey = process.env.FOOD_API_KEY;
  if (!rawKey) {
    console.error("FOOD_API_KEY 가 없습니다. .env.local 에 넣거나 환경변수로 전달하세요.");
    console.error("  FOOD_API_KEY=... node scripts/check-food-api.mjs 사과");
    process.exit(1);
  }

  const key = normalizeKey(rawKey);
  const query = process.argv[2] ?? "사과";

  console.log(`엔드포인트: ${ENDPOINT}`);
  console.log(`검색어: ${query}`);
  console.log(`키 형태: ${rawKey === key ? "Decoding(원본)" : "Encoding → 디코딩해서 사용"}\n`);

  for (const operation of OPERATIONS) {
    for (const typeParam of TYPE_PARAMS) {
      for (const nameParam of NAME_PARAMS) {
        const url = buildUrl(operation, key, typeParam, nameParam, query);
        let response;
        try {
          response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        } catch (error) {
          console.log(`✗ ${operation} (${typeParam}, ${nameParam}) — 요청 실패: ${error.message}`);
          continue;
        }

        const body = redact(await response.text(), key);
        const isJson = body.trimStart().startsWith("{") || body.trimStart().startsWith("[");

        if (!response.ok || !isJson) {
          // data.go.kr 은 오류도 200 + XML 로 주는 경우가 많다. 앞부분만 보여준다.
          const hint = body.replace(/\s+/g, " ").slice(0, 160);
          console.log(`✗ ${operation} (${typeParam}, ${nameParam}) — HTTP ${response.status} ${hint}`);
          continue;
        }

        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          console.log(`✗ ${operation} (${typeParam}, ${nameParam}) — JSON 파싱 실패`);
          continue;
        }

        console.log(`\n✅ 통한 조합: ${operation} / ${typeParam}=json / 검색어 파라미터=${nameParam}\n`);
        console.log("응답 구조:");
        console.log(JSON.stringify(summarizeShape(parsed), null, 2));
        console.log("\n응답 원문 (앞부분):");
        console.log(JSON.stringify(parsed, null, 2).slice(0, 3000));

        const fixtureDir = join(ROOT, "src/lib/food/__fixtures__");
        mkdirSync(fixtureDir, { recursive: true });
        const fixturePath = join(fixtureDir, "search-response.json");
        writeFileSync(fixturePath, JSON.stringify(parsed, null, 2));
        console.log(`\n픽스처 저장: ${fixturePath}`);
        console.log("이 파일을 커밋하면 키 없이도 파서 테스트가 돌아갑니다.");
        return;
      }
    }
  }

  console.error("\n통하는 조합을 찾지 못했습니다.");
  console.error("포털의 '상세기능' 목록에서 오퍼레이션 이름을 확인해 알려주세요.");
  process.exit(1);
}

main();
