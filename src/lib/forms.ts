/**
 * 서버 액션 공통 결과 타입.
 *
 * useActionState 의 상태로 그대로 쓴다. 성공 시 폼을 초기화해야 하므로
 * savedAt 을 두어 클라이언트가 "방금 저장됨"을 감지할 수 있게 한다.
 */
export interface FormState {
  error?: string;
  savedAt?: number;
}

export const EMPTY_FORM_STATE: FormState = {};

export function formError(message: string): FormState {
  return { error: message };
}

export function formSaved(): FormState {
  return { savedAt: Date.now() };
}

/** 폼 값에서 필수 문자열을 읽는다. */
export function readString(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** 폼 값에서 선택 숫자를 읽는다. 비어 있으면 null, 숫자가 아니면 NaN. */
export function readNumber(formData: FormData, name: string): number | null {
  const raw = readString(formData, name);
  if (!raw) return null;
  return Number(raw);
}

/**
 * datetime-local 입력값을 ISO 문자열로.
 *
 * datetime-local 은 타임존이 없는 "2026-08-04T08:30" 형태를 준다.
 * new Date() 는 이를 브라우저/서버의 로컬 시간으로 해석하는데, 서버 액션은
 * UTC 서버에서 실행되므로 사용자가 입력한 시각과 어긋난다.
 * 그래서 클라이언트가 오프셋을 함께 보내고 여기서 보정한다.
 */
export function localInputToIso(value: string, offsetMinutes: number): string | null {
  if (!value) return null;
  const asUtc = Date.parse(`${value}:00.000Z`);
  if (Number.isNaN(asUtc)) return null;
  // getTimezoneOffset() 은 UTC 기준 분 차이를 부호 반대로 준다 (KST = -540).
  return new Date(asUtc + offsetMinutes * 60_000).toISOString();
}
