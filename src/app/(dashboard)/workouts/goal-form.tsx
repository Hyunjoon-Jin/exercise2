"use client";

import { useActionState } from "react";

import { EMPTY_FORM_STATE } from "@/lib/forms";

import { setWeeklyGoal } from "./actions";

/** WHO 권고: 중강도 유산소 주 150분 */
const PRESETS = [90, 150, 210, 300];

export function GoalForm({ current }: { current: number | null }) {
  const [state, formAction, pending] = useActionState(setWeeklyGoal, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex gap-2">
        <input
          name="goal_min"
          type="number"
          min="0"
          max="10080"
          step="10"
          defaultValue={current ?? ""}
          placeholder="150"
          aria-label="주간 목표 (분)"
          className="tabular w-full rounded-lg border border-border bg-background px-3 py-2.5
                     text-base placeholder:text-muted focus:border-brand-500"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg border border-border px-4 text-sm font-medium
                     transition-colors hover:bg-surface disabled:opacity-60"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="submit"
            name="goal_min"
            value={preset}
            className="tabular rounded-lg border border-border px-3 py-1.5 text-xs text-muted
                       transition-colors hover:bg-surface hover:text-foreground"
          >
            {preset}분
            {preset === 150 ? " (WHO 권고)" : ""}
          </button>
        ))}
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-status-out">
          {state.error}
        </p>
      ) : null}

      {state.savedAt && !state.error ? (
        <p role="status" className="text-sm text-status-normal">
          목표를 저장했습니다.
        </p>
      ) : null}
    </form>
  );
}
