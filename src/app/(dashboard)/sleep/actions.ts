"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  formError,
  formSaved,
  readNumber,
  readString,
  type FormState,
} from "@/lib/forms";
import { resolveSleepWindow } from "@/lib/sleep/window";
import { createClient } from "@/lib/supabase/server";

export async function recordSleep(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const sleepDate = readString(formData, "sleep_date");
  const bedTime = readString(formData, "bed_time");
  const wakeTime = readString(formData, "wake_time");
  const quality = readNumber(formData, "quality");
  const note = readString(formData, "note");
  const offsetMinutes = Number(readString(formData, "tz_offset") || "0");

  if (!sleepDate) return formError("날짜를 선택해 주세요.");
  if (!bedTime || !wakeTime) return formError("취침·기상 시각을 모두 입력해 주세요.");

  const window = resolveSleepWindow(sleepDate, bedTime, wakeTime, offsetMinutes);
  if (!window) {
    return formError("수면 시간이 올바르지 않습니다. 취침·기상 시각을 확인해 주세요.");
  }

  // 하루에 한 건이므로 같은 날짜를 다시 기록하면 덮어쓴다.
  // (unique (user_id, sleep_date) 제약과 맞춘 동작)
  const { error } = await supabase.from("sleep_records").upsert(
    {
      user_id: user.id,
      sleep_date: sleepDate,
      bed_time: window.bedIso,
      wake_time: window.wakeIso,
      duration_min: window.minutes,
      quality: quality ?? null,
      note: note || null,
    },
    { onConflict: "user_id,sleep_date" },
  );

  if (error) return formError("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");

  // 트리거가 SLEEP_DURATION 파생 지표를 함께 갱신하므로 지표 화면도 다시 그린다.
  revalidatePath("/sleep");
  revalidatePath("/metrics");
  revalidatePath("/metrics/SLEEP_DURATION");
  revalidatePath("/today");

  return formSaved();
}

export async function deleteSleep(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const id = readString(formData, "id");
  if (!id) return;

  await supabase.from("sleep_records").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath("/sleep");
  revalidatePath("/metrics");
  revalidatePath("/metrics/SLEEP_DURATION");
  revalidatePath("/today");
}
