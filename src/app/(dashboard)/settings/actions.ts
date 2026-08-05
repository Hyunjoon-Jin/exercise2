"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formError, formSaved, readString, type FormState } from "@/lib/forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { DELETE_CONFIRMATION } from "./constants";

/**
 * 선택 동의 변경.
 *
 * user_consents 는 append-only 다 (0002 에 UPDATE·DELETE 정책이 없다).
 * 철회는 기존 행을 고치는 게 아니라 granted=false 행을 새로 쌓는 것이고,
 * 그래서 "언제 동의했다가 언제 철회했는지"가 그대로 남는다. 동의 이력은
 * 분쟁이 생겼을 때 유일한 근거라 덮어쓰면 안 된다.
 *
 * 필수 항목은 여기서 바꿀 수 없다. 필수 동의를 철회하는 것은 서비스를
 * 쓰지 않겠다는 뜻이므로 탈퇴로 처리한다.
 */
export async function updateOptionalConsent(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const documentId = readString(formData, "document_id");
  const grant = readString(formData, "grant") === "1";
  if (!documentId) return formError("잘못된 요청입니다.");

  const { data: documents } = await supabase.rpc("current_consent_documents");
  const target = (documents ?? []).find((doc) => doc.id === documentId);

  if (!target) return formError("동의 문서를 찾지 못했습니다.");

  if (target.is_required) {
    return formError(
      "필수 항목은 여기서 철회할 수 없습니다. 서비스 이용을 그만두시려면 계정 삭제를 이용해 주세요.",
    );
  }

  const userAgent = (await headers()).get("user-agent");

  const { error } = await supabase.from("user_consents").insert({
    user_id: user.id,
    consent_document_id: documentId,
    granted: grant,
    user_agent: userAgent,
  });

  if (error) return formError("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");

  revalidatePath("/settings");
  return formSaved();
}

/**
 * 계정 삭제 — 되돌릴 수 없다.
 *
 * 순서가 중요하다:
 *   1. Storage 원본 파일 경로를 먼저 읽는다 (행이 지워지면 경로를 잃는다)
 *   2. auth.users 행을 지운다 → public 테이블 전체가 cascade 로 사라진다
 *   3. Storage 객체를 지운다
 *
 * 2 와 3 사이에서 실패하면 파일이 남는다. 그래서 checkup_documents 삭제
 * 트리거가 storage_cleanup_queue 에 경로를 남겨 두고(0008), 정리 배치가
 * 뒤늦게라도 지운다. 반대 순서로 하면 — 파일을 먼저 지우고 계정 삭제가
 * 실패하면 — 사용자는 계정이 살아 있는데 결과지만 사라진 상태가 된다.
 *
 * service_role 을 쓰는 이유: auth.users 는 사용자 세션으로 지울 수 없다.
 * 세션을 먼저 검증하므로 남의 계정을 지울 수는 없다.
 */
export async function deleteAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (readString(formData, "confirmation") !== DELETE_CONFIRMATION) {
    return formError(`확인 문구를 정확히 입력해 주세요: "${DELETE_CONFIRMATION}"`);
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return formError(
      "계정 삭제가 아직 설정되지 않았습니다. 고객센터로 문의해 주시면 처리해 드립니다.",
    );
  }

  // 1. 파일 경로 확보 — RLS 를 우회하지 않는 클라이언트로 본인 것만 읽는다.
  const { data: documents } = await supabase
    .from("checkup_documents")
    .select("storage_path");

  const paths = (documents ?? []).map((document) => document.storage_path);

  // 2. 계정 삭제. public 스키마의 모든 테이블이 on delete cascade 로 묶여 있다.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

  if (deleteError) {
    return formError("계정 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }

  // 3. 원본 파일 파기. 실패해도 정리 큐에 경로가 남아 있다.
  if (paths.length > 0) {
    await admin.storage.from("checkup-documents").remove(paths);
  }

  // 세션 쿠키를 지운다. 계정은 이미 없지만 쿠키가 남으면 다음 요청이
  // 알 수 없는 사용자로 들어와 어색한 오류를 낸다.
  await supabase.auth.signOut();

  redirect("/?deleted=1");
}
