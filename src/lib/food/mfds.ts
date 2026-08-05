// 확장자를 붙이는 이유: 이 모듈은 scripts/check-food-api.ts 에서 node 로 직접
// 실행된다. FoodApiError 는 런타임 값이라 Node ESM 이 경로를 해석해야 하는데,
// Node 는 확장자를 추론하지 않는다. (앱 코드의 다른 import 는 확장자 없이 쓴다)
import { FoodApiError, type FoodItem, type FoodSearchResult } from "./types.ts";

/**
 * 식품의약품안전처 식품영양성분DB 클라이언트 (공공데이터포털).
 *
 * 1471000 은 식약처 기관코드. 실제 호출은 이 뒤에 오퍼레이션 이름이 붙는다.
 */
export const MFDS_ENDPOINT = "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02";

/**
 * 오퍼레이션 이름 후보.
 *
 * 포털이 준 정보에 오퍼레이션이 빠져 있어 확정하지 못했다.
 * scripts/check-food-api.ts 로 한 번 확인한 뒤 통한 것만 남길 것.
 */
export const OPERATION_CANDIDATES = [
  "getFoodNtrCpntDbInq02",
  "getFoodNtrCpntDbInq01",
  "getFoodNtrCpntDbInq",
];

/** JSON 을 요청하는 파라미터 이름도 API 마다 다르다. */
export const TYPE_PARAM_CANDIDATES = ["type", "_type"];

/** 음식명 검색 파라미터 후보 */
export const NAME_PARAM_CANDIDATES = ["FOOD_NM_KR", "foodNm", "FOOD_NM"];

/**
 * 포털은 인증키를 Encoding / Decoding 두 형태로 준다.
 *
 * URLSearchParams 가 값을 다시 인코딩하므로 여기서는 디코딩된 원본이 필요하다.
 * Encoding 키를 그대로 넘기면 %2B 가 %252B 로 이중 인코딩되어 인증이 실패한다 —
 * 이 API 에서 가장 흔한 실수다.
 */
export function normalizeServiceKey(key: string): string {
  return /%[0-9A-Fa-f]{2}/.test(key) ? decodeURIComponent(key) : key;
}

export interface RequestShape {
  operation: string;
  typeParam: string;
  nameParam: string;
}

/** 확인이 끝나면 이 값 하나만 남기고 후보 배열을 지운다. */
export const DEFAULT_SHAPE: RequestShape = {
  operation: OPERATION_CANDIDATES[0],
  typeParam: TYPE_PARAM_CANDIDATES[0],
  nameParam: NAME_PARAM_CANDIDATES[0],
};

export function buildSearchUrl(
  serviceKey: string,
  query: string,
  shape: RequestShape = DEFAULT_SHAPE,
  options: { pageNo?: number; numOfRows?: number } = {},
): string {
  const params = new URLSearchParams({
    serviceKey: normalizeServiceKey(serviceKey),
    pageNo: String(options.pageNo ?? 1),
    numOfRows: String(options.numOfRows ?? 20),
    [shape.typeParam]: "json",
  });

  if (query) params.set(shape.nameParam, query);

  return `${MFDS_ENDPOINT}/${shape.operation}?${params}`;
}

/**
 * 응답 필드 매핑.
 *
 * 실제 응답을 아직 확인하지 못해 후보를 나열해 두었다. 각 항목은
 * "먼저 있는 것을 쓴다" 규칙으로 읽는다. 확인 후에는 맞는 이름 하나만 남길 것.
 *
 * 이름이 이렇게 제각각인 이유: 식약처 영양DB 는 개편을 여러 번 거쳤고
 * 구버전(I2790)은 NUTR_CONT*, 신버전은 AMT_NUM* 계열을 쓴다.
 */
const FIELD_ALIASES = {
  code: ["FOOD_CD", "foodCd", "FOOD_CODE"],
  name: ["FOOD_NM_KR", "foodNmKr", "DESC_KOR", "FOOD_NM"],
  brand: ["MAKER_NM", "makerNm", "BRAND_NM"],
  servingSize: ["SERVING_SIZE", "servingSize", "SERVING_WT", "Z10500"],
  kcal: ["AMT_NUM1", "amtNum1", "NUTR_CONT1", "ENERC"],
  proteinG: ["AMT_NUM3", "amtNum3", "NUTR_CONT3", "PROCNT"],
  fatG: ["AMT_NUM4", "amtNum4", "NUTR_CONT4", "FATCE"],
  carbG: ["AMT_NUM6", "amtNum6", "NUTR_CONT2", "CHOCDF"],
  sugarG: ["AMT_NUM7", "amtNum7", "NUTR_CONT5", "SUGAR"],
  fiberG: ["AMT_NUM8", "amtNum8", "FIBTG"],
  sodiumMg: ["AMT_NUM13", "amtNum13", "NUTR_CONT6", "NAT"],
} as const;

type RawItem = Record<string, unknown>;

function pick(item: RawItem, aliases: readonly string[]): unknown {
  for (const alias of aliases) {
    const value = item[alias];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  // 응답이 숫자를 문자열로 주고 천단위 콤마가 섞이는 경우가 있다.
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function normalizeItem(item: RawItem): FoodItem | null {
  const name = toText(pick(item, FIELD_ALIASES.name));
  if (!name) return null;

  const rawCode = toText(pick(item, FIELD_ALIASES.code));

  return {
    // 코드가 없으면 이름으로 대체한다. foods 테이블 PK 가 비면 캐시가 불가능하다.
    code: `MFDS:${rawCode ?? name}`,
    name,
    brand: toText(pick(item, FIELD_ALIASES.brand)),
    servingSize: toNumber(pick(item, FIELD_ALIASES.servingSize)) ?? 100,
    servingUnit: "g",
    kcal: toNumber(pick(item, FIELD_ALIASES.kcal)),
    carbG: toNumber(pick(item, FIELD_ALIASES.carbG)),
    proteinG: toNumber(pick(item, FIELD_ALIASES.proteinG)),
    fatG: toNumber(pick(item, FIELD_ALIASES.fatG)),
    sugarG: toNumber(pick(item, FIELD_ALIASES.sugarG)),
    sodiumMg: toNumber(pick(item, FIELD_ALIASES.sodiumMg)),
    fiberG: toNumber(pick(item, FIELD_ALIASES.fiberG)),
  };
}

/**
 * 응답 봉투에서 items 를 꺼낸다.
 *
 * data.go.kr 은 API 마다 봉투가 다르다. { response: { body: { items } } } 도 있고
 * { body: { items } } 도 있으며, items 가 { item: [...] } 로 한 겹 더 싸이기도 한다.
 */
export function extractItems(payload: unknown): { items: RawItem[]; totalCount: number; pageNo: number } {
  if (!payload || typeof payload !== "object") {
    throw new FoodApiError("응답이 객체가 아닙니다.");
  }

  const root = payload as Record<string, unknown>;
  const envelope = (root.response ?? root) as Record<string, unknown>;

  const header = envelope.header as Record<string, unknown> | undefined;
  const resultCode = toText(header?.resultCode ?? header?.RESULT_CODE);

  // 정상 코드는 '00' 또는 'INFO-000'. 그 외는 메시지를 그대로 올린다.
  if (resultCode && !/^(00|INFO-?000)$/.test(resultCode)) {
    const message = toText(header?.resultMsg ?? header?.RESULT_MSG) ?? "알 수 없는 오류";
    throw new FoodApiError(message, resultCode);
  }

  const body = (envelope.body ?? envelope) as Record<string, unknown>;
  const rawItems = body.items ?? body.item;

  let items: RawItem[] = [];
  if (Array.isArray(rawItems)) {
    items = rawItems as RawItem[];
  } else if (rawItems && typeof rawItems === "object") {
    const inner = (rawItems as Record<string, unknown>).item;
    if (Array.isArray(inner)) items = inner as RawItem[];
    else if (inner) items = [inner as RawItem];
    else items = [rawItems as RawItem];
  }

  return {
    items,
    totalCount: toNumber(body.totalCount) ?? items.length,
    pageNo: toNumber(body.pageNo) ?? 1,
  };
}

export function parseSearchResponse(payload: unknown): FoodSearchResult {
  const { items, totalCount, pageNo } = extractItems(payload);

  return {
    items: items.map(normalizeItem).filter((item): item is FoodItem => item !== null),
    totalCount,
    pageNo,
  };
}

/**
 * 음식 검색.
 *
 * 호출부는 이 함수만 쓴다. 공급자가 바뀌어도 시그니처는 유지한다.
 */
export async function searchFoods(
  serviceKey: string,
  query: string,
  options: { pageNo?: number; numOfRows?: number; shape?: RequestShape; signal?: AbortSignal } = {},
): Promise<FoodSearchResult> {
  const url = buildSearchUrl(serviceKey, query, options.shape ?? DEFAULT_SHAPE, options);

  const response = await fetch(url, {
    signal: options.signal ?? AbortSignal.timeout(15_000),
  });

  const text = await response.text();

  // data.go.kr 은 오류도 HTTP 200 + XML 로 주는 경우가 많다.
  // JSON 이 아니면 본문 앞부분을 그대로 올려 원인을 알 수 있게 한다.
  if (!text.trimStart().startsWith("{") && !text.trimStart().startsWith("[")) {
    throw new FoodApiError(
      `JSON 이 아닌 응답 (HTTP ${response.status}): ${text.replace(/\s+/g, " ").slice(0, 200)}`,
    );
  }

  return parseSearchResponse(JSON.parse(text));
}
