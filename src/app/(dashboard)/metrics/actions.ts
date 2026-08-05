"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  formError,
  formSaved,
  localInputToIso,
  readNumber,
  readString,
  type FormState,
} from "@/lib/forms";
import { isPlausibleValue } from "@/lib/metrics/status";
import { createClient } from "@/lib/supabase/server";

/**
 * 지표 기록 저장.
 *
 * 값 검증은 metric_definitions 의 min_valid/max_valid 로 한다. 지표마다
 * 다른 상한/하한을 코드에 하드코딩하면 지표를 추가할 때마다 코드를 고쳐야 한다.
 */
export async function recordMetric(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const code = readString(formData, "metric_code");
  const value = readNumber(formData, "value");
  const measuredAtLocal = readString(formData, "measured_at");
  const offsetMinutes = Number(readString(formData, "tz_offset") || "0");
  const note = readString(formData, "note");

  if (!code) return formError("지표를 선택해 주세요.");
  if (value === null || Number.isNaN(value)) return formError("값을 입력해 주세요.");

  const { data: definition } = await supabase
    .from("metric_definitions")
    .select("code, unit, min_valid, max_valid, display_name")
    .eq("code", code)
    .maybeSingle();

  if (!definition) return formError("알 수 없는 지표입니다.");

  if (!isPlausibleValue(value, definition)) {
    return formError(
      `${definition.display_name} 값을 다시 확인해 주세요. 입력하신 값이 일반적인 범위를 크게 벗어납니다.`,
    );
  }

  const measuredAt = measuredAtLocal
    ? localInputToIso(measuredAtLocal, offsetMinutes)
    : new Date().toISOString();

  if (!measuredAt) return formError("측정 시각을 다시 확인해 주세요.");
  if (Date.parse(measuredAt) > Date.now() + 60_000) {
    return formError("측정 시각이 미래로 되어 있습니다.");
  }

  const { error } = await supabase.from("health_metrics").insert({
    user_id: user.id,
    metric_code: code,
    value,
    unit: definition.unit,
    measured_at: measuredAt,
    source: "self",
    note: note || null,
  });

  if (error) return formError("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");

  revalidatePath("/metrics");
  revalidatePath(`/metrics/${code}`);
  revalidatePath("/today");

  return formSaved();
}

/**
 * 기록 삭제.
 *
 * 파생 지표(BMI 등)는 원본이 지워질 때 트리거가 함께 지우므로
 * 여기서 따로 다루지 않는다.
 */
export async function deleteMetric(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const id = readString(formData, "id");
  const code = readString(formData, "metric_code");
  if (!id) return;

  // RLS 가 본인 행만 허용하므로 user_id 조건은 방어적 중복이다.
  await supabase.from("health_metrics").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath("/metrics");
  if (code) revalidatePath(`/metrics/${code}`);
  revalidatePath("/today");
}
