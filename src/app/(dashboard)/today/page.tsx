import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MetricStatusBadge } from "@/components/metric-status-badge";
import type { MedicationDose } from "@/lib/db/types";
import { PINNED_CODES } from "@/lib/metrics/constants";
import { getMetricSummaries, type MetricSummary } from "@/lib/metrics/queries";
import { formatMetricValue } from "@/lib/metrics/status";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "오늘" };

function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

export default async function TodayPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, sex, birth_year, timezone")
    .eq("id", user.id)
    .single();

  const timezone = profile?.timezone ?? "Asia/Seoul";
  const today = todayIn(timezone);

  const [summaries, dosesResult, sleepResult, nutritionResult, exerciseResult] =
    await Promise.all([
      getMetricSummaries({
        sex: profile?.sex ?? "unspecified",
        birth_year: profile?.birth_year ?? null,
      }),
      supabase.rpc("medication_doses_for_date", { target_date: today }),
      supabase
        .from("sleep_records")
        .select("sleep_date, duration_min")
        .order("sleep_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.rpc("daily_nutrition_summary", { target_date: today }),
      supabase.rpc("weekly_exercise_summary"),
    ]);

  const doses = (dosesResult.data ?? []) as MedicationDose[];
  const takenCount = doses.filter((d) => d.status === "taken").length;
  const pendingCount = doses.filter((d) => d.status === null).length;
  const lastSleep = sleepResult.data;
  const nutrition = nutritionResult.data?.[0];
  const exercise = exerciseResult.data?.[0];

  // 주요 지표 중 기록이 있는 것만 카드로 띄운다.
  // latest 가 채워진 것만 남기므로 타입에서도 non-null 로 좁힌다.
  const pinned = PINNED_CODES.map((code) =>
    summaries.find((s) => s.definition.code === code),
  ).filter(
    (s): s is MetricSummary & { latest: NonNullable<MetricSummary["latest"]> } =>
      s !== undefined && s.latest !== null,
  );

  const name = profile?.display_name ?? "반갑습니다";
  const dateLabel = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: timezone,
  }).format(new Date());

  const hasAnything =
    pinned.length > 0 ||
    doses.length > 0 ||
    Boolean(lastSleep) ||
    Number(nutrition?.meal_count ?? 0) > 0 ||
    Number(exercise?.session_count ?? 0) > 0;

  return (
    <>
      <p className="text-sm text-muted">{dateLabel}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{name}님</h1>

      {doses.length > 0 ? (
        <section className="mt-6 rounded-xl border border-border p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">오늘 복약</h2>
            <Link href="/medications" className="text-xs text-brand-600 hover:underline">
              기록하기
            </Link>
          </div>
          <p className="tabular mt-1 text-2xl font-semibold">
            {takenCount} / {doses.length}
          </p>
          <p className="mt-1 text-xs text-muted">
            {pendingCount > 0
              ? `${pendingCount}건이 아직 기록되지 않았습니다.`
              : "오늘 예정된 복용을 모두 기록했습니다."}
          </p>
        </section>
      ) : null}

      {pinned.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">주요 지표</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {pinned.map((summary) => (
              <li key={summary.definition.code}>
                <Link
                  href={`/metrics/${summary.definition.code}` as Route}
                  className="block rounded-xl border border-border p-4 transition-colors hover:bg-surface"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-xs text-muted">
                      {summary.definition.short_name ?? summary.definition.display_name}
                    </span>
                    <MetricStatusBadge status={summary.status} />
                  </div>
                  <p className="tabular mt-1.5 text-xl font-semibold">
                    {formatMetricValue(summary.latest.value, summary.definition)}
                    <span className="ml-1 text-xs font-normal text-muted">
                      {summary.definition.unit}
                    </span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(nutrition && Number(nutrition.meal_count) > 0) ||
      (exercise && Number(exercise.session_count) > 0) ? (
        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          {nutrition && Number(nutrition.meal_count) > 0 ? (
            <div className="rounded-xl border border-border p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">오늘 섭취</h2>
                <Link href="/meals" className="text-xs text-brand-600 hover:underline">
                  기록하기
                </Link>
              </div>
              <p className="tabular mt-1 text-2xl font-semibold">
                {Math.round(Number(nutrition.kcal))}
                <span className="ml-1 text-sm font-normal text-muted">kcal</span>
              </p>
              <p className="tabular mt-1 text-xs text-muted">
                탄수 {Number(nutrition.carb_g).toFixed(0)}g · 단백{" "}
                {Number(nutrition.protein_g).toFixed(0)}g · 지방{" "}
                {Number(nutrition.fat_g).toFixed(0)}g
              </p>
            </div>
          ) : null}

          {exercise && Number(exercise.session_count) > 0 ? (
            <div className="rounded-xl border border-border p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">이번 주 운동</h2>
                <Link href="/workouts" className="text-xs text-brand-600 hover:underline">
                  기록하기
                </Link>
              </div>
              <p className="tabular mt-1 text-2xl font-semibold">
                {exercise.total_min}
                <span className="ml-1 text-sm font-normal text-muted">분</span>
              </p>
              <p className="mt-1 text-xs text-muted">
                {exercise.goal_min
                  ? `목표 ${exercise.goal_min}분 중 ${Math.min(
                      100,
                      Math.round((Number(exercise.total_min) / exercise.goal_min) * 100),
                    )}%`
                  : `${exercise.session_count}회 운동`}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {lastSleep?.duration_min ? (
        <section className="mt-6 rounded-xl border border-border p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">가장 최근 수면</h2>
            <Link href="/sleep" className="text-xs text-brand-600 hover:underline">
              기록하기
            </Link>
          </div>
          <p className="tabular mt-1 text-2xl font-semibold">
            {formatDuration(lastSleep.duration_min)}
          </p>
          <p className="mt-1 text-xs text-muted">{lastSleep.sleep_date}</p>
        </section>
      ) : null}

      {!hasAnything ? (
        <section className="mt-6 rounded-xl border border-dashed border-border p-6 text-center">
          <h2 className="text-sm font-semibold">아직 기록이 없습니다</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            체중이나 혈압을 한 번 기록해 보세요. 나중에 건강검진 결과를 올리면 같은
            그래프에서 함께 보실 수 있습니다.
          </p>
          <Link
            href="/metrics"
            className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white
                       transition-colors hover:bg-brand-700"
          >
            첫 기록 남기기
          </Link>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-semibold">빠른 이동</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { href: "/metrics", label: "수치 기록" },
            { href: "/sleep", label: "수면 기록" },
            { href: "/medications", label: "복약 체크" },
            { href: "/checkups", label: "검진 결과" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href as Route}
              className="rounded-xl border border-border px-4 py-3 text-center text-sm font-medium
                         transition-colors hover:bg-surface"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
