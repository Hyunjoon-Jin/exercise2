"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { recordMetric } from "@/app/(dashboard)/metrics/actions";
import type { MetricDefinition } from "@/lib/db/types";
import { EMPTY_FORM_STATE } from "@/lib/forms";

interface Props {
  definitions: MetricDefinition[];
  /** 지정하면 지표 선택 없이 이 지표로 고정한다 (상세 화면) */
  fixedCode?: string;
}

/** datetime-local 입력에 넣을 현재 시각 문자열 */
function nowLocalInput(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

export function MetricRecordForm({ definitions, fixedCode }: Props) {
  const [state, formAction, pending] = useActionState(recordMetric, EMPTY_FORM_STATE);
  const [code, setCode] = useState(fixedCode ?? definitions[0]?.code ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const measuredAtRef = useRef<HTMLInputElement>(null);

  // datetime-local 기본값은 클라이언트에서만 정할 수 있다. 서버에서 렌더하면
  // 서버의 UTC 시각이 들어가 하이드레이션이 어긋난다. state 로 두면 렌더가
  // 한 번 더 도므로 비제어 입력에 DOM 으로 직접 넣는다.
  useEffect(() => {
    if (measuredAtRef.current && !measuredAtRef.current.value) {
      measuredAtRef.current.value = nowLocalInput();
    }
  }, []);

  // 저장에 성공하면 값 칸만 비운다. 측정 시각과 지표는 연속 입력을 위해 남긴다.
  useEffect(() => {
    if (state.savedAt) {
      const input = formRef.current?.elements.namedItem("value");
      if (input instanceof HTMLInputElement) {
        input.value = "";
        input.focus();
      }
    }
  }, [state.savedAt]);

  const selected = useMemo(
    () => definitions.find((d) => d.code === code),
    [definitions, code],
  );

  if (definitions.length === 0) return null;

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input
        type="hidden"
        name="tz_offset"
        value={-new Date().getTimezoneOffset()}
        readOnly
      />

      {fixedCode ? (
        <input type="hidden" name="metric_code" value={fixedCode} readOnly />
      ) : (
        <div className="space-y-1.5">
          <label htmlFor="metric_code" className="block text-sm font-medium">
            지표
          </label>
          <select
            id="metric_code"
            name="metric_code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-lg border border-border-strong bg-background px-3 py-2.5 text-base
                       focus:border-brand-500"
          >
            {definitions.map((d) => (
              <option key={d.code} value={d.code}>
                {d.display_name} ({d.unit})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="value" className="block text-sm font-medium">
            값{selected ? ` (${selected.unit})` : ""}
          </label>
          <input
            id="value"
            name="value"
            type="number"
            inputMode="decimal"
            step={selected ? 10 ** -selected.decimal_places : "any"}
            required
            autoComplete="off"
            className="tabular w-full rounded-lg border border-border-strong bg-background px-3 py-2.5
                       text-base focus:border-brand-500"
          />
        </div>

        <div className="flex-1 space-y-1.5">
          <label htmlFor="measured_at" className="block text-sm font-medium">
            측정 시각
          </label>
          <input
            ref={measuredAtRef}
            id="measured_at"
            name="measured_at"
            type="datetime-local"
            className="w-full rounded-lg border border-border-strong bg-background px-3 py-2.5
                       text-base focus:border-brand-500"
          />
        </div>
      </div>

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
    </form>
  );
}
