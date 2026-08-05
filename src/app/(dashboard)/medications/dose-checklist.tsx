import { Check, X } from "lucide-react";

import type { MedicationDose } from "@/lib/db/types";

import { clearDose, logDose } from "./actions";

const TIME_FMT = new Intl.DateTimeFormat("ko-KR", {
  hour: "numeric",
  minute: "2-digit",
});

/**
 * 오늘의 복용 체크리스트.
 *
 * 서버 컴포넌트 + form action 으로 만든다. 체크 한 번이 곧 서버 상태 변경이라
 * 클라이언트에서 낙관적 업데이트를 얹을 만큼 복잡하지 않고, JS 없이도 동작한다.
 */
export function DoseChecklist({ doses }: { doses: MedicationDose[] }) {
  if (doses.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
        오늘 예정된 복용이 없습니다.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {doses.map((dose) => {
        const done = dose.status === "taken";
        const skipped = dose.status === "skipped";

        return (
          <li
            key={`${dose.schedule_id}-${dose.scheduled_for}`}
            className="flex items-center gap-3 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-sm font-medium ${
                  done || skipped ? "text-muted line-through" : ""
                }`}
              >
                {dose.medication_name}
                {dose.dosage_amount ? (
                  <span className="ml-1.5 text-xs font-normal text-muted">
                    {dose.dosage_amount}
                    {dose.dosage_unit}
                  </span>
                ) : null}
              </p>
              <p className="tabular text-xs text-muted">
                {TIME_FMT.format(new Date(dose.scheduled_for))}
                {skipped ? <span className="ml-2">건너뜀</span> : null}
              </p>
            </div>

            {dose.status ? (
              <form action={clearDose}>
                <input type="hidden" name="log_id" value={dose.log_id ?? ""} />
                <button
                  type="submit"
                  className="rounded-lg px-2.5 py-1.5 text-xs text-muted
                             transition-colors hover:bg-surface hover:text-foreground"
                >
                  취소
                </button>
              </form>
            ) : (
              <div className="flex shrink-0 gap-1.5">
                <form action={logDose}>
                  <input type="hidden" name="medication_id" value={dose.medication_id} />
                  <input type="hidden" name="schedule_id" value={dose.schedule_id} />
                  <input type="hidden" name="scheduled_for" value={dose.scheduled_for} />
                  <input type="hidden" name="status" value="skipped" />
                  <button
                    type="submit"
                    aria-label={`${dose.medication_name} 건너뛰기`}
                    className="rounded-lg border border-border p-2 text-muted
                               transition-colors hover:bg-surface"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </form>

                <form action={logDose}>
                  <input type="hidden" name="medication_id" value={dose.medication_id} />
                  <input type="hidden" name="schedule_id" value={dose.schedule_id} />
                  <input type="hidden" name="scheduled_for" value={dose.scheduled_for} />
                  <input type="hidden" name="status" value="taken" />
                  <button
                    type="submit"
                    aria-label={`${dose.medication_name} 복용 완료`}
                    className="rounded-lg bg-brand-600 p-2 text-white
                               transition-colors hover:bg-brand-700"
                  >
                    <Check aria-hidden className="size-4" />
                  </button>
                </form>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
