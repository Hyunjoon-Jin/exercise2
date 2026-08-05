"use client";

import { useActionState, useState } from "react";

import { EMPTY_FORM_STATE } from "@/lib/forms";

import { deleteAccount } from "./actions";
import { DELETE_CONFIRMATION } from "./constants";

/**
 * 계정 삭제.
 *
 * 두 단계를 둔다: 먼저 무엇이 사라지는지 펼쳐 읽게 하고, 그다음 확인 문구를
 * 직접 입력하게 한다. 건강 기록은 한 번 지우면 어디에서도 복구할 수 없다 —
 * 버튼 하나로 끝나면 오조작이 곧 영구 손실이다.
 */
export function DeleteAccount() {
  const [state, formAction, pending] = useActionState(deleteAccount, EMPTY_FORM_STATE);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-status-out/50 px-4 py-2.5 text-sm
                   font-medium text-status-out transition-colors hover:bg-status-out/5"
      >
        계정 삭제
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-status-out/50 p-4">
      <h3 className="text-sm font-semibold text-status-out">
        이 작업은 되돌릴 수 없습니다
      </h3>

      <ul className="mt-3 space-y-1 text-sm leading-relaxed text-muted">
        <li>· 모든 건강 기록(수치·수면·복약·식단·운동)이 삭제됩니다.</li>
        <li>· 업로드한 검진 결과지 원본과 판독 결과가 삭제됩니다.</li>
        <li>· 프로필과 동의 이력이 삭제됩니다.</li>
        <li>· 계정이 삭제되며 같은 이메일로 다시 가입할 수 있습니다.</li>
      </ul>

      <p className="mt-4 text-sm">
        계속하시려면 아래에{" "}
        <strong className="font-semibold">{DELETE_CONFIRMATION}</strong> 를 입력해
        주세요.
      </p>

      <form action={formAction} className="mt-3 space-y-3">
        <label htmlFor="confirmation" className="sr-only">
          확인 문구
        </label>
        <input
          id="confirmation"
          name="confirmation"
          type="text"
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={DELETE_CONFIRMATION}
          className="w-full rounded-lg border border-border-strong bg-background px-3 py-2.5
                     text-base focus:border-brand-500"
        />

        {state.error ? (
          <p role="alert" className="text-sm text-status-out">
            {state.error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending || typed !== DELETE_CONFIRMATION}
            className="flex-1 rounded-lg bg-status-out px-4 py-2.5 text-sm font-medium
                       text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "삭제 중…" : "영구 삭제"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setTyped("");
            }}
            className="rounded-lg border border-border-strong px-4 py-2.5 text-sm
                       transition-colors hover:bg-surface"
          >
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
