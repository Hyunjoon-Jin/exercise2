import { redirect } from "next/navigation";

import { DeleteRecordButton } from "@/components/delete-record-button";
import { createClient } from "@/lib/supabase/server";

import { deleteSleep } from "./actions";
import { SleepForm } from "./sleep-form";

export const metadata = { title: "수면" };

const QUALITY_LABEL: Record<number, string> = {
  1: "매우 나쁨",
  2: "나쁨",
  3: "보통",
  4: "좋음",
  5: "매우 좋음",
};

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "short",
});

const TIME_FMT = new Intl.DateTimeFormat("ko-KR", {
  hour: "numeric",
  minute: "2-digit",
});

function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

export default async function SleepPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: records } = await supabase
    .from("sleep_records")
    .select("*")
    .order("sleep_date", { ascending: false })
    .limit(30);

  const rows = records ?? [];

  // 최근 7건 평균. 기록이 드문드문해도 "최근 흐름"을 보여주는 게 목적이라
  // 날짜 기준이 아니라 건수 기준으로 잡는다.
  const recent = rows.filter((r) => r.duration_min !== null).slice(0, 7);
  const avgMinutes =
    recent.length > 0
      ? Math.round(recent.reduce((sum, r) => sum + (r.duration_min ?? 0), 0) / recent.length)
      : null;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">수면</h1>
      <p className="mt-2 text-sm text-muted">
        수면 시간은 다른 지표와 같은 시간축에 기록되어 함께 비교할 수 있습니다.
      </p>

      {avgMinutes !== null ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">최근 {recent.length}일 평균</h2>
          <p className="tabular mt-1 text-2xl font-semibold">
            {formatDuration(avgMinutes)}
          </p>
          <p className="mt-1 text-xs text-muted">성인 권장 수면 시간은 7~9시간입니다.</p>
        </section>
      ) : null}

      <section className="mt-6 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">수면 기록</h2>
        <div className="mt-3">
          <SleepForm />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">기록 내역</h2>
        {rows.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            아직 기록이 없습니다.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {rows.map((record) => (
              <li
                key={record.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {DATE_FMT.format(new Date(`${record.sleep_date}T00:00:00`))}
                    {record.duration_min !== null ? (
                      <span className="tabular ml-2 font-normal">
                        {formatDuration(record.duration_min)}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">
                    {record.bed_time && record.wake_time ? (
                      <>
                        {TIME_FMT.format(new Date(record.bed_time))} –{" "}
                        {TIME_FMT.format(new Date(record.wake_time))}
                      </>
                    ) : null}
                    {record.quality ? (
                      <span className="ml-2">{QUALITY_LABEL[record.quality]}</span>
                    ) : null}
                  </p>
                </div>

                <DeleteRecordButton
                  action={deleteSleep}
                  fields={{ id: record.id }}
                  what={`${record.sleep_date} 수면 기록`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
