"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { MealType } from "@/lib/db/types";
import { searchFood, type FoodSearchOutcome } from "@/lib/food/search";
import { formError, localInputToIso, readString, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const VALID_MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/** 폼에서 넘어오는 끼니 항목 한 줄 */
interface SubmittedItem {
  foodCode: string | null;
  customName: string | null;
  quantity: number;
  unit: string;
  kcal: number | null;
  carbG: number | null;
  proteinG: number | null;
  fatG: number | null;
  /** 직접 입력한 음식을 내 음식 목록에 저장할지 */
  saveAsUserFood?: boolean;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** 검색은 서버에서만 한다 — API 키가 클라이언트로 나가면 안 된다. */
export async function searchFoodAction(query: string): Promise<FoodSearchOutcome> {
  await requireUser();
  return searchFood(query);
}

function parseItems(raw: string): SubmittedItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry): SubmittedItem | null => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;

      const name = typeof item.customName === "string" ? item.customName.trim() : null;
      const code = typeof item.foodCode === "string" ? item.foodCode : null;
      if (!name && !code) return null;

      const quantity = Number(item.quantity);

      return {
        foodCode: code,
        customName: name,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unit: typeof item.unit === "string" && item.unit ? item.unit : "serving",
        kcal: toNullableNumber(item.kcal),
        carbG: toNullableNumber(item.carbG),
        proteinG: toNullableNumber(item.proteinG),
        fatG: toNullableNumber(item.fatG),
        saveAsUserFood: item.saveAsUserFood === true,
      };
    })
    .filter((item): item is SubmittedItem => item !== null);
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 끼니 저장.
 *
 * 끼니와 항목을 한 번에 만든다. 끼니를 먼저 만들고 항목을 나중에 붙이면
 * 중간에 실패했을 때 빈 끼니가 남는다.
 *
 * 영양성분은 이 시점 값을 스냅샷으로 저장한다 — foods 마스터가 갱신돼도
 * 과거 기록이 소급 변경되면 안 된다. (0001_initial_schema.sql 참고)
 */
export async function createMeal(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();

  const rawType = readString(formData, "meal_type");
  const mealType = (VALID_MEAL_TYPES as string[]).includes(rawType)
    ? (rawType as MealType)
    : "lunch";

  const eatenAtLocal = readString(formData, "eaten_at");
  const offsetMinutes = Number(readString(formData, "tz_offset") || "0");
  const eatenAt = eatenAtLocal
    ? localInputToIso(eatenAtLocal, offsetMinutes)
    : new Date().toISOString();

  if (!eatenAt) return formError("식사 시각을 다시 확인해 주세요.");

  const items = parseItems(readString(formData, "items"));
  if (items.length === 0) return formError("음식을 하나 이상 추가해 주세요.");

  const { data: meal, error: mealError } = await supabase
    .from("meals")
    .insert({
      user_id: user.id,
      meal_type: mealType,
      eaten_at: eatenAt,
      note: readString(formData, "note") || null,
    })
    .select("id")
    .single();

  if (mealError || !meal) {
    return formError("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }

  const { error: itemError } = await supabase.from("meal_items").insert(
    items.map((item) => ({
      meal_id: meal.id,
      user_id: user.id,
      food_code: item.foodCode,
      custom_name: item.customName,
      quantity: item.quantity,
      unit: item.unit,
      kcal: item.kcal,
      carb_g: item.carbG,
      protein_g: item.proteinG,
      fat_g: item.fatG,
    })),
  );

  if (itemError) {
    // 항목 없는 끼니가 남지 않도록 되돌린다.
    await supabase.from("meals").delete().eq("id", meal.id);
    return formError("음식 저장에 실패했습니다. 다시 시도해 주세요.");
  }

  // 직접 입력한 음식은 다음에 다시 쓸 수 있도록 내 음식으로 저장한다.
  const toSave = items.filter((item) => item.saveAsUserFood && item.customName);
  if (toSave.length > 0) {
    await supabase.from("user_foods").upsert(
      toSave.map((item) => ({
        code: `USER:${user.id}:${item.customName}`,
        user_id: user.id,
        name: item.customName!,
        serving_size: 1,
        serving_unit: item.unit,
        kcal: item.kcal,
        carb_g: item.carbG,
        protein_g: item.proteinG,
        fat_g: item.fatG,
      })),
      { onConflict: "code" },
    );
  }

  revalidatePath("/meals");
  revalidatePath("/today");
  revalidatePath("/metrics");
  redirect("/meals");
}

export async function deleteMeal(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();

  const id = readString(formData, "id");
  if (!id) return;

  // meal_items 는 on delete cascade 로 함께 지워지고,
  // 트리거가 그 날 영양 집계를 다시 계산한다.
  await supabase.from("meals").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath("/meals");
  revalidatePath("/today");
  revalidatePath("/metrics");
}
