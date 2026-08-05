import "server-only";

import type { ConsentKind } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

export interface LegalDocument {
  kind: ConsentKind;
  version: string;
  title: string;
  body: string;
  effective_from: string;
}

/**
 * 공개 약관 문서를 읽는다.
 *
 * 동의 문서와 약관 페이지가 같은 원본을 봐야 한다. 페이지에 문구를 따로
 * 적어두면 동의받은 내용과 공개된 내용이 갈라지고, 그 상태에서 받은 동의는
 * 근거가 되지 못한다.
 *
 * 로그인 없이도 읽혀야 하므로 anon 에 select 정책이 열려 있다 (0002).
 */
export async function getLegalDocument(kind: ConsentKind): Promise<LegalDocument | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("consent_documents")
    .select("kind, version, title, body, effective_from")
    .eq("kind", kind)
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}
