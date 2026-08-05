"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { BiologicalSex } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

export interface OnboardingFormState {
  error?: string;
}

/**
 * 동의 저장.
 *
 * 필수 항목이 하나라도 빠지면 저장하지 않는다. 클라이언트에서도 막지만,
 * 서버 액션은 직접 호출될 수 있으므로 여기서 다시 확인해야 한다.
 */
export async function submitConsents(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: documents, error: loadError } = await supabase.rpc(
    "current_consent_documents",
  );

  if (loadError || !documents) {
    return { error: "동의 문서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  const grantedIds = new Set(formData.getAll("consent").map(String));

  const missingRequired = documents.filter(
    (doc) => doc.is_required && !grantedIds.has(doc.id),
  );

  if (missingRequired.length > 0) {
    return { error: "필수 항목에 모두 동의해야 서비스를 이용할 수 있습니다." };
  }

  // 선택 항목은 동의하지 않았다는 사실도 기록해 둔다 (granted=false).
  // 나중에 "동의한 적 없음"과 "명시적으로 거부"를 구분해야 할 수 있다.
  const userAgent = (await headers()).get("user-agent");

  const rows = documents.map((doc) => ({
    user_id: user.id,
    consent_document_id: doc.id,
    granted: grantedIds.has(doc.id),
    user_agent: userAgent,
  }));

  const { error: insertError } = await supabase.from("user_consents").insert(rows);

  if (insertError) {
    return { error: "동의 저장에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  redirect("/onboarding/profile");
}

const VALID_SEX: BiologicalSex[] = ["male", "female", "unspecified"];

/**
 * 프로필 저장.
 *
 * 출생연도·성별·키는 정상범위 판정에만 쓰인다. 모두 선택 입력이며,
 * 비워 두면 해당 조건이 붙은 참고범위는 적용되지 않는다.
 */
export async function saveProfile(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const displayName = String(formData.get("display_name") ?? "").trim();
  const rawBirthYear = String(formData.get("birth_year") ?? "").trim();
  const rawHeight = String(formData.get("height_cm") ?? "").trim();
  const rawSex = String(formData.get("sex") ?? "unspecified");

  const sex = (VALID_SEX as string[]).includes(rawSex)
    ? (rawSex as BiologicalSex)
    : "unspecified";

  let birthYear: number | null = null;
  if (rawBirthYear) {
    const parsed = Number(rawBirthYear);
    const thisYear = new Date().getFullYear();
    if (!Number.isInteger(parsed) || parsed < 1900 || parsed > thisYear) {
      return { error: "출생연도를 다시 확인해 주세요." };
    }
    birthYear = parsed;
  }

  let heightCm: number | null = null;
  if (rawHeight) {
    const parsed = Number(rawHeight);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 300) {
      return { error: "키를 다시 확인해 주세요." };
    }
    heightCm = parsed;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName || null,
      birth_year: birthYear,
      height_cm: heightCm,
      sex,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return { error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  redirect("/today");
}
