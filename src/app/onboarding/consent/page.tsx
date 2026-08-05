import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { ConsentForm } from "./consent-form";

export const metadata = { title: "약관 동의" };

export default async function ConsentPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: documents, error } = await supabase.rpc("current_consent_documents");

  if (error || !documents) {
    return (
      <div className="rounded-xl border border-border p-6">
        <h1 className="text-lg font-semibold">약관을 불러오지 못했습니다</h1>
        <p className="mt-2 text-sm text-muted">
          잠시 후 페이지를 새로고침해 주세요.
        </p>
      </div>
    );
  }

  // 필수 항목을 위로, 그 안에서는 발행 순서대로.
  const sorted = [...documents].sort((a, b) => {
    if (a.is_required !== b.is_required) return a.is_required ? -1 : 1;
    return a.kind.localeCompare(b.kind);
  });

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">약관 동의</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        건강 정보는 개인정보보호법상 민감정보로 분류됩니다. 어떤 정보를 어떤 목적으로
        다루는지 확인하신 뒤 동의해 주세요.
      </p>

      <ConsentForm documents={sorted} />
    </>
  );
}
