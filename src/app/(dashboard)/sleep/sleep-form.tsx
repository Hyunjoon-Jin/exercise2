"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { EMPTY_FORM_STATE } from "@/lib/forms";

import { recordSleep } from "./actions";

const QUALITY_LABELS = ["매우 나쁨", "나쁨", "보통", "좋음", "매우 좋음"];

function todayLocal(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** 취침·기상 시각으로 수면 시간을 미리 보여준다 (서버 계산과 같은 규칙) */
function previewDuration(bed: string, wake: string): string | null {
  if (!bed || !wake) return null;
  const [bh, bm] = bed.split(":").map(Number);
  const [wh, wm] = wake.split(":").map(Number);
  if ([bh, bm, wh, wm].some(Number.isNaN)) return null;

  let minutes = wh * 60 + wm - (bh * 60 + bm);
  if (minutes <= 0) minutes += 1440;

  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

export function SleepForm({ initialQuality = 3 }: { initialQuality?: number }) {
  const [state, formAction, pending] = useActionState(recordSleep, EMPTY_FORM_STATE);
  const [bed, setBed] = useState("23:00");
  const [wake, setWake] = useState("07:00");
  const [quality, setQuality] = useState(initialQuality);
  const dateRef = useRef<HTMLInputElement>(null);

  // "오늘"은 클라이언트에서만 알 수 있다. 서버에서 렌더하면 서버의 UTC 날짜가
  // 들어가 하이드레이션이 어긋난다. 값을 state 로 두면 렌더가 한 번 더 도므로
  // 비제어 입력에 DOM 으로 직접 넣는다.
  useEffect(() => {
    if (dateRef.current && !dateRef.current.value) {
      dateRef.current.value = todayLocal();
    }
  }, []);

  const duration = previewDuration(bed, wake);

  return (
    <form action={formAction} className="space-y-4">
      <input
        type="hidden"
        name="tz_offset"
        value={-new Date().getTimezoneOffset()}
        readOnly
      />

      <div className="space-y-1.5">
        <label htmlFor="sleep_date" className="block text-sm font-medium">
          기상한 날
        </label>
        <input
          ref={dateRef}
          id="sleep_date"
          name="sleep_date"
          type="date"
          required
          className="w-full rounded-lg border border-border-strong bg-background px-3 py-2.5
                     text-base focus:border-brand-500"
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="bed_time" className="block text-sm font-medium">
            취침
          </label>
          <input
            id="bed_time"
            name="bed_time"
            type="time"
            value={bed}
            onChange={(e) => setBed(e.target.value)}
            required
            className="tabular w-full rounded-lg border border-border-strong bg-background px-3 py-2.5
                       text-base focus:border-brand-500"
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <label htmlFor="wake_time" className="block text-sm font-medium">
            기상
          </label>
          <input
            id="wake_time"
            name="wake_time"
            type="time"
            value={wake}
            onChange={(e) => setWake(e.target.value)}
            required
            className="tabular w-full rounded-lg border border-border-strong bg-background px-3 py-2.5
                       text-base focus:border-brand-500"
          />
        </div>
      </div>

      {duration ? (
        <p className="text-sm text-muted" aria-live="polite">
          수면 시간 <strong className="font-medium text-foreground">{duration}</strong>
        </p>
      ) : null}

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">수면의 질</legend>
        <input type="hidden" name="quality" value={quality} readOnly />
        <div className="flex gap-1.5">
          {QUALITY_LABELS.map((label, index) => {
            const score = index + 1;
            const active = quality === score;
            return (
              <button
                key={score}
                type="button"
                onClick={() => setQuality(score)}
                aria-pressed={active}
                className={`flex-1 rounded-lg border px-1 py-2 text-xs transition-colors ${
                  active
                    ? "border-brand-500 bg-brand-soft font-medium text-brand-strong"
                    : "border-border text-muted hover:bg-surface"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {state.error ? (
        <p role="alert" className="text-sm text-status-out">
          {state.error}
        </p>
      ) : null}

      {state.savedAt && !state.error ? (
        <p role="status" className="text-sm text-status-normal">
          저장했습니다.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white
                   transition-colors hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "저장 중…" : "기록하기"}
      </button>

      <p className="text-xs text-muted">
        같은 날짜를 다시 기록하면 기존 기록을 덮어씁니다.
      </p>
    </form>
  );
}
