import Link from "next/link";
import { redirect } from "next/navigation";

import { MetricRecordForm } from "@/components/metric-record-form";
import { MetricStatusBadge } from "@/components/metric-status-badge";
import type { MetricCategory } from "@/lib/db/types";
import { CATEGORY_LABEL, CATEGORY_ORDER, isSelfRecordable } from "@/lib/metrics/constants";
import { getMetricSummaries, type MetricSummary } from "@/lib/metrics/queries";
import { formatMetricValue } from "@/lib/metrics/status";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "기록" };

const RELATIVE = new Intl.RelativeTimeFormat("ko", { numeric: "auto" });

function relativeDays(iso: string): string {
  const days = Math.round((Date.parse(iso) - Date.now()) / 86_400_000);
  if (days === 0) return "오늘";
  return RELATIVE.format(days, "day");
}

function MetricRow({ summary }: { summary: MetricSummary }) {
  const { definition, latest, status } = summary;

  return (
    <li>
      <Link
        href={`/metrics/${definition.code}`}
        className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{definition.display_name}</p>
          {latest ? (
            <p className="text-xs text-muted">{relativeDays(latest.measured_at)}</p>
          ) : (
            <p className="text-xs text-muted">기록 없음</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <MetricStatusBadge status={status} />
          {latest ? (
            <span className="tabular text-sm font-medium">
              {formatMetricValue(latest.value, definition)}
              <span className="ml-1 text-xs font-normal text-muted">
                {definition.unit}
              </span>
            </span>
          ) : (
            <span className="text-sm text-muted">—</span>
          )}
        </div>
      </Link>
    </li>
  );
}

export default async function MetricsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("sex, birth_year")
    .eq("id", user.id)
    .single();

  const summaries = await getMetricSummaries({
    sex: profile?.sex ?? "unspecified",
    birth_year: profile?.birth_year ?? null,
  });

  // 기록이 있는 지표를 위로. 처음 쓰는 사용자에게는 전체가 아래로 내려간다.
  const recorded = summaries.filter((s) => s.latest);
  const byCategory = new Map<MetricCategory, MetricSummary[]>();
  for (const summary of summaries) {
    const list = byCategory.get(summary.definition.category) ?? [];
    list.push(summary);
    byCategory.set(summary.definition.category, list);
  }

  const recordable = summaries
    .map((s) => s.definition)
    .filter((d) => isSelfRecordable(d.code, d.category));

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">기록</h1>
      <p className="mt-2 text-sm text-muted">
        수치를 기록하면 건강검진에서 확인된 값과 같은 그래프에 표시됩니다.
      </p>

      <section className="mt-6 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">빠른 기록</h2>
        <div className="mt-3">
          <MetricRecordForm definitions={recordable} />
        </div>
      </section>

      {recorded.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold">최근 기록한 지표</h2>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {recorded
              .sort(
                (a, b) =>
                  Date.parse(b.latest!.measured_at) - Date.parse(a.latest!.measured_at),
              )
              .slice(0, 8)
              .map((summary) => (
                <MetricRow key={summary.definition.code} summary={summary} />
              ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-semibold">전체 지표</h2>
        <div className="mt-3 space-y-6">
          {CATEGORY_ORDER.filter((category) => byCategory.has(category)).map(
            (category) => (
              <div key={category}>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
                  {CATEGORY_LABEL[category]}
                </h3>
                <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                  {byCategory.get(category)!.map((summary) => (
                    <MetricRow key={summary.definition.code} summary={summary} />
                  ))}
                </ul>
              </div>
            ),
          )}
        </div>
      </section>
    </>
  );
}
