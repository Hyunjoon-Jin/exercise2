"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import type { WorkoutIntensity } from "@/lib/db/types";
import { EMPTY_FORM_STATE } from "@/lib/forms";

import { createWorkout } from "../actions";

interface Exercise {
  code: string;
  name: string;
  category: string;
  met: number | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  cardio: "유산소",
  strength: "근력",
  flexibility: "유연성",
  sports: "스포츠",
};

const INTENSITY: { value: WorkoutIntensity; label: string }[] = [
  { value: "light", label: "가볍게" },
  { value: "moderate", label: "보통" },
  { value: "vigorous", label: "격하게" },
];

const DURATION_PRESETS = [15, 30, 45, 60];

const FIELD =
  "w-full rounded-lg border border-border-strong bg-background px-3 py-2.5 text-base " +
  "placeholder:text-muted focus:border-brand-500";

function nowLocalInput(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function WorkoutForm({
  exercises,
  latestWeightKg,
}: {
  exercises: Exercise[];
  latestWeightKg: number | null;
}) {
  const [state, formAction, pending] = useActionState(createWorkout, EMPTY_FORM_STATE);
  const [code, setCode] = useState(exercises[0]?.code ?? "");
  const [custom, setCustom] = useState(false);
  const [duration, setDuration] = useState(30);
  const startedAtRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (startedAtRef.current && !startedAtRef.current.value) {
      startedAtRef.current.value = nowLocalInput();
    }
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Exercise[]>();
    for (const exercise of exercises) {
      const list = map.get(exercise.category) ?? [];
      list.push(exercise);
      map.set(exercise.category, list);
    }
    return map;
  }, [exercises]);

  const selected = exercises.find((exercise) => exercise.code === code);

  // 서버 트리거와 같은 식으로 미리 보여준다: MET × 체중 × 시간
  const estimate =
    !custom && selected?.met && latestWeightKg
      ? Math.round(selected.met * latestWeightKg * (duration / 60))
      : null;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="tz_offset" value={-new Date().getTimezoneOffset()} readOnly />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">운동 종류</legend>

        {custom ? (
          <input
            name="custom_name"
            type="text"
            required
            maxLength={60}
            placeholder="운동 이름을 입력하세요"
            className={FIELD}
          />
        ) : (
          <select
            name="exercise_code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={FIELD}
          >
            {[...grouped.entries()].map(([category, list]) => (
              <optgroup key={category} label={CATEGORY_LABEL[category] ?? category}>
                {list.map((exercise) => (
                  <option key={exercise.code} value={exercise.code}>
                    {exercise.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => setCustom((prev) => !prev)}
          className="text-xs text-brand-text hover:underline"
        >
          {custom ? "목록에서 선택하기" : "목록에 없나요? 직접 입력"}
        </button>

        {custom ? (
          <p className="text-xs text-muted">
            직접 입력한 운동은 소모 칼로리를 자동 계산하지 않습니다.
          </p>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">운동 시간</legend>
        <input type="hidden" name="duration_min" value={duration} readOnly />

        <div className="flex gap-1.5">
          {DURATION_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setDuration(preset)}
              aria-pressed={duration === preset}
              className={`tabular flex-1 rounded-lg border py-2 text-sm transition-colors ${
                duration === preset
                  ? "border-brand-500 bg-brand-soft font-medium text-brand-strong"
                  : "border-border text-muted hover:bg-surface"
              }`}
            >
              {preset}분
            </button>
          ))}
        </div>

        <input
          type="number"
          min="1"
          max="1440"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value) || 0)}
          aria-label="운동 시간 (분)"
          className={`tabular ${FIELD}`}
        />
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">강도</legend>
        <div className="flex gap-1.5">
          {INTENSITY.map((option) => (
            <label
              key={option.value}
              className="flex flex-1 cursor-pointer items-center justify-center rounded-lg border
                         border-border py-2.5 text-sm transition-colors
                         has-[:checked]:border-brand-500 has-[:checked]:bg-brand-soft
                         has-[:checked]:font-medium has-[:checked]:text-brand-strong"
            >
              <input
                type="radio"
                name="intensity"
                value={option.value}
                defaultChecked={option.value === "moderate"}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="started_at" className="block text-sm font-medium">
          시작 시각
        </label>
        <input
          ref={startedAtRef}
          id="started_at"
          name="started_at"
          type="datetime-local"
          className={FIELD}
        />
      </div>

      {estimate !== null ? (
        <p className="rounded-lg bg-surface px-4 py-3 text-sm" aria-live="polite">
          예상 소모 칼로리{" "}
          <strong className="tabular font-medium">약 {estimate}kcal</strong>
          <span className="mt-0.5 block text-xs text-muted">
            체중 {latestWeightKg}kg 기준 추정치입니다.
          </span>
        </p>
      ) : !custom && selected?.met && !latestWeightKg ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted">
          체중을 기록하시면 소모 칼로리를 자동으로 계산합니다.
        </p>
      ) : null}

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
        {pending ? "저장 중…" : "기록하기"}
      </button>
    </form>
  );
}
