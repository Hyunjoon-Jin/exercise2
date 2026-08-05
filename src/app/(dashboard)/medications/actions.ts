"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { MedicationForm, MedicationLogStatus } from "@/lib/db/types";
import { formError, readNumber, readString, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const VALID_FORMS: MedicationForm[] = [
  "tablet",
  "capsule",
  "liquid",
  "injection",
  "topical",
  "inhaler",
  "other",
];

const VALID_STATUSES: MedicationLogStatus[] = ["taken", "skipped", "missed"];

/** "08:00,13:00,20:00" → ["08:00", "13:00", "20:00"] (중복·형식 오류 제거) */
function parseTimes(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const time = part.trim();
    if (/^\d{2}:\d{2}$/.test(time)) seen.add(time);
  }
  return [...seen].sort();
}

function parseDays(formData: FormData): number[] {
  const days = formData
    .getAll("days")
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);

  // 아무 요일도 고르지 않았으면 매일로 본다. 빈 배열은 "영원히 안 먹는 약"이 되어
  // 사용자가 의도했을 리 없다.
  return days.length > 0 ? [...new Set(days)].sort() : [0, 1, 2, 3, 4, 5, 6];
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/**
 * 약 등록 + 복용 스케줄 생성.
 *
 * 스케줄은 약과 함께 만들어져야 의미가 있으므로 한 폼에서 처리한다.
 * 시각을 하나도 넣지 않으면 알림 없이 목록에만 남는 약이 된다 — 허용한다.
 */
export async function createMedication(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();

  const name = readString(formData, "name");
  if (!name) return formError("약 이름을 입력해 주세요.");

  const rawForm = readString(formData, "form");
  const form = (VALID_FORMS as string[]).includes(rawForm)
    ? (rawForm as MedicationForm)
    : "tablet";

  const dosageAmount = readNumber(formData, "dosage_amount");
  if (dosageAmount !== null && (Number.isNaN(dosageAmount) || dosageAmount <= 0)) {
    return formError("용량을 다시 확인해 주세요.");
  }

  const { data: medication, error } = await supabase
    .from("medications")
    .insert({
      user_id: user.id,
      name,
      dosage_amount: dosageAmount,
      dosage_unit: readString(formData, "dosage_unit") || null,
      form,
      purpose: readString(formData, "purpose") || null,
      started_on: readString(formData, "started_on") || null,
      note: readString(formData, "note") || null,
    })
    .select("id")
    .single();

  if (error || !medication) {
    return formError("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }

  const times = parseTimes(readString(formData, "times"));
  const days = parseDays(formData);
  const quantity = readNumber(formData, "quantity") ?? 1;

  if (times.length > 0) {
    const { error: scheduleError } = await supabase.from("medication_schedules").insert(
      times.map((time) => ({
        medication_id: medication.id,
        user_id: user.id,
        time_of_day: time,
        days_of_week: days,
        quantity,
      })),
    );

    if (scheduleError) {
      // 약만 남고 스케줄이 없으면 사용자가 이유를 알 수 없다. 되돌린다.
      await supabase.from("medications").delete().eq("id", medication.id);
      return formError("복용 시간 저장에 실패했습니다. 다시 시도해 주세요.");
    }
  }

  revalidatePath("/medications");
  revalidatePath("/today");
  redirect("/medications");
}

/** 복용 중지 — 기록은 남기고 예정 목록에서만 뺀다 */
export async function deactivateMedication(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();

  const id = readString(formData, "id");
  if (!id) return;

  await supabase
    .from("medications")
    .update({ is_active: false, ended_on: new Date().toISOString().slice(0, 10) })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/medications");
  revalidatePath("/today");
}

export async function reactivateMedication(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();

  const id = readString(formData, "id");
  if (!id) return;

  await supabase
    .from("medications")
    .update({ is_active: true, ended_on: null })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/medications");
  revalidatePath("/today");
}

/**
 * 복용 체크.
 *
 * 예정 복용은 미리 행으로 쌓지 않으므로(스케줄에서 전개) 체크하는 순간
 * 로그가 만들어진다. 같은 예정에 다시 체크하면 상태만 바뀐다.
 */
export async function logDose(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();

  const medicationId = readString(formData, "medication_id");
  const scheduleId = readString(formData, "schedule_id");
  const scheduledFor = readString(formData, "scheduled_for");
  const rawStatus = readString(formData, "status");

  if (!medicationId || !scheduledFor) return;
  if (!(VALID_STATUSES as string[]).includes(rawStatus)) return;

  const status = rawStatus as MedicationLogStatus;

  await supabase.from("medication_logs").upsert(
    {
      user_id: user.id,
      medication_id: medicationId,
      schedule_id: scheduleId || null,
      scheduled_for: scheduledFor,
      status,
      taken_at: status === "taken" ? new Date().toISOString() : null,
    },
    { onConflict: "schedule_id,scheduled_for" },
  );

  revalidatePath("/medications");
  revalidatePath("/today");
}

/** 체크 취소 — 로그를 지워 "아직 기록 안 함" 상태로 되돌린다 */
export async function clearDose(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();

  const logId = readString(formData, "log_id");
  if (!logId) return;

  await supabase.from("medication_logs").delete().eq("id", logId).eq("user_id", user.id);

  revalidatePath("/medications");
  revalidatePath("/today");
}
