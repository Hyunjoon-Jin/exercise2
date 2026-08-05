"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { EMPTY_FORM_STATE } from "@/lib/forms";

import { uploadCheckup } from "../actions";

const MAX_MB = 20;

function todayLocal(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

export function UploadForm() {
  const [state, formAction, pending] = useActionState(uploadCheckup, EMPTY_FORM_STATE);
  const [file, setFile] = useState<File | null>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  // 서버에서 "오늘"을 넣으면 UTC 기준이라 사용자의 날짜와 어긋난다.
  useEffect(() => {
    if (dateRef.current && !dateRef.current.value) {
      dateRef.current.value = todayLocal();
    }
  }, []);

  const tooLarge = file !== null && file.size > MAX_MB * 1024 * 1024;

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="checkup_date" className="block text-sm font-medium">
          검진일
        </label>
        <input
          ref={dateRef}
          id="checkup_date"
          name="checkup_date"
          type="date"
          required
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5
                     text-base focus:border-brand-500"
        />
        <p className="text-xs text-muted">
          결과지에 적힌 날짜와 다르면 판독 후 알려 드립니다.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="institution" className="block text-sm font-medium">
          검진 기관 <span className="font-normal text-muted">(선택)</span>
        </label>
        <input
          id="institution"
          name="institution"
          type="text"
          maxLength={100}
          placeholder="○○병원 건강검진센터"
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5
                     text-base focus:border-brand-500"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="document" className="block text-sm font-medium">
          결과지 파일
        </label>
        <input
          id="document"
          name="document"
          type="file"
          required
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5
                     text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface
                     file:px-3 file:py-1.5 file:text-sm file:font-medium
                     focus:border-brand-500"
        />
        <p className="text-xs text-muted">
          PDF 또는 사진(JPG, PNG, WebP), {MAX_MB}MB 이하. 스캔본이나 휴대폰으로 찍은
          사진도 됩니다.
        </p>
      </div>

      {tooLarge ? (
        <p role="alert" className="text-sm text-status-out">
          파일이 {MAX_MB}MB 를 넘습니다. 페이지를 나누거나 해상도를 낮춰 주세요.
        </p>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm text-status-out">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || tooLarge}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white
                   transition-colors hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "올리는 중…" : "올리기"}
      </button>
    </form>
  );
}
