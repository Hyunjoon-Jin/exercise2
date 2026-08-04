"use client";

import { useActionState, useState } from "react";

import type { MedicationForm as MedicationFormType } from "@/lib/db/types";
import { EMPTY_FORM_STATE } from "@/lib/forms";

import { createMedication } from "../actions";

const FORM_OPTIONS: { value: MedicationFormType; label: string }[] = [
  { value: "tablet", label: "정제" },
  { value: "capsule", label: "캡슐" },
  { value: "liquid", label: "물약" },
  { value: "injection", label: "주사" },
  { value: "topical", label: "외용" },
  { value: "inhaler", label: "흡입" },
  { value: "other", label: "기타" },
];

const DAYS = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
  { value: 0, label: "일" },
];

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base " +
  "placeholder:text-muted focus:border-brand-500";

export function MedicationForm() {
  const [state, formAction, pending] = useActionState(
    createMedication,
    EMPTY_FORM_STATE,
  );
  const [times, setTimes] = useState<string[]>(["08:00"]);
  const [everyDay, setEveryDay] = useState(true);

  function updateTime(index: number, value: string) {
    setTimes((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-medium">
          약 이름
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={100}
          placeholder="예: 메트포르민"
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="dosage_amount" className="block text-sm font-medium">
            용량
          </label>
          <input
            id="dosage_amount"
            name="dosage_amount"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            placeholder="500"
            className={`tabular ${FIELD_CLASS}`}
          />
        </div>
        <div className="w-28 space-y-1.5">
          <label htmlFor="dosage_unit" className="block text-sm font-medium">
            단위
          </label>
          <input
            id="dosage_unit"
            name="dosage_unit"
            type="text"
            maxLength={20}
            placeholder="mg"
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="form" className="block text-sm font-medium">
          제형
        </label>
        <select id="form" name="form" defaultValue="tablet" className={FIELD_CLASS}>
          {FORM_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">복용 시간</legend>
        <input type="hidden" name="times" value={times.join(",")} readOnly />

        <div className="space-y-2">
          {times.map((time, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="time"
                value={time}
                onChange={(e) => updateTime(index, e.target.value)}
                aria-label={`복용 시간 ${index + 1}`}
                className={`tabular ${FIELD_CLASS}`}
              />
              {times.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setTimes((prev) => prev.filter((_, i) => i !== index))}
                  className="shrink-0 rounded-lg border border-border px-3 text-sm text-muted
                             transition-colors hover:bg-surface"
                >
                  삭제
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setTimes((prev) => [...prev, "20:00"])}
          className="w-full rounded-lg border border-dashed border-border py-2 text-sm
                     text-muted transition-colors hover:bg-surface"
        >
          시간 추가
        </button>
        <p className="text-xs text-muted">
          시간을 모두 지우면 알림 없이 목록에만 남습니다.
        </p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">복용 요일</legend>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={everyDay}
            onChange={(e) => setEveryDay(e.target.checked)}
            className="size-4 accent-brand-600"
          />
          매일 복용
        </label>

        {everyDay ? (
          // 매일이면 서버가 기본값(전 요일)을 쓰도록 아무것도 보내지 않는다.
          <p className="text-xs text-muted">매일 같은 시간에 복용합니다.</p>
        ) : (
          <div className="flex gap-1.5">
            {DAYS.map((day) => (
              <label
                key={day.value}
                className="flex flex-1 cursor-pointer items-center justify-center rounded-lg
                           border border-border py-2 text-sm transition-colors
                           has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50
                           has-[:checked]:font-medium has-[:checked]:text-brand-800"
              >
                <input type="checkbox" name="days" value={day.value} className="sr-only" />
                {day.label}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="purpose" className="block text-sm font-medium">
          복용 목적 <span className="font-normal text-muted">(선택)</span>
        </label>
        <input
          id="purpose"
          name="purpose"
          type="text"
          maxLength={100}
          placeholder="예: 혈당 조절"
          className={FIELD_CLASS}
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-status-out">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-4 py-3 font-medium text-white
                   transition-colors hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "저장 중…" : "등록하기"}
      </button>
    </form>
  );
}
