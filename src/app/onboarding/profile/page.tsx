import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { ProfileForm } from "./profile-form";

export const metadata = { title: "프로필 설정" };

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, birth_year, sex, height_cm")
    .eq("id", user.id)
    .single();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">기본 정보</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        아래 정보는 지표의 정상범위를 판정하는 데만 사용됩니다. 모두 선택 입력이며,
        비워 두시면 성별·연령과 무관한 일반 참고범위가 적용됩니다.
      </p>

      <ProfileForm
        initial={{
          display_name: profile?.display_name ?? "",
          birth_year: profile?.birth_year ?? null,
          sex: profile?.sex ?? "unspecified",
          height_cm: profile?.height_cm ?? null,
        }}
      />
    </>
  );
}
