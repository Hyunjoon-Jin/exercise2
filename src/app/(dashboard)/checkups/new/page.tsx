import Link from "next/link";
import { redirect } from "next/navigation";

import { isExtractionConfigured } from "@/lib/checkup/extract";
import { createClient } from "@/lib/supabase/server";

import { UploadForm } from "./upload-form";

export const metadata = { title: "결과지 올리기" };

export default async function NewCheckupPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <>
      <Link href="/checkups" className="text-sm text-muted hover:text-foreground">
        ← 건강검진
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">결과지 올리기</h1>

      {isExtractionConfigured() ? (
        <p className="mt-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          올린 파일은 본인만 볼 수 있는 저장소에 보관되고, 자동 판독을 위해 외부
          모델에 한 번 전달됩니다. 판독 결과는 확인 전까지 기록에 반영되지 않습니다.
        </p>
      ) : (
        <p className="mt-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          자동 판독이 아직 준비되지 않았습니다. 파일은 보관되며, 수치는 기록 화면에서
          직접 입력하시면 됩니다.
        </p>
      )}

      <div className="mt-6">
        <UploadForm />
      </div>
    </>
  );
}
