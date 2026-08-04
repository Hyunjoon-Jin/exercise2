"use client";

import { useActionState } from "react";

import type { BiologicalSex } from "@/lib/db/types";

import { saveProfile, type OnboardingFormState } from "../actions";

interface Props {
  initial: {
    display_name: string;
    birth_year: number | null;
    sex: BiologicalSex;
    height_cm: number | null;
  };
}

const INITIAL: OnboardingFormState = {};

const SEX_OPTIONS: { value: BiologicalSex; label: string }[] = [
  { value: "female", label: "여성" },
  { value: "male", label: "남성" },
  { value: "unspecified", label: "선택 안 함" },
];

export function ProfileForm({ initial }: Props) {
  const [state, formAction, pending] = useActionState(saveProfile, INITIAL);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="display_name" className="block text-sm font-medium">
          표시 이름
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          defaultValue={initial.display_name}
          maxLength={40}
          placeholder="앱에서 표시될 이름"
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base
                     placeholder:text-muted focus:border-brand-500"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="birth_year" className="block text-sm font-medium">
          출생연도
        </label>
        <input
          id="birth_year"
          name="birth_year"
          type="number"
          inputMode="numeric"
          defaultValue={initial.birth_year ?? ""}
          min={1900}
          max={new Date().getFullYear()}
          placeholder="1990"
          aria-describedby="birth_year-hint"
          className="tabular w-full rounded-lg border border-border bg-background px-3 py-2.5
                     text-base placeholder:text-muted focus:border-brand-500"
        />
        <p id="birth_year-hint" className="text-xs text-muted">
          연령대별 참고범위 판정에만 사용합니다. 생년월일 전체는 수집하지 않습니다.
        </p>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">성별</legend>
        <div className="flex gap-2" role="radiogroup">
          {SEX_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2
                         rounded-lg border border-border px-3 py-2.5 text-sm
                         has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50
                         has-[:checked]:font-medium has-[:checked]:text-brand-800"
            >
              <input
                type="radio"
                name="sex"
                value={option.value}
                defaultChecked={initial.sex === option.value}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted">
          혈색소·HDL 등 일부 지표는 성별에 따라 참고범위가 다릅니다.
        </p>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="height_cm" className="block text-sm font-medium">
          키 (cm)
        </label>
        <input
          id="height_cm"
          name="height_cm"
          type="number"
          inputMode="decimal"
          step="0.1"
          defaultValue={initial.height_cm ?? ""}
          min={50}
          max={280}
          placeholder="170"
          aria-describedby="height-hint"
          className="tabular w-full rounded-lg border border-border bg-background px-3 py-2.5
                     text-base placeholder:text-muted focus:border-brand-500"
        />
        <p id="height-hint" className="text-xs text-muted">
          체중을 기록하면 BMI 가 자동으로 계산됩니다.
        </p>
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
        {pending ? "저장 중…" : "시작하기"}
      </button>
    </form>
  );
}
