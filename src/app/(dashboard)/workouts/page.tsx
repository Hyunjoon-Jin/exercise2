import Link from "next/link";
import { redirect } from "next/navigation";

import { DeleteRecordButton } from "@/components/delete-record-button";
import { createClient } from "@/lib/supabase/server";

import { deleteWorkout } from "./actions";
import { GoalForm } from "./goal-form";

export const metadata = { title: "운동" };

const INTENSITY_LABEL: Record<string, string> = {
  light: "가볍게",
  moderate: "보통",
  vigorous: "격하게",
};

const DATETIME = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

export default async function WorkoutsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [summaryResult, workoutsResult, exercisesResult, profileResult] =
    await Promise.all([
      supabase.rpc("weekly_exercise_summary"),
      supabase
        .from("workouts")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(30),
      supabase.from("exercises").select("code, name"),
      supabase
        .from("profiles")
        .select("weekly_exercise_goal_min")
        .eq("id", user.id)
        .single(),
    ]);

  const summary = summaryResult.data?.[0];
  const workouts = workoutsResult.data ?? [];
  const goal = profileResult.data?.weekly_exercise_goal_min ?? null;

  const exerciseNames = new Map(
    (exercisesResult.data ?? []).map((exercise) => [exercise.code, exercise.name]),
  );

  const totalMin = summary?.total_min ?? 0;
  const progress = goal && goal > 0 ? Math.min(100, Math.round((totalMin / goal) * 100)) : null;

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">운동</h1>
          <p className="mt-2 text-sm text-muted">
            운동 시간과 소모 칼로리가 지표로 함께 쌓입니다.
          </p>
        </div>
        <Link
          href="/workouts/new"
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white
                     transition-colors hover:bg-brand-700"
        >
          기록하기
        </Link>
      </div>

      <section className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">최근 7일</h2>
        <p className="tabular mt-1 text-2xl font-semibold">
          {totalMin}
          <span className="ml-1 text-sm font-normal text-muted">분</span>
          {goal ? (
            <span className="ml-2 text-sm font-normal text-muted">/ 목표 {goal}분</span>
          ) : null}
        </p>

        {progress !== null ? (
          <div className="mt-3">
            <div
              className="h-2 overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="주간 운동 목표 달성률"
            >
              <div
                className="h-full rounded-full bg-brand-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted">
              목표의 {progress}% · {summary?.session_count ?? 0}회 운동
              {summary?.total_calories
                ? ` · ${Math.round(Number(summary.total_calories))}kcal 소모`
                : ""}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted">
            {summary?.session_count ?? 0}회 운동
            {summary?.total_calories
              ? ` · ${Math.round(Number(summary.total_calories))}kcal 소모`
              : ""}
          </p>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">주간 목표</h2>
        <p className="mt-1 text-xs text-muted">
          세계보건기구는 성인에게 중강도 유산소 운동을 주 150분 이상 권고합니다.
        </p>
        <div className="mt-3">
          <GoalForm current={goal} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">기록 내역</h2>

        {workouts.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            아직 기록이 없습니다.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {workouts.map((workout) => (
              <li
                key={workout.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {workout.exercise_code
                      ? (exerciseNames.get(workout.exercise_code) ?? workout.exercise_code)
                      : workout.custom_name}
                    <span className="tabular ml-2 text-xs font-normal text-muted">
                      {workout.duration_min}분
                    </span>
                  </p>
                  <p className="text-xs text-muted">
                    {DATETIME.format(new Date(workout.started_at))}
                    <span className="ml-2">
                      {INTENSITY_LABEL[workout.intensity] ?? workout.intensity}
                    </span>
                    {workout.calories_burned !== null ? (
                      <span className="tabular ml-2">
                        {Math.round(Number(workout.calories_burned))}kcal
                      </span>
                    ) : null}
                  </p>
                </div>

                <DeleteRecordButton
                  action={deleteWorkout}
                  fields={{ id: workout.id }}
                  what={`${workout.custom_name ?? "운동"} 기록`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
