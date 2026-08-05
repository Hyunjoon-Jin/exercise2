"use client";

import { useActionState, useMemo, useState } from "react";

import type { ConsentKind } from "@/lib/db/types";

import { submitConsents, type OnboardingFormState } from "../actions";

interface ConsentDocumentView {
  id: string;
  kind: ConsentKind;
  version: string;
  title: string;
  body: string;
  is_required: boolean;
  granted: boolean;
}

const INITIAL: OnboardingFormState = {};

export function ConsentForm({ documents }: { documents: ConsentDocumentView[] }) {
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(documents.filter((d) => d.granted).map((d) => d.id)),
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(submitConsents, INITIAL);

  const requiredIds = useMemo(
    () => documents.filter((d) => d.is_required).map((d) => d.id),
    [documents],
  );

  const allRequiredChecked = requiredIds.every((id) => checked.has(id));
  const allChecked = documents.length > 0 && documents.every((d) => checked.has(d.id));

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(documents.map((d) => d.id)));
  }

  return (
    <form action={formAction} className="mt-8">
      {[...checked].map((id) => (
        <input key={id} type="hidden" name="consent" value={id} />
      ))}

      <label
        className="flex cursor-pointer items-center gap-3 rounded-xl border border-border
                   bg-surface px-4 py-3.5"
      >
        <input
          type="checkbox"
          checked={allChecked}
          onChange={toggleAll}
          className="size-4 accent-brand-600"
        />
        <span className="font-medium">전체 동의</span>
      </label>

      <ul className="mt-3 space-y-2">
        {documents.map((doc) => {
          const isOpen = expanded === doc.id;
          return (
            <li key={doc.id} className="rounded-xl border border-border">
              <div className="flex items-start gap-3 px-4 py-3.5">
                <input
                  id={`consent-${doc.id}`}
                  type="checkbox"
                  checked={checked.has(doc.id)}
                  onChange={() => toggle(doc.id)}
                  className="mt-0.5 size-4 shrink-0 accent-brand-600"
                />
                <label htmlFor={`consent-${doc.id}`} className="flex-1 cursor-pointer">
                  <span className="text-sm font-medium">{doc.title}</span>
                  <span
                    className={`ml-2 text-xs ${
                      doc.is_required ? "text-status-out" : "text-muted"
                    }`}
                  >
                    {doc.is_required ? "필수" : "선택"}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : doc.id)}
                  aria-expanded={isOpen}
                  className="shrink-0 text-xs text-muted underline underline-offset-2"
                >
                  {isOpen ? "접기" : "전문 보기"}
                </button>
              </div>

              {isOpen ? (
                <div className="border-t border-border px-4 py-3">
                  <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-muted">
                    {doc.body}
                  </pre>
                  <p className="mt-3 text-[11px] text-muted">버전 {doc.version}</p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {state.error ? (
        <p role="alert" className="mt-4 text-sm text-status-out">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!allRequiredChecked || pending}
        className="mt-6 w-full rounded-lg bg-brand-600 px-4 py-3 font-medium text-white
                   transition-colors hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "저장 중…" : "동의하고 계속하기"}
      </button>

      {!allRequiredChecked ? (
        <p className="mt-2 text-center text-xs text-muted">
          필수 항목에 모두 동의해야 계속할 수 있습니다.
        </p>
      ) : null}
    </form>
  );
}
