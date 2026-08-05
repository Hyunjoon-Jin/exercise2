import Link from "next/link";
import { redirect } from "next/navigation";

import type { MedicationDose } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

import {
  deactivateMedication,
  reactivateMedication,
  setShowMedicationName,
} from "./actions";
import { DoseChecklist } from "./dose-checklist";
import { PushToggle } from "./push-toggle";

export const metadata = { title: "복약" };

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/** 사용자 타임존 기준 오늘 날짜 (YYYY-MM-DD) */
function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

function describeSchedule(days: number[], time: string): string {
  const hhmm = time.slice(0, 5);
  if (days.length === 7) return `매일 ${hhmm}`;
  return `${days.map((d) => DAY_LABELS[d]).join("·")} ${hhmm}`;
}

export default async function MedicationsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, show_medication_name_in_push")
    .eq("id", user.id)
    .single();

  const timezone = profile?.timezone ?? "Asia/Seoul";

  const [dosesResult, adherenceResult, medicationsResult, schedulesResult] =
    await Promise.all([
      supabase.rpc("medication_doses_for_date", { target_date: todayIn(timezone) }),
      supabase.rpc("medication_adherence", { days: 7 }),
      supabase.from("medications").select("*").order("is_active", { ascending: false }),
      supabase.from("medication_schedules").select("*").order("time_of_day"),
    ]);

  const doses = (dosesResult.data ?? []) as MedicationDose[];
  const adherence = adherenceResult.data;
  const medications = medicationsResult.data ?? [];
  const schedules = schedulesResult.data ?? [];

  const schedulesByMedication = new Map<string, typeof schedules>();
  for (const schedule of schedules) {
    const list = schedulesByMedication.get(schedule.medication_id) ?? [];
    list.push(schedule);
    schedulesByMedication.set(schedule.medication_id, list);
  }

  const takenToday = doses.filter((d) => d.status === "taken").length;

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">복약</h1>
          <p className="mt-2 text-sm text-muted">
            복용 시간에 알림을 받고, 복용 여부를 기록합니다.
          </p>
        </div>
        <Link
          href="/medications/new"
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white
                     transition-colors hover:bg-brand-700"
        >
          약 추가
        </Link>
      </div>

      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">오늘 복용</h2>
          {doses.length > 0 ? (
            <span className="tabular text-sm text-muted">
              {takenToday} / {doses.length}
            </span>
          ) : null}
        </div>
        <div className="mt-3">
          <DoseChecklist doses={doses} />
        </div>
      </section>

      {adherence !== null && adherence !== undefined ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">최근 7일 복약 순응도</h2>
          <p className="tabular mt-1 text-2xl font-semibold">{adherence}%</p>
          <p className="mt-1 text-xs text-muted">
            어제까지의 예정 복용 대비 실제 복용 비율입니다.
          </p>
        </section>
      ) : null}

      <section className="mt-6 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">복용 알림</h2>
        <div className="mt-3">
          <PushToggle />
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <form action={setShowMedicationName} className="flex items-start gap-3">
            <input
              type="hidden"
              name="show"
              value={profile?.show_medication_name_in_push ? "0" : "1"}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">알림에 약 이름 표시</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                켜면 알림에 &ldquo;메트포르민 500mg&rdquo;처럼 약 이름이 나옵니다.
                <strong className="font-medium text-foreground">
                  {" "}
                  잠금화면에도 그대로 표시되므로 주변 사람이 볼 수 있습니다.
                </strong>{" "}
                꺼두면 &ldquo;앱을 열어 확인해 주세요&rdquo;로만 알립니다.
              </p>
            </div>
            <button
              type="submit"
              aria-pressed={profile?.show_medication_name_in_push ?? false}
              className={`min-h-11 shrink-0 rounded-lg border px-3 text-sm transition-colors ${
                profile?.show_medication_name_in_push
                  ? "border-brand-500 bg-brand-soft font-medium text-brand-strong"
                  : "border-border-strong text-muted hover:bg-surface"
              }`}
            >
              {profile?.show_medication_name_in_push ? "표시함" : "표시 안 함"}
            </button>
          </form>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">등록한 약</h2>
        {medications.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            등록한 약이 없습니다.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {medications.map((medication) => {
              const medSchedules = schedulesByMedication.get(medication.id) ?? [];
              return (
                <li
                  key={medication.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p
                      className={`truncate text-sm font-medium ${
                        medication.is_active ? "" : "text-muted"
                      }`}
                    >
                      {medication.name}
                      {medication.dosage_amount ? (
                        <span className="ml-1.5 text-xs font-normal text-muted">
                          {medication.dosage_amount}
                          {medication.dosage_unit}
                        </span>
                      ) : null}
                      {!medication.is_active ? (
                        <span className="ml-2 text-xs font-normal">복용 중지</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted">
                      {medSchedules.length > 0
                        ? medSchedules
                            .map((s) => describeSchedule(s.days_of_week, s.time_of_day))
                            .join(", ")
                        : "복용 시간 없음"}
                    </p>
                  </div>

                  <form action={medication.is_active ? deactivateMedication : reactivateMedication}>
                    <input type="hidden" name="id" value={medication.id} />
                    <button
                      type="submit"
                      className="shrink-0 rounded-lg border border-border-strong px-2.5 py-1.5 text-xs
                                 text-muted transition-colors hover:bg-surface hover:text-foreground"
                    >
                      {medication.is_active ? "중지" : "재개"}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
