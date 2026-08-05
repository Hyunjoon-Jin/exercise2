/**
 * 주간 리포트 화면의 계산 부분.
 *
 * 화면 컴포넌트에서 떼어낸 이유는 하나다 — 여기가 조용히 틀리는 자리다.
 * 주차 번호가 음수로 새면 미래 주를 보여주고, 비교 대상이 없는데 델타를
 * 그리면 "지난주 대비 -2000kcal" 같은 거짓말이 나온다.
 */

/** 리포트에서 다루는 최대 과거 주차. 그보다 오래되면 복약 스케줄 전개가 근사치다. */
export const MAX_WEEK_OFFSET = 52;

/**
 * ?w= 파라미터를 주차 번호로.
 *
 * 0 = 이번 주. 음수·소수·문자열은 0 으로 떨어뜨린다 — 미래 주는 존재하지 않는다.
 */
export function parseWeekOffset(raw: string | string[] | undefined): number {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(first);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(Math.trunc(parsed), 0), MAX_WEEK_OFFSET);
}

export interface DeltaResult {
  direction: "up" | "down" | "flat";
  amount: number;
}

/**
 * 지난주 대비 변화.
 *
 * 비교할 값이 없으면 null 이다. 0 을 "변화 없음"으로 취급하면 기록이 아예
 * 없던 주가 "지난주와 비슷"으로 표시된다 — 전혀 다른 이야기다.
 *
 * epsilon 은 반올림 표시와 어긋나지 않게 하기 위한 것. 0.04kg 차이를
 * "▼ 0.0kg" 으로 그리면 읽는 사람이 버그로 본다.
 */
export function describeDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  epsilon = 0.05,
): DeltaResult | null {
  if (current === null || current === undefined) return null;
  if (previous === null || previous === undefined) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;

  const diff = current - previous;
  if (Math.abs(diff) < epsilon) return { direction: "flat", amount: 0 };

  return { direction: diff > 0 ? "up" : "down", amount: Math.abs(diff) };
}

/** 분을 "N시간 M분" 으로. 60분 미만이면 시간 부분을 생략하지 않는다 (자릿수 흔들림 방지). */
export function formatDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  return `${Math.floor(rounded / 60)}시간 ${rounded % 60}분`;
}

/** 주간 운동 목표 달성률(%). 목표가 없거나 0 이면 null. */
export function goalPercent(minutes: number, goal: number | null): number | null {
  if (!goal || goal <= 0) return null;
  return Math.round((minutes / goal) * 100);
}
