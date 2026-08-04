import { redirect } from "next/navigation";

import { signOut } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "설정" };

const CONSENT_KIND_LABEL: Record<string, string> = {
  terms_of_service: "서비스 이용약관",
  privacy_policy: "개인정보 처리방침",
  sensitive_health_data: "민감정보(건강정보) 수집·이용",
  llm_processing: "검진 결과지 자동 판독 처리 위탁",
  marketing: "마케팅 정보 수신",
};

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: consents } = await supabase.rpc("current_consent_documents");

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
          {(consents ?? []).map((doc) => (
            <li key={doc.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm">
                  {CONSENT_KIND_LABEL[doc.kind] ?? doc.title}
                </p>
                <p className="text-xs text-muted">
                  {doc.is_required ? "필수" : "선택"} · 버전 {doc.version}
                </p>
              </div>
              <span
                className={`shrink-0 text-xs font-medium ${
                  doc.granted ? "text-status-normal" : "text-muted"
                }`}
              >
                {doc.granted ? "동의함" : "동의 안 함"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          선택 항목의 동의 변경과 회원 탈퇴는 Phase 5 에서 제공됩니다.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">세션</h2>
        <form action={signOut} className="mt-3">
          <button
            type="submit"
            className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium
                       transition-colors hover:bg-surface"
          >
            로그아웃
          </button>
        </form>
      </section>

      <p className="mt-10 text-xs leading-relaxed text-muted">
        본 서비스는 의료기기가 아니며 의학적 진단·치료·처방을 제공하지 않습니다.
        표시되는 수치와 참고범위는 참고용이며, 건강상 판단이 필요한 경우 반드시
        의료진과 상담하시기 바랍니다.
      </p>
    </>
  );
}
