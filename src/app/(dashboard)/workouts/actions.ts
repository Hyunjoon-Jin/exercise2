"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { WorkoutIntensity } from "@/lib/db/types";
import {
  formError,
  formSaved,
  localInputToIso,
  readNumber,
  readString,
  type FormState,
} from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const VALID_INTENSITY: WorkoutIntensity[] = ["light", "moderate", "vigorous"];

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/**
 * 운동 기록.
 *
 * 소모 칼로리는 비워 두면 트리거가 MET × 체중 × 시간으로 채운다.
 * 체중 기록이 없으면 비워 둔 채로 남는다 — 임의 기본 체중으로 채우면
 * 그럴듯하지만 틀린 숫자가 기록에 남는다.
 */
export async function createWorkout(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();

  const exerciseCode = readString(formData, "exercise_code");
  const customName = readString(formData, "custom_name");

  if (!exerciseCode && !customName) {
    return formError("운동 종류를 선택하거나 직접 입력해 주세요.");
  }

  const duration = readNumber(formData, "duration_min");
  if (duration === null || Number.isNaN(duration) || duration <= 0) {
    return formError("운동 시간을 입력해 주세요.");
  }
  if (duration > 1440) {
    return formError("운동 시간이 하루를 넘습니다. 다시 확인해 주세요.");
  }

  const rawIntensity = readString(formData, "intensity");
  const intensity = (VALID_INTENSITY as string[]).includes(rawIntensity)
    ? (rawIntensity as WorkoutIntensity)
    : "moderate";

  const startedAtLocal = readString(formData, "started_at");
  const offsetMinutes = Number(readString(formData, "tz_offset") || "0");
  const startedAt = startedAtLocal
    ? localInputToIso(startedAtLocal, offsetMinutes)
    : new Date().toISOString();

  if (!startedAt) return formError("운동 시각을 다시 확인해 주세요.");
  if (Date.parse(startedAt) > Date.now() + 60_000) {
    return formError("운동 시각이 미래로 되어 있습니다.");
  }

  const distance = readNumber(formData, "distance_km");

  const { error } = await supabase.from("workouts").insert({
    user_id: user.id,
    exercise_code: exerciseCode || null,
    custom_name: exerciseCode ? null : customName,
    started_at: startedAt,
    duration_min: Math.round(duration),
    intensity,
    distance_km: distance !== null && !Number.isNaN(distance) ? distance : null,
    note: readString(formData, "note") || null,
  });

  if (error) return formError("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");

  revalidatePath("/workouts");
  revalidatePath("/today");
  revalidatePath("/metrics");
  redirect("/workouts");
}

export async function deleteWorkout(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();

  const id = readString(formData, "id");
  if (!id) return;

  await supabase.from("workouts").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath("/workouts");
  revalidatePath("/today");
  revalidatePath("/metrics");
}

/** 주간 운동 목표(분). 0 이나 빈 값이면 목표를 해제한다. */
export async function setWeeklyGoal(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();

  const raw = readNumber(formData, "goal_min");

  if (raw !== null && (Number.isNaN(raw) || raw < 0 || raw > 10080)) {
    return formError("목표 시간을 다시 확인해 주세요.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ weekly_exercise_goal_min: raw && raw > 0 ? Math.round(raw) : null })
    .eq("id", user.id);

  if (error) return formError("저장에 실패했습니다.");

  revalidatePath("/workouts");
  return formSaved();
}
