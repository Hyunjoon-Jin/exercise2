"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ExtractionItemStatus } from "@/lib/db/types";
import { MAX_FILE_BYTES } from "@/lib/checkup/extract";
import { formError, formSaved, readNumber, readString, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** 경로 조작을 막고 Storage 가 받아들이는 문자만 남긴다. */
function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "document";
  const cleaned = base.replace(/[^\w.\-가-힣]/g, "_").slice(-100);
  return cleaned || "document";
}

/**
 * 검진 결과지 업로드.
 *
 * 업로드 시점에는 추출을 돌리지 않는다. 판독은 수십 초가 걸릴 수 있어
 * 업로드 요청 안에서 하면 사용자가 빈 화면을 오래 본다. 검진 상세 화면에서
 * 별도로 시작한다.
 */
export async function uploadCheckup(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();

  const checkupDate = readString(formData, "checkup_date");
  if (!checkupDate) return formError("검진일을 입력해 주세요.");

  if (Date.parse(`${checkupDate}T00:00:00Z`) > Date.now() + 86_400_000) {
    return formError("검진일이 미래로 되어 있습니다.");
  }

  const file = formData.get("document");
  if (!(file instanceof File) || file.size === 0) {
    return formError("결과지 파일을 선택해 주세요.");
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return formError("PDF 또는 이미지(JPG, PNG, WebP) 파일만 올릴 수 있습니다.");
  }

  if (file.size > MAX_FILE_BYTES) {
    return formError("파일이 너무 큽니다. 20MB 이하로 올려 주세요.");
  }

  const { data: checkup, error: checkupError } = await supabase
    .from("checkups")
    .insert({
      user_id: user.id,
      checkup_date: checkupDate,
      institution: readString(formData, "institution") || null,
    })
    .select("id")
    .single();

  if (checkupError || !checkup) {
    return formError("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }

  // 경로 규칙은 Storage 정책과 짝을 이룬다: 첫 세그먼트가 본인 uid.
  const path = `${user.id}/${checkup.id}/${safeFileName(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from("checkup-documents")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    await supabase.from("checkups").delete().eq("id", checkup.id);
    return formError("파일 업로드에 실패했습니다. 다시 시도해 주세요.");
  }

  const { data: document, error: documentError } = await supabase
    .from("checkup_documents")
    .insert({
      checkup_id: checkup.id,
      user_id: user.id,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    })
    .select("id")
    .single();

  if (documentError || !document) {
    await supabase.storage.from("checkup-documents").remove([path]);
    await supabase.from("checkups").delete().eq("id", checkup.id);
    return formError("저장에 실패했습니다. 다시 시도해 주세요.");
  }

  revalidatePath("/checkups");
  redirect(`/checkups/${checkup.id}`);
}

/** 검수 중 항목 하나를 수정하거나 상태를 바꾼다. */
export async function updateExtractionItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();

  const id = readString(formData, "id");
  const checkupId = readString(formData, "checkup_id");
  if (!id) return formError("잘못된 요청입니다.");

  const action = readString(formData, "action");

  if (action === "reject") {
    await supabase
      .from("checkup_extraction_items")
      .update({ status: "rejected" })
      .eq("id", id)
      .eq("user_id", user.id);

    revalidatePath(`/checkups/${checkupId}`);
    return formSaved();
  }

  const metricCode = readString(formData, "metric_code");
  const value = readNumber(formData, "value");

  if (!metricCode) return formError("지표를 선택해 주세요.");
  if (value === null || Number.isNaN(value)) return formError("값을 입력해 주세요.");

  const { data: definition } = await supabase
    .from("metric_definitions")
    .select("unit, min_valid, max_valid, display_name")
    .eq("code", metricCode)
    .maybeSingle();

  if (!definition) return formError("알 수 없는 지표입니다.");

  if (
    (definition.min_valid !== null && value < definition.min_valid) ||
    (definition.max_valid !== null && value > definition.max_valid)
  ) {
    return formError(
      `${definition.display_name} 값이 일반적인 범위를 크게 벗어납니다. 원본을 다시 확인해 주세요.`,
    );
  }

  // 사용자가 손댔는지에 따라 accepted / edited 로 구분한다.
  // 나중에 판독 정확도를 되짚을 때 이 구분이 근거가 된다.
  const status: ExtractionItemStatus =
    readString(formData, "was_edited") === "1" ? "edited" : "accepted";

  const { error } = await supabase
    .from("checkup_extraction_items")
    .update({ metric_code: metricCode, value, unit: definition.unit, status })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return formError("저장에 실패했습니다.");

  revalidatePath(`/checkups/${checkupId}`);
  return formSaved();
}

/** 판독 그대로 전부 승인 — 하나씩 누르는 수고를 던다. 확정은 아직 아니다. */
export async function acceptAllItems(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();

  const extractionId = readString(formData, "extraction_id");
  const checkupId = readString(formData, "checkup_id");
  if (!extractionId) return;

  await supabase
    .from("checkup_extraction_items")
    .update({ status: "accepted" })
    .eq("extraction_id", extractionId)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .not("metric_code", "is", null)
    .not("value", "is", null);

  revalidatePath(`/checkups/${checkupId}`);
}

/**
 * 확정 — 검수한 항목을 지표로 승격한다.
 *
 * 실제 승격은 DB 함수가 한다. 클라이언트가 health_metrics 에 직접 쓰면
 * 검수 단계를 통째로 건너뛸 수 있다.
 */
export async function confirmExtraction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireUser();

  const extractionId = readString(formData, "extraction_id");
  const checkupId = readString(formData, "checkup_id");
  if (!extractionId) return formError("잘못된 요청입니다.");

  const { data, error } = await supabase.rpc("confirm_checkup_extraction", {
    p_extraction_id: extractionId,
  });

  if (error) return formError("확정에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  if (!data) return formError("확정할 항목이 없습니다. 항목을 먼저 승인해 주세요.");

  revalidatePath(`/checkups/${checkupId}`);
  revalidatePath("/checkups");
  revalidatePath("/metrics");
  revalidatePath("/today");
  return formSaved();
}

/** 확정 취소 — 승격된 지표를 모두 되돌린다. */
export async function revertExtraction(formData: FormData): Promise<void> {
  const { supabase } = await requireUser();

  const extractionId = readString(formData, "extraction_id");
  const checkupId = readString(formData, "checkup_id");
  if (!extractionId) return;

  await supabase.rpc("revert_checkup_extraction", { p_extraction_id: extractionId });

  revalidatePath(`/checkups/${checkupId}`);
  revalidatePath("/checkups");
  revalidatePath("/metrics");
}

/**
 * 검진 삭제.
 *
 * 확정해서 기록에 반영한 수치도 함께 사라진다 — checkups_delete_metrics
 * 트리거가 처리한다 (0008). source_ref 가 외래키가 아니라 cascade 로는
 * 닿지 않기 때문에 트리거로 맞춰 둔 것이다.
 */
export async function deleteCheckup(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();

  const id = readString(formData, "id");
  if (!id) return;

  // checkup_documents 삭제 트리거가 Storage 정리 큐에 경로를 남긴다.
  // 여기서 원본 파일도 바로 지운다 — 파기 의무는 미룰수록 위험하다.
  const { data: documents } = await supabase
    .from("checkup_documents")
    .select("storage_path")
    .eq("checkup_id", id);

  if (documents && documents.length > 0) {
    await supabase.storage
      .from("checkup-documents")
      .remove(documents.map((document) => document.storage_path));
  }

  await supabase.from("checkups").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath("/checkups");
  revalidatePath("/metrics");
}
