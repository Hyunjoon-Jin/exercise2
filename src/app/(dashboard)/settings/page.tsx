import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/server";

import { ConsentToggle } from "./consent-toggle";
import { DeleteAccount } from "./delete-account";

export const metadata = { title: "설정" };

const CONSENT_KIND_LABEL: Record<string, string> = {
  terms_of_service: "서비스 이용약관",
  privacy_policy: "개인정보 처리방침",
  sensitive_health_data: "민감정보(건강정보) 수집·이용",
  llm_processing: "검진 결과지 자동 판독 처리 위탁",
  marketing: "마케팅 정보 수신",
};

/** 동의 종류마다 대응하는 공개 문서. 없으면 링크를 걸지 않는다. */
const CONSENT_DOC_PATH: Record<string, string> = {
  terms_of_service: "/legal/terms",
  privacy_policy: "/legal/privacy",
  sensitive_health_data: "/legal/privacy",
  llm_processing: "/legal/privacy",
};

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: consents } = await supabase.rpc("current_consent_documents");
  const documents = consents ?? [];

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">설정</h1>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">계정</h2>
        <dl className="mt-3 rounded-xl border border-border">
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="text-sm text-muted">이메일</dt>
            <dd className="text-sm">{user.email}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">동의 현황</h2>
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
          {documents.map((doc) => {
            const path = CONSENT_DOC_PATH[doc.kind];
            const label = CONSENT_KIND_LABEL[doc.kind] ?? doc.title;

            return (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  {path ? (
                    <Link
                      href={path}
                      className="truncate text-sm text-brand-text hover:underline"
                    >
                      {label}
                    </Link>
                  ) : (
                    <p className="truncate text-sm">{label}</p>
                  )}
                  <p className="text-xs text-muted">
                    {doc.is_required ? "필수" : "선택"} · 버전 {doc.version} ·{" "}
                    <span className={doc.granted ? "text-status-normal" : undefined}>
                      {doc.granted ? "동의함" : "동의 안 함"}
                    </span>
                  </p>
                </div>

                {doc.is_required ? (
                  <span className="shrink-0 text-xs text-muted">변경 불가</span>
                ) : (
                  <ConsentToggle
                    documentId={doc.id}
                    granted={doc.granted}
                    label={label}
                  />
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          동의와 철회는 덮어쓰지 않고 이력으로 쌓입니다. 언제 동의했고 언제 철회했는지가
          남아야 나중에 확인할 수 있기 때문입니다. 계정을 삭제하면 이 이력도 함께
          사라집니다.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">약관</h2>
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
          {[
            { href: "/legal/terms", label: "서비스 이용약관" },
            { href: "/legal/privacy", label: "개인정보 처리방침" },
          ].map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-surface"
              >
                {item.label}
                <span aria-hidden className="text-muted">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">내 데이터</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          기록한 모든 데이터를 파일 하나로 내려받을 수 있습니다. 검진 결과지 원본
          파일은 각 검진 화면에서 따로 받으실 수 있습니다.
        </p>
        <a
          href="/api/export"
          download
          className="mt-3 inline-flex min-h-11 items-center rounded-lg border
                     border-border-strong px-4 text-sm font-medium
                     transition-colors hover:bg-surface"
        >
          내 데이터 내려받기
        </a>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">세션</h2>
        <form action={signOut} className="mt-3">
          <button
            type="submit"
            className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-sm font-medium
                       transition-colors hover:bg-surface"
          >
            로그아웃
          </button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-status-out">계정 삭제</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          계정과 모든 건강 기록, 업로드한 결과지 원본이 즉시 삭제됩니다. 복구할 수
          없습니다.
        </p>
        <div className="mt-3">
          <DeleteAccount />
        </div>
      </section>

      <p className="mt-10 text-xs leading-relaxed text-muted">
        본 서비스는 의료기기가 아니며 의학적 진단·치료·처방을 제공하지 않습니다.
        표시되는 수치와 참고범위는 참고용이며, 건강상 판단이 필요한 경우 반드시
        의료진과 상담하시기 바랍니다.
      </p>
    </>
  );
}
