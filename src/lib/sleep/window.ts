export interface SleepWindow {
  bedIso: string;
  wakeIso: string;
  minutes: number;
}

/**
 * "23:30 에 자서 07:00 에 일어났다" 를 실제 시각 두 개로 바꾼다.
 *
 * 취침 시각이 기상 시각보다 늦으면 전날 밤에 잠든 것이다 — 대부분의 수면이
 * 여기 해당한다. 낮잠처럼 같은 날 안에서 끝나는 경우도 자연스럽게 처리된다.
 *
 * @param sleepDate    기상한 날 (YYYY-MM-DD, 사용자 로컬 기준)
 * @param bedTime      취침 시각 (HH:MM, 사용자 로컬 기준)
 * @param wakeTime     기상 시각 (HH:MM, 사용자 로컬 기준)
 * @param offsetMinutes UTC 대비 분 (KST = +540)
 */
export function resolveSleepWindow(
  sleepDate: string,
  bedTime: string,
  wakeTime: string,
  offsetMinutes: number,
): SleepWindow | null {
  const toUtc = (date: string, time: string): number | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    if (!/^\d{2}:\d{2}$/.test(time)) return null;

    const parsed = Date.parse(`${date}T${time}:00.000Z`);
    if (Number.isNaN(parsed)) return null;
    return parsed - offsetMinutes * 60_000;
  };

  const wake = toUtc(sleepDate, wakeTime);
  if (wake === null) return null;

  let bed = toUtc(sleepDate, bedTime);
  if (bed === null) return null;

  if (bed >= wake) {
    bed -= 86_400_000; // 전날 밤
  }

  const minutes = Math.round((wake - bed) / 60_000);
  if (minutes <= 0 || minutes > 1440) return null;

  return {
    bedIso: new Date(bed).toISOString(),
    wakeIso: new Date(wake).toISOString(),
    minutes,
  };
}
