import Link from "next/link";
import { redirect } from "next/navigation";

import type { ExtractionStatus } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "건강검진" };

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const STATUS_LABEL: Record<ExtractionStatus, string> = {
  pending: "판독 대기",
  running: "판독 중",
  review: "검수 필요",
  confirmed: "기록 반영됨",
  failed: "판독 실패",
};

const STATUS_CLASS: Record<ExtractionStatus, string> = {
  pending: "bg-surface text-muted",
  running: "bg-surface text-muted",
  review: "bg-status-caution/10 text-status-caution",
  confirmed: "bg-status-normal/10 text-status-normal",
  failed: "bg-status-out/10 text-status-out",
};

export default async function CheckupsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data } = await supabase.rpc("checkup_summaries");
  const checkups = data ?? [];

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">건강검진</h1>
          <p className="mt-2 text-sm text-muted">
            결과지를 올리면 검사 항목과 수치를 읽어냅니다.
          </p>
        </div>
        <Link
          href="/checkups/new"
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white
                     transition-colors hover:bg-brand-700"
        >
          올리기
        </Link>
      </div>

      <p className="mt-4 rounded-xl border border-border bg-surface px-4 py-3 text-xs text-muted">
        읽어낸 값은 자동으로 저장되지 않습니다. 원본과 나란히 확인하고 확정한 항목만
        기록에 반영됩니다.
      </p>

      {checkups.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          아직 올린 결과지가 없습니다.
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-border rounded-xl border border-border">
          {checkups.map((checkup) => (
            <li key={checkup.checkup_id}>
              <Link
                href={`/checkups/${checkup.checkup_id}`}
                className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-surface"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {DATE_FMT.format(new Date(`${checkup.checkup_date}T00:00:00`))}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {checkup.institution ?? "기관 미입력"}
                    {checkup.status === "confirmed" && checkup.confirmed_count > 0
                      ? ` · ${checkup.confirmed_count}개 항목 반영`
                      : checkup.item_count > 0
                        ? ` · ${checkup.item_count}개 항목`
                        : ""}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    checkup.status
                      ? STATUS_CLASS[checkup.status]
                      : "bg-surface text-muted"
                  }`}
                >
                  {checkup.status ? STATUS_LABEL[checkup.status] : "판독 전"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
