import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MetricChart, type ChartPoint } from "@/components/metric-chart";
import { MetricRecordForm } from "@/components/metric-record-form";
import { MetricStatusBadge } from "@/components/metric-status-badge";
import { isSelfRecordable } from "@/lib/metrics/constants";
import { getMetricDetail } from "@/lib/metrics/queries";
import {
  evaluateMetric,
  formatMetricValue,
  formatReferenceRange,
} from "@/lib/metrics/status";
import { DeleteRecordButton } from "@/components/delete-record-button";
import { createClient } from "@/lib/supabase/server";

import { deleteMetric } from "../actions";

const SOURCE_LABEL: Record<string, string> = {
  self: "직접 입력",
  checkup: "건강검진",
  device: "기기 연동",
  derived: "자동 계산",
};

const DATETIME = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default async function MetricDetailPage({
  params,
}: PageProps<"/metrics/[code]">) {
  const { code } = await params;

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

  const detail = await getMetricDetail(code, {
    sex: profile?.sex ?? "unspecified",
    birth_year: profile?.birth_year ?? null,
  });

  if (!detail) notFound();

  const { definition, range, records } = detail;
  const latest = records[0] ?? null;
  const status = latest ? evaluateMetric(latest.value, range) : "unknown";
  const rangeText = formatReferenceRange(range, definition);

  // 그래프는 시간 오름차순이어야 한다. 목록은 최신순이므로 뒤집어 쓴다.
  const points: ChartPoint[] = records
    .map((r) => ({ t: Date.parse(r.measured_at), value: r.value, source: r.source }))
    .sort((a, b) => a.t - b.t);

  const recordable = isSelfRecordable(definition.code, definition.category);

  return (
    <>
      <Link href="/metrics" className="text-sm text-muted hover:text-foreground">
        ← 기록
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {definition.display_name}
          </h1>
          {definition.description ? (
            <p className="mt-1 text-sm text-muted">{definition.description}</p>
          ) : null}
        </div>
        <MetricStatusBadge status={status} size="md" />
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        {latest ? (
          <>
            <span className="tabular text-3xl font-semibold">
              {formatMetricValue(latest.value, definition)}
            </span>
            <span className="text-sm text-muted">{definition.unit}</span>
          </>
        ) : (
          <span className="text-sm text-muted">아직 기록이 없습니다.</span>
        )}
      </div>

      {rangeText ? (
        <p className="mt-1 text-sm text-muted">
          참고범위 {rangeText} {definition.unit}
          {range?.source ? (
            <span className="ml-1 text-xs">· {range.source}</span>
          ) : null}
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted">이 지표는 참고범위가 설정되어 있지 않습니다.</p>
      )}

      {points.length >= 2 ? (
        <section className="mt-6 rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold">추세</h2>
          <p className="mb-2 text-xs text-muted">최근 180일</p>
          <MetricChart
            points={points}
            unit={definition.unit}
            decimalPlaces={definition.decimal_places}
            range={range}
          />
        </section>
      ) : null}

      {recordable ? (
        <section className="mt-6 rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold">기록 추가</h2>
          <div className="mt-3">
            <MetricRecordForm definitions={[definition]} fixedCode={definition.code} />
          </div>
        </section>
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted">
          이 지표는 다른 기록에서 자동으로 계산됩니다. 직접 입력할 수 없습니다.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold">기록 내역</h2>
        {records.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            기록이 없습니다.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {records.map((record) => (
              <li key={record.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="tabular text-sm font-medium">
                    {formatMetricValue(record.value, definition)}
                    <span className="ml-1 text-xs font-normal text-muted">
                      {record.unit}
                    </span>
                  </p>
                  <p className="text-xs text-muted">
                    {DATETIME.format(new Date(record.measured_at))}
                    <span className="ml-2">
                      {SOURCE_LABEL[record.source] ?? record.source}
                    </span>
                  </p>
                </div>

                {record.source === "self" ? (
                  <DeleteRecordButton
                    action={deleteMetric}
                    fields={{ id: record.id, metric_code: definition.code }}
                    what={`${DATETIME.format(new Date(record.measured_at))} ${
                      definition.display_name
                    } ${formatMetricValue(record.value, definition)}${definition.unit}`}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
