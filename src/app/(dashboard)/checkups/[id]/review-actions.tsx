"use client";

import { useActionState } from "react";

import { EMPTY_FORM_STATE } from "@/lib/forms";

import { acceptAllItems, confirmExtraction, deleteCheckup, revertExtraction } from "../actions";

/**
 * 검수 마무리 영역.
 *
 * "전체 확인"과 "확정"을 나눠 둔 이유: 전체 확인은 되돌리기 쉬운 표시일 뿐이고,
 * 확정에서야 기록에 반영된다. 한 번에 묶으면 훑어보다 실수로 누른 값이
 * 그대로 지표가 된다.
 */
export function ReviewActions({
  extractionId,
  checkupId,
  pendingCount,
  readyCount,
}: {
  extractionId: string;
  checkupId: string;
  /** 아직 확인하지 않은 항목 수 */
  pendingCount: number;
  /** 확정하면 기록에 들어갈 항목 수 */
  readyCount: number;
}) {
  const [state, formAction, pending] = useActionState(
    confirmExtraction,
    EMPTY_FORM_STATE,
  );

  return (
    <div className="sticky bottom-4 mt-6 space-y-3 rounded-xl border border-border bg-background p-4 shadow-lg">
      <p className="text-sm">
        확인한 항목 <strong className="tabular font-semibold">{readyCount}</strong>개
        {pendingCount > 0 ? (
          <span className="text-muted"> · 확인 안 한 항목 {pendingCount}개</span>
        ) : null}
      </p>

      {pendingCount > 0 ? (
        <form action={acceptAllItems}>
          <input type="hidden" name="extraction_id" value={extractionId} />
          <input type="hidden" name="checkup_id" value={checkupId} />
          <button
            type="submit"
            className="w-full rounded-lg border border-border-strong px-4 py-2 text-sm
                       transition-colors hover:bg-surface"
          >
            남은 {pendingCount}개를 읽은 그대로 확인
          </button>
        </form>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm text-status-out">
          {state.error}
        </p>
      ) : null}

      <form action={formAction}>
        <input type="hidden" name="extraction_id" value={extractionId} />
        <input type="hidden" name="checkup_id" value={checkupId} />
        <button
          type="submit"
          disabled={pending || readyCount === 0}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white
                     transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "반영 중…" : `${readyCount}개 항목을 기록에 반영`}
        </button>
      </form>
    </div>
  );
}

/** 확정을 되돌린다 — 승격된 지표를 전부 지운다. */
export function RevertButton({
  extractionId,
  checkupId,
}: {
  extractionId: string;
  checkupId: string;
}) {
  return (
    <form
      action={revertExtraction}
      onSubmit={(event) => {
        if (!confirm("반영한 수치를 모두 지우고 검수 단계로 되돌립니다. 계속할까요?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="extraction_id" value={extractionId} />
      <input type="hidden" name="checkup_id" value={checkupId} />
      <button
        type="submit"
        className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-muted
                   transition-colors hover:bg-surface"
      >
        반영 취소
      </button>
    </form>
  );
}

/**
 * 검진 삭제.
 *
 * 원본 파일과 판독 결과뿐 아니라 이 검진에서 확정한 수치까지 함께 사라진다
 * (마이그레이션 0008 의 checkups_delete_metrics 트리거). 되돌릴 수 없으므로
 * 무엇이 지워지는지 먼저 말해 준다.
 */
export function DeleteCheckupButton({
  checkupId,
  confirmedCount,
}: {
  checkupId: string;
  confirmedCount: number;
}) {
  return (
    <form
      action={deleteCheckup}
      onSubmit={(event) => {
        const extra =
          confirmedCount > 0
            ? `\n\n이 검진에서 반영한 수치 ${confirmedCount}개도 기록에서 사라집니다.`
            : "";
        if (!confirm(`결과지 원본과 판독 결과를 모두 지웁니다.${extra}\n\n계속할까요?`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={checkupId} />
      <button
        type="submit"
        className="rounded-lg px-2 py-1 text-xs text-muted transition-colors
                   hover:bg-surface hover:text-status-out"
      >
        삭제
      </button>
    </form>
  );
}
