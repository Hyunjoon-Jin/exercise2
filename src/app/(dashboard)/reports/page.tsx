import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import type { MetricDefinition } from "@/lib/db/types";
import { formatMetricValue } from "@/lib/metrics/status";
import {
  describeDelta,
  formatDuration,
  goalPercent,
  parseWeekOffset,
  MAX_WEEK_OFFSET,
} from "@/lib/reports/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "리포트" };

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" });

/**
 * 지난주 대비 변화.
 *
 * 색으로 좋고 나쁨을 칠하지 않는다. 체중이 준 것이 누구에게나 좋은 일은
 * 아니고, 그런 판단은 의료 행위에 가까워진다. 방향과 양만 보여준다.
 */
function Delta({
  current,
  previous,
  format,
  suffix = "",
}: {
  current: number | null;
  previous: number | null;
  format: (value: number) => string;
  suffix?: string;
}) {
  const delta = describeDelta(current, previous);
  if (!delta) return null;

  if (delta.direction === "flat") {
    return <span className="text-xs text-muted">지난주와 비슷</span>;
  }

  return (
    <span className="tabular text-xs text-muted">
      지난주 대비 {delta.direction === "up" ? "▲" : "▼"} {format(delta.amount)}
      {suffix}
    </span>
  );
}

function Card({
  title,
  href,
  value,
  unit,
  detail,
  delta,
}: {
  title: string;
  href?: string;
  value: string;
  unit?: string;
  detail?: string;
  delta?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {href ? (
          <Link
            href={href as Route}
            aria-label={`${title} 자세히 보기`}
            className="text-xs text-brand-text hover:underline"
          >
            보기
          </Link>
        ) : null}
      </div>
      <p className="tabular mt-1 text-2xl font-semibold">
        {value}
        {unit ? <span className="ml-1 text-sm font-normal text-muted">{unit}</span> : null}
      </p>
      {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
      {delta ? <p className="mt-1">{delta}</p> : null}
    </div>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const params = await searchParams;
  const week = parseWeekOffset(params.w);

  const [currentResult, previousResult, definitionsResult] = await Promise.all([
    supabase.rpc("weekly_report", { p_week_offset: week }),
    supabase.rpc("weekly_report", { p_week_offset: week + 1 }),
    supabase
      .from("metric_definitions")
      .select("*")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  const report = currentResult.data?.[0];
  const previous = previousResult.data?.[0];
  const definitions = definitionsResult.data ?? [];

  if (!report) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">리포트</h1>
        <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          요약을 불러오지 못했습니다.
        </p>
      </>
    );
  }

  const { data: changes } = await supabase.rpc("metric_period_summary", {
    p_start: report.period_start,
    p_end: report.period_end,
  });

  const definitionByCode = new Map<string, MetricDefinition>(
    definitions.map((definition) => [definition.code, definition]),
  );

  // 정의가 있는 지표만, 정의 순서대로. 정의 없는 코드는 화면에 이름이 없다.
  const metricRows = (changes ?? [])
    .filter((row) => definitionByCode.has(row.metric_code))
    .sort(
      (a, b) =>
        (definitionByCode.get(a.metric_code)?.sort_order ?? 0) -
        (definitionByCode.get(b.metric_code)?.sort_order ?? 0),
    );

  const goal = goalPercent(report.exercise_min, report.exercise_goal_min);

  const hasAnything =
    report.sleep_nights > 0 ||
    report.kcal_days > 0 ||
    report.exercise_sessions > 0 ||
    report.doses_total > 0 ||
    report.weight_count > 0;

  const periodLabel = `${DATE_FMT.format(
    new Date(`${report.period_start}T00:00:00`),
  )} – ${DATE_FMT.format(new Date(`${report.period_end}T00:00:00`))}`;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">리포트</h1>

      <div className="mt-4 flex items-center justify-between gap-3">
        {week < MAX_WEEK_OFFSET ? (
          <Link
            href={`/reports?w=${week + 1}` as Route}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-muted
                       transition-colors hover:bg-surface"
          >
            ← 이전 주
          </Link>
        ) : (
          // 상한에서 더 눌러도 같은 주로 돌아온다. 링크를 살려두면 고장으로 읽힌다.
          <span className="px-3 py-1.5 text-sm text-muted">1년 전까지</span>
        )}

        <p className="text-sm font-medium">{periodLabel}</p>

        {week > 0 ? (
          <Link
            href={(week - 1 === 0 ? "/reports" : `/reports?w=${week - 1}`) as Route}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-muted
                       transition-colors hover:bg-surface"
          >
            다음 주 →
          </Link>
        ) : (
          <span className="px-3 py-1.5 text-sm text-muted">이번 주</span>
        )}
      </div>

      {week === 0 ? (
        <p className="mt-3 text-xs text-muted">
          이번 주는 아직 진행 중이라 지난주와 단순 비교하기 어렵습니다.
        </p>
      ) : null}

      {!hasAnything ? (
        <p className="mt-6 rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          이 주에는 기록이 없습니다.
        </p>
      ) : (
        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          {report.sleep_nights > 0 ? (
            <Card
              title="평균 수면"
              href="/sleep"
              value={formatDuration(Number(report.sleep_avg_min ?? 0))}
              detail={`${report.sleep_nights}박 기록`}
              delta={
                <Delta
                  current={report.sleep_avg_min}
                  previous={previous?.sleep_nights ? previous.sleep_avg_min : null}
                  format={(v) => String(Math.round(v))}
                  suffix="분"
                />
              }
            />
          ) : null}

          {report.kcal_days > 0 ? (
            <Card
              title="하루 평균 섭취"
              href="/meals"
              value={String(Math.round(Number(report.kcal_avg ?? 0)))}
              unit="kcal"
              detail={`${report.kcal_days}일 기록`}
              delta={
                <Delta
                  current={report.kcal_avg}
                  previous={previous?.kcal_days ? previous.kcal_avg : null}
                  format={(v) => String(Math.round(v))}
                  suffix="kcal"
                />
              }
            />
          ) : null}

          {report.exercise_sessions > 0 ? (
            <Card
              title="운동"
              href="/workouts"
              value={String(report.exercise_min)}
              unit="분"
              detail={
                goal !== null
                  ? `${report.exercise_sessions}회 · 목표 ${report.exercise_goal_min}분의 ${goal}%`
                  : `${report.exercise_sessions}회`
              }
              delta={
                <Delta
                  current={report.exercise_min}
                  previous={previous?.exercise_min ?? null}
                  format={(v) => String(Math.round(v))}
                  suffix="분"
                />
              }
            />
          ) : null}

          {report.doses_total > 0 ? (
            <Card
              title="복약"
              href="/medications"
              value={`${report.adherence ?? 0}`}
              unit="%"
              detail={`예정 ${report.doses_total}건 중 ${report.doses_taken}건 기록`}
              delta={
                <Delta
                  current={report.adherence}
                  previous={previous?.doses_total ? previous.adherence : null}
                  format={(v) => String(Math.round(v))}
                  suffix="%p"
                />
              }
            />
          ) : null}

          {report.weight_count > 0 ? (
            <Card
              title="평균 체중"
              href="/metrics/WEIGHT"
              value={Number(report.weight_avg ?? 0).toFixed(1)}
              unit="kg"
              detail={`${report.weight_count}회 측정`}
              delta={
                <Delta
                  current={report.weight_avg}
                  previous={previous?.weight_count ? previous.weight_avg : null}
                  format={(v) => v.toFixed(1)}
                  suffix="kg"
                />
              }
            />
          ) : null}
        </section>
      )}

      {metricRows.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold">이 주에 기록된 지표</h2>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {metricRows.map((row) => {
              const definition = definitionByCode.get(row.metric_code)!;
              const moved = row.sample_count > 1 && row.first_value !== row.last_value;

              return (
                <li key={row.metric_code}>
                  <Link
                    href={`/metrics/${row.metric_code}` as Route}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {definition.display_name}
                      </p>
                      <p className="text-xs text-muted">{row.sample_count}회 기록</p>
                    </div>

                    <div className="tabular shrink-0 text-right">
                      <p className="text-sm font-medium">
                        {formatMetricValue(row.last_value, definition)}
                        <span className="ml-1 text-xs font-normal text-muted">
                          {definition.unit}
                        </span>
                      </p>
                      {moved ? (
                        <p className="text-xs text-muted">
                          {formatMetricValue(row.first_value, definition)} →{" "}
                          {formatMetricValue(row.last_value, definition)}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <p className="mt-8 rounded-xl border border-border bg-surface px-4 py-3 text-xs leading-relaxed text-muted">
        이 요약은 기록한 값을 그대로 모아 보여주는 것입니다. 건강 상태에 대한 판단이나
        진단이 아니며, 수치에 대한 해석은 의료진과 상의해 주세요.
      </p>
    </>
  );
}
