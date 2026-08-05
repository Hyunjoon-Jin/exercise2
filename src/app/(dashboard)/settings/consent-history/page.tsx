import Link from "next/link";
import { redirect } from "next/navigation";

import type { ConsentKind } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "내 동의 이력" };

const KIND_LABEL: Record<ConsentKind, string> = {
  terms_of_service: "서비스 이용약관",
  privacy_policy: "개인정보 처리방침",
  sensitive_health_data: "민감정보(건강정보) 수집·이용",
  llm_processing: "검진 결과지 자동 판독 위탁",
  marketing: "마케팅 정보 수신",
};

const DATETIME = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * 내 동의 이력.
 *
 * user_consents 는 append-only 라(0002 에 UPDATE·DELETE 정책이 없다) 동의와
 * 철회가 덮어쓰이지 않고 그대로 쌓인다. 그 이력을 이용자 본인이 볼 수 없다면
 * 보존하는 의미가 절반이다 — 분쟁 대비용으로만 남는 셈이다.
 */
export default async function ConsentHistoryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // RLS 가 본인 행만 돌려준다. 문서 정보는 조인해서 함께 읽는다.
  const [consentsResult, documentsResult] = await Promise.all([
    supabase
      .from("user_consents")
      .select("id, consent_document_id, granted, granted_at, user_agent")
      .order("granted_at", { ascending: false }),
    supabase.from("consent_documents").select("id, kind, version, title"),
  ]);

  const events = consentsResult.data ?? [];
  const documentById = new Map(
    (documentsResult.data ?? []).map((doc) => [doc.id, doc]),
  );

  return (
    <>
      <Link href="/settings" className="text-sm text-muted hover:text-foreground">
        ← 설정
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">내 동의 이력</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        동의와 철회는 덮어쓰지 않고 이력으로 쌓입니다. 언제 어떤 버전에 동의하셨는지
        그대로 남습니다.
      </p>

      {events.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          기록이 없습니다.
        </p>
      ) : (
        <ol className="mt-6 space-y-2">
          {events.map((event) => {
            const doc = documentById.get(event.consent_document_id);
            return (
              <li key={event.id} className="rounded-xl border border-border px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {doc ? (KIND_LABEL[doc.kind] ?? doc.title) : "삭제된 문서"}
                    </p>
                    <p className="text-xs text-muted">
                      {doc ? `버전 ${doc.version} · ` : ""}
                      {DATETIME.format(new Date(event.granted_at))}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      event.granted
                        ? "bg-status-normal/10 text-status-normal"
                        : "bg-surface text-muted"
                    }`}
                  >
                    {event.granted ? "동의" : "철회"}
                  </span>
                </div>

                {event.user_agent ? (
                  <p className="mt-2 truncate text-xs text-muted" title={event.user_agent}>
                    {event.user_agent}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-8 rounded-xl border border-border bg-surface px-4 py-3 text-xs leading-relaxed text-muted">
        각 버전의 전문은{" "}
        <Link href="/legal/history" className="text-brand-text hover:underline">
          약관 개정 이력
        </Link>
        에서 확인하실 수 있습니다. 계정을 삭제하면 이 이력도 함께 사라집니다.
      </p>
    </>
  );
}
