"use client";

import { useActionState, useState } from "react";

import type { CheckupExtractionItem, MetricDefinition } from "@/lib/db/types";
import { EMPTY_FORM_STATE } from "@/lib/forms";

import { updateExtractionItem } from "../actions";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "확인 필요", className: "bg-status-caution/10 text-status-caution" },
  accepted: { label: "확인함", className: "bg-status-normal/10 text-status-normal" },
  edited: { label: "수정함", className: "bg-status-normal/10 text-status-normal" },
  rejected: { label: "제외함", className: "bg-surface text-muted" },
};

/** confidence 를 백분율 문구로. 숫자를 그대로 보이면 정밀해 보이는 착시가 생긴다. */
function confidenceNote(confidence: number | null): string | null {
  if (confidence === null) return null;
  if (confidence >= 0.85) return null;
  if (confidence >= 0.6) return "값이 또렷하지 않습니다";
  return "잘 읽히지 않았습니다";
}

export function ItemRow({
  item,
  checkupId,
  definitions,
  locked,
}: {
  item: CheckupExtractionItem;
  checkupId: string;
  definitions: Pick<MetricDefinition, "code" | "display_name" | "unit">[];
  /** 확정 후에는 수정할 수 없다. 되돌린 뒤에 고친다. */
  locked: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateExtractionItem,
    EMPTY_FORM_STATE,
  );
  const [code, setCode] = useState(item.metric_code ?? "");
  const [value, setValue] = useState(item.value === null ? "" : String(item.value));

  const definition = definitions.find((d) => d.code === code);
  const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.pending;
  const note = confidenceNote(item.confidence);

  // 사용자가 손댔는지를 원본과 비교해 판단한다. 서버가 accepted / edited 를
  // 나눠 저장하고, 나중에 판독 정확도를 되짚을 때 그 구분이 근거가 된다.
  const wasEdited =
    code !== (item.metric_code ?? "") ||
    value !== (item.value === null ? "" : String(item.value));

  return (
    <li
      className={`rounded-xl border px-4 py-3 ${
        item.status === "rejected"
          ? "border-border opacity-60"
          : item.status === "pending"
            ? "border-status-caution/40"
            : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* 원본은 절대 바뀌지 않는다 — 대조의 기준점 */}
          <p className="text-sm font-medium">{item.raw_label}</p>
          <p className="tabular text-xs text-muted">
            결과지 표기: {item.raw_value ?? "—"}
            {item.raw_unit ? ` ${item.raw_unit}` : ""}
            {item.reference_range ? ` · 참고치 ${item.reference_range}` : ""}
            {item.page_number ? ` · ${item.page_number}쪽` : ""}
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      {note ? (
        <p className="mt-2 text-xs text-status-caution">{note}. 원본을 확인해 주세요.</p>
      ) : null}

      {locked ? (
        <p className="tabular mt-2 text-sm">
          {definition ? `${definition.display_name} · ` : ""}
          {item.value ?? "—"} {item.unit ?? ""}
        </p>
      ) : (
        <form action={formAction} className="mt-3 space-y-2">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="checkup_id" value={checkupId} />
          <input type="hidden" name="was_edited" value={wasEdited ? "1" : "0"} />

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <label
                htmlFor={`code-${item.id}`}
                className="block text-xs font-medium text-muted"
              >
                지표
              </label>
              <select
                id={`code-${item.id}`}
                name="metric_code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="w-full rounded-lg border border-border-strong bg-background px-2.5 py-2
                           text-sm focus:border-brand-500"
              >
                <option value="">— 기록하지 않음 —</option>
                {definitions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.display_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-28 space-y-1">
              <label
                htmlFor={`value-${item.id}`}
                className="block text-xs font-medium text-muted"
              >
                값
              </label>
              <input
                id={`value-${item.id}`}
                name="value"
                type="number"
                step="any"
                inputMode="decimal"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className="tabular w-full rounded-lg border border-border-strong bg-background px-2.5 py-2
                           text-sm focus:border-brand-500"
              />
            </div>

            <span className="pb-2 text-sm text-muted">{definition?.unit ?? ""}</span>
          </div>

          {state.error ? (
            <p role="alert" className="text-xs text-status-out">
              {state.error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || !code || value === ""}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white
                         transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {item.status === "pending" ? "확인" : "다시 저장"}
            </button>
            <button
              type="submit"
              name="action"
              value="reject"
              formNoValidate
              disabled={pending || item.status === "rejected"}
              className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-muted
                         transition-colors hover:bg-surface disabled:opacity-50"
            >
              제외
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
