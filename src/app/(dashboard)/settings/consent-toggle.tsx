"use client";

import { useActionState } from "react";

import { EMPTY_FORM_STATE } from "@/lib/forms";

import { updateOptionalConsent } from "./actions";

/**
 * 선택 동의 켜고 끄기.
 *
 * 철회해도 기존 동의 기록은 남는다 (append-only). 그 사실을 화면에서도
 * 밝혀 둔다 — "지웠는데 왜 남아 있냐"는 오해를 미리 막는다.
 */
export function ConsentToggle({
  documentId,
  granted,
  label,
}: {
  documentId: string;
  granted: boolean;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateOptionalConsent,
    EMPTY_FORM_STATE,
  );

  return (
    <form action={formAction} className="shrink-0">
      <input type="hidden" name="document_id" value={documentId} />
      <input type="hidden" name="grant" value={granted ? "0" : "1"} />

      <button
        type="submit"
        disabled={pending}
        aria-label={`${label} ${granted ? "철회" : "동의"}`}
        className="rounded-lg border border-border-strong px-3 py-1.5 text-xs
                   transition-colors hover:bg-surface disabled:opacity-60"
      >
        {pending ? "처리 중…" : granted ? "철회" : "동의"}
      </button>

      {state.error ? (
        <p role="alert" className="mt-1 max-w-48 text-xs text-status-out">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
