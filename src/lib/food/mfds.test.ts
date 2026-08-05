import assert from "node:assert/strict";
import test from "node:test";

import {
  MFDS_ENDPOINT,
  buildSearchUrl,
  extractItems,
  normalizeItem,
  normalizeServiceKey,
  parseSearchResponse,
} from "./mfds.ts";
import { FoodApiError } from "./types.ts";

/**
 * 실제 응답을 아직 확인하지 못했으므로, 여기서는 공급자 응답의 "모양"을
 * 다루는 로직을 고정한다 — 봉투 구조, 오류 코드, 키 인코딩, 숫자 파싱.
 *
 * 필드명 매핑은 실제 응답을 받은 뒤 픽스처로 검증한다.
 */

const SHAPE = { operation: "getFoodNtrCpntDbInq02", typeParam: "type", nameParam: "FOOD_NM_KR" };

test("Encoding 키를 디코딩해서 쓴다 — 이중 인코딩이 이 API 의 대표적 실패 원인", () => {
  const encoded = "abc%2Bdef%2Fghi%3D%3D";

  assert.equal(normalizeServiceKey(encoded), "abc+def/ghi==");

  const url = buildSearchUrl(encoded, "사과", SHAPE);
  // URLSearchParams 가 한 번만 인코딩해야 한다. %252B 가 보이면 이중 인코딩.
  assert.ok(url.includes("serviceKey=abc%2Bdef%2Fghi%3D%3D"), url);
  assert.ok(!url.includes("%252B"), "이중 인코딩되면 안 된다");
});

test("Decoding 키는 그대로 쓴다", () => {
  const decoded = "abc+def/ghi==";

  assert.equal(normalizeServiceKey(decoded), decoded);

  const url = buildSearchUrl(decoded, "사과", SHAPE);
  assert.ok(url.includes("serviceKey=abc%2Bdef%2Fghi%3D%3D"), url);
});

test("검색 URL 에 엔드포인트와 오퍼레이션이 들어간다", () => {
  const url = buildSearchUrl("key", "닭가슴살", SHAPE, { pageNo: 2, numOfRows: 50 });

  assert.ok(url.startsWith(`${MFDS_ENDPOINT}/getFoodNtrCpntDbInq02?`));
  assert.ok(url.includes("pageNo=2"));
  assert.ok(url.includes("numOfRows=50"));
  assert.ok(url.includes("type=json"));
  assert.ok(url.includes(`FOOD_NM_KR=${encodeURIComponent("닭가슴살")}`));
});

test("검색어가 비면 이름 파라미터를 넣지 않는다", () => {
  const url = buildSearchUrl("key", "", SHAPE);
  assert.ok(!url.includes("FOOD_NM_KR"));
});

test("봉투 구조 — response 로 한 겹 싸인 형태", () => {
  const payload = {
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
      body: { totalCount: 7, pageNo: 1, items: [{ FOOD_NM_KR: "사과" }] },
    },
  };

  const result = extractItems(payload);
  assert.equal(result.items.length, 1);
  assert.equal(result.totalCount, 7);
});

test("봉투 구조 — response 없이 header/body 만 있는 형태", () => {
  const payload = {
    header: { resultCode: "00" },
    body: { totalCount: 1, items: [{ FOOD_NM_KR: "바나나" }] },
  };

  assert.equal(extractItems(payload).items.length, 1);
});

test("봉투 구조 — items 가 { item: [...] } 로 한 겹 더 싸인 형태", () => {
  const payload = {
    body: { items: { item: [{ FOOD_NM_KR: "사과" }, { FOOD_NM_KR: "배" }] } },
  };

  assert.equal(extractItems(payload).items.length, 2);
});

test("봉투 구조 — 결과가 한 건이면 배열이 아니라 객체로 오기도 한다", () => {
  const payload = { body: { items: { item: { FOOD_NM_KR: "사과" } } } };

  assert.equal(extractItems(payload).items.length, 1);
});

test("결과 없음 — 빈 배열로 돌려주고 예외를 던지지 않는다", () => {
  const payload = { header: { resultCode: "00" }, body: { totalCount: 0, items: [] } };

  const result = parseSearchResponse(payload);
  assert.deepEqual(result.items, []);
  assert.equal(result.totalCount, 0);
});

test("오류 코드는 예외로 올린다", () => {
  const payload = {
    header: { resultCode: "30", resultMsg: "SERVICE KEY IS NOT REGISTERED ERROR." },
  };

  assert.throws(
    () => extractItems(payload),
    (error: unknown) =>
      error instanceof FoodApiError &&
      error.code === "30" &&
      error.message.includes("SERVICE KEY"),
  );
});

test("INFO-000 도 정상으로 본다", () => {
  const payload = { header: { resultCode: "INFO-000" }, body: { items: [] } };
  assert.doesNotThrow(() => extractItems(payload));
});

test("숫자를 문자열로 주거나 콤마가 섞여도 파싱한다", () => {
  const item = normalizeItem({
    FOOD_CD: "D000001",
    FOOD_NM_KR: "백미밥",
    AMT_NUM1: "1,234.5",
    AMT_NUM3: "5.2",
    AMT_NUM13: "",
  });

  assert.ok(item);
  assert.equal(item.kcal, 1234.5);
  assert.equal(item.proteinG, 5.2);
  assert.equal(item.sodiumMg, null, "빈 문자열은 null 이어야 한다");
});

test("구버전 필드명(NUTR_CONT*)도 읽는다", () => {
  const item = normalizeItem({
    DESC_KOR: "사과",
    NUTR_CONT1: "52",
    NUTR_CONT2: "13.8",
  });

  assert.ok(item);
  assert.equal(item.name, "사과");
  assert.equal(item.kcal, 52);
  assert.equal(item.carbG, 13.8);
});

test("식품코드가 없으면 이름으로 코드를 만든다 — 캐시 PK 가 비면 안 되므로", () => {
  const item = normalizeItem({ FOOD_NM_KR: "집밥" });

  assert.ok(item);
  assert.equal(item.code, "MFDS:집밥");
});

test("이름이 없는 행은 버린다", () => {
  assert.equal(normalizeItem({ FOOD_CD: "X", AMT_NUM1: "100" }), null);
});

test("기준량이 없으면 100g 으로 본다", () => {
  const item = normalizeItem({ FOOD_NM_KR: "사과" });

  assert.ok(item);
  assert.equal(item.servingSize, 100);
  assert.equal(item.servingUnit, "g");
});
