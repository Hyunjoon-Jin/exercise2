import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "오늘" };

const PHASE_STATUS = [
  { phase: "Phase 0", title: "기반", detail: "인증 · 동의 · 스키마 · RLS · 앱 셸", done: true },
  { phase: "Phase 1", title: "기록 코어", detail: "신체기록 · 수면 · 복약", done: false },
  { phase: "Phase 2", title: "식단 · 운동", detail: "음식 DB 연동 · 운동 기록", done: false },
  { phase: "Phase 3", title: "검진 자동판독", detail: "업로드 → 추출 → 검수 → 반영", done: false },
  { phase: "Phase 4", title: "대시보드 · 리포트", detail: "통합 그래프 · 주간 리포트", done: false },
];

export default async function TodayPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  // 지표 마스터가 제대로 적재됐는지 확인한다. Phase 1 이 여기에 의존한다.
  const { count: metricCount } = await supabase
    .from("metric_definitions")
    .select("code", { count: "exact", head: true });

  const name = profile?.display_name ?? "반갑습니다";
  const today = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());

  return (
    <>
      <p className="text-sm text-muted">{today}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{name}님</h1>

      <section className="mt-8 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">셋업이 완료됐습니다</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          계정과 동의 절차, 데이터베이스 기반이 준비됐습니다. 지표 마스터에{" "}
          <strong className="tabular font-medium text-foreground">
            {metricCount ?? 0}
          </strong>
          개 항목이 등록되어 있으며, 다음 단계부터 실제 기록 기능이 들어갑니다.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">진행 상황</h2>
        <ol className="mt-3 space-y-2">
          {PHASE_STATUS.map((item) => (
            <li
              key={item.phase}
              className="flex items-start gap-3 rounded-xl border border-border px-4 py-3"
            >
              <span
                aria-hidden
                className={`mt-1 size-2 shrink-0 rounded-full ${
                  item.done ? "bg-status-normal" : "bg-border"
                }`}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {item.phase} · {item.title}
                  <span className="sr-only">{item.done ? " (완료)" : " (예정)"}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
