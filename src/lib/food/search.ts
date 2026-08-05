import "server-only";

import { createClient } from "@/lib/supabase/server";

import { searchFoods as searchMfds } from "./mfds";
import { FoodApiError, type FoodItem } from "./types";

export interface FoodSearchHit extends FoodItem {
  /** 어디서 온 결과인지 — UI 가 "내 음식"을 구분해 보여준다 */
  origin: "user" | "cache" | "api";
}

export interface FoodSearchOutcome {
  hits: FoodSearchHit[];
  /** API 를 호출했는지. 쿼터를 아끼는 설계가 동작하는지 확인용. */
  usedApi: boolean;
  /** API 호출이 실패했을 때의 사유. 로컬 결과는 그대로 돌려준다. */
  apiError?: string;
}

/** 로컬 결과가 이 수에 못 미칠 때만 공공 API 를 부른다. */
const LOCAL_RESULT_THRESHOLD = 5;
const PAGE_SIZE = 20;

export function isFoodApiConfigured(): boolean {
  return Boolean(process.env.FOOD_API_KEY);
}

/**
 * 음식 검색 — 로컬 우선, 부족할 때만 공공 API.
 *
 * 공공데이터포털 개발계정은 하루 1,000건이라 검색마다 API 를 부르면
 * 사용자 몇 명으로도 소진된다. 조회 결과를 foods 에 적재해 두고
 * 다음부터는 로컬에서 답한다. (docs/FOOD_API.md)
 */
export async function searchFood(query: string): Promise<FoodSearchOutcome> {
  const trimmed = query.trim();
  if (trimmed.length < 1) return { hits: [], usedApi: false };

  const supabase = await createClient();
  const pattern = `%${trimmed}%`;

  // 내 음식과 공용 캐시를 동시에 조회한다.
  const [userResult, cacheResult] = await Promise.all([
    supabase
      .from("user_foods")
      .select("*")
      .ilike("name", pattern)
      .order("use_count", { ascending: false })
      .limit(PAGE_SIZE),
    supabase.from("foods").select("*").ilike("name", pattern).limit(PAGE_SIZE),
  ]);

  const hits: FoodSearchHit[] = [
    ...(userResult.data ?? []).map((row) => toHit(row, "user")),
    ...(cacheResult.data ?? []).map((row) => toHit(row, "cache")),
  ];

  if (hits.length >= LOCAL_RESULT_THRESHOLD || !isFoodApiConfigured()) {
    return { hits, usedApi: false };
  }

  // 로컬에 없는 음식 → 공공 API 조회 후 캐시에 적재
  try {
    const remote = await searchMfds(process.env.FOOD_API_KEY!, trimmed, {
      numOfRows: PAGE_SIZE,
    });

    if (remote.items.length > 0) {
      // 캐시 적재는 실패해도 검색 결과는 돌려준다.
      const { error } = await supabase.rpc("cache_foods", {
        items: remote.items as unknown as never,
      });
      if (error) console.error("음식 캐시 적재 실패:", error.message);
    }

    const known = new Set(hits.map((hit) => hit.code));
    for (const item of remote.items) {
      if (!known.has(item.code)) hits.push({ ...item, origin: "api" });
    }

    return { hits, usedApi: true };
  } catch (error) {
    // API 가 죽어도 로컬 결과와 직접 입력은 계속 쓸 수 있어야 한다.
    const message =
      error instanceof FoodApiError
        ? error.message
        : "음식 검색 서버에 연결하지 못했습니다.";
    return { hits, usedApi: true, apiError: message };
  }
}

interface FoodRow {
  code: string;
  name: string;
  brand: string | null;
  serving_size: number;
  serving_unit: string;
  kcal: number | null;
  carb_g: number | null;
  protein_g: number | null;
  fat_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  fiber_g: number | null;
}

function toHit(row: FoodRow, origin: FoodSearchHit["origin"]): FoodSearchHit {
  return {
    code: row.code,
    name: row.name,
    brand: row.brand,
    servingSize: Number(row.serving_size),
    servingUnit: row.serving_unit,
    kcal: row.kcal,
    carbG: row.carb_g,
    proteinG: row.protein_g,
    fatG: row.fat_g,
    sugarG: row.sugar_g,
    sodiumMg: row.sodium_mg,
    fiberG: row.fiber_g,
    origin,
  };
}
