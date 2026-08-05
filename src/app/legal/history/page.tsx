import Link from "next/link";

import type { ConsentKind } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "약관 개정 이력" };

const KIND_LABEL: Record<ConsentKind, string> = {
  terms_of_service: "서비스 이용약관",
  privacy_policy: "개인정보 처리방침",
  sensitive_health_data: "민감정보(건강정보) 수집·이용 동의",
  llm_processing: "검진 결과지 자동 판독 위탁·국외이전 동의",
  marketing: "마케팅 정보 수신 동의",
};

const KIND_ORDER: ConsentKind[] = [
  "terms_of_service",
  "privacy_policy",
  "sensitive_health_data",
  "llm_processing",
  "marketing",
];

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

/**
 * 약관 개정 이력.
 *
 * 지난 버전을 지우지 않는 이유는 두 가지다. 이용자가 자기가 무엇에 동의했는지
 * 나중에 확인할 수 있어야 하고, 분쟁이 생겼을 때 그 시점의 문안이 남아 있어야
 * 한다. 그래서 문서는 덮어쓰지 않고 새 버전을 쌓고, 옛 버전은 폐기 표시만 한다.
 *
 * 로그인 없이 볼 수 있다 — 가입 전에도 이 서비스가 문안을 어떻게 바꿔 왔는지
 * 확인할 수 있어야 한다.
 */
export default async function LegalHistoryPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("consent_documents")
    .select("id, kind, version, title, body, is_required, effective_from, retired_at")
    .order("effective_from", { ascending: false });

  const documents = data ?? [];

  const byKind = new Map<ConsentKind, typeof documents>();
  for (const doc of documents) {
    const list = byKind.get(doc.kind) ?? [];
    list.push(doc);
    byKind.set(doc.kind, list);
  }

  return (
    <article>
      <h1 className="text-2xl font-semibold tracking-tight">약관 개정 이력</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        지난 버전을 지우지 않고 그대로 보관합니다. 언제 무엇이 어떻게 바뀌었는지,
        그리고 본인이 동의한 시점의 문안이 무엇이었는지 확인하실 수 있습니다.
      </p>

      {documents.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          아직 발행된 문서가 없습니다.
        </p>
      ) : (
        <div className="mt-10 space-y-12">
          {KIND_ORDER.filter((kind) => byKind.has(kind)).map((kind) => (
            <section key={kind}>
              <h2 className="text-lg font-semibold tracking-tight">
                {KIND_LABEL[kind]}
              </h2>

              <ol className="mt-4 space-y-3">
                {byKind.get(kind)!.map((doc) => {
                  const active = doc.retired_at === null;
                  return (
                    <li
                      key={doc.id}
                      className={`rounded-xl border px-4 py-3 ${
                        active ? "border-border" : "border-border opacity-70"
                      }`}
                    >
                      <details>
                        <summary className="flex cursor-pointer items-center justify-between gap-3">
                          <span className="min-w-0">
                            <span className="text-sm font-medium">
                              버전 {doc.version}
                            </span>
                            <span className="ml-2 text-xs text-muted">
                              {DATE_FMT.format(new Date(doc.effective_from))} 시행
                              {doc.retired_at
                                ? ` · ${DATE_FMT.format(new Date(doc.retired_at))} 폐기`
                                : ""}
                            </span>
                          </span>

                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                              active
                                ? "bg-status-normal/10 text-status-normal"
                                : "bg-surface text-muted"
                            }`}
                          >
                            {active ? "현재 적용" : "지난 버전"}
                          </span>
                        </summary>

                        {/* 본문은 평문으로 렌더한다. HTML 을 허용하면 문서
                            편집이 곧 XSS 통로가 된다. */}
                        <div className="mt-3 border-t border-border pt-3">
                          <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
                            {doc.body}
                          </p>
                          <p className="mt-3 text-xs text-muted">
                            {doc.is_required ? "필수 동의" : "선택 동의"} 항목
                          </p>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      <p className="mt-12 border-t border-border pt-6 text-sm text-muted">
        본인이 언제 무엇에 동의하셨는지는{" "}
        <Link href="/settings" className="text-brand-text hover:underline">
          설정 → 동의 현황
        </Link>
        에서 확인하실 수 있습니다.
      </p>
    </article>
  );
}
