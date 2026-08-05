"use client";

/**
 * 기록 삭제 버튼.
 *
 * 건강 기록은 복구 경로가 없다. 체중 하나를 잘못 지우면 그 날의 값은 어디에도
 * 남지 않는다. 목록에서 스크롤하다 손이 스치는 위치에 있는 버튼이라, 확인
 * 한 단계를 반드시 거치게 한다.
 *
 * 무엇을 지우는지 문구에 넣는다 — "정말 삭제할까요?" 만으로는 목록에서
 * 어느 줄을 눌렀는지 알 수 없다.
 */
export function DeleteRecordButton({
  action,
  fields,
  label,
  what,
}: {
  action: (formData: FormData) => void | Promise<void>;
  /** 서버 액션에 넘길 hidden 필드 */
  fields: Record<string, string>;
  /** 버튼에 보이는 글자 */
  label?: string;
  /** 확인 문구에 들어갈 대상 설명 (예: "8월 5일 점심") */
  what: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm(`${what}을(를) 삭제합니다. 되돌릴 수 없습니다.\n\n계속할까요?`)) {
          event.preventDefault();
        }
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        // 최소 터치 영역을 확보한다 (WCAG 2.5.8). 글자는 작게 두되
        // 누를 수 있는 면적은 44px 로 맞춘다.
        aria-label={`${what} 삭제`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2
                   text-xs text-muted transition-colors hover:bg-surface hover:text-status-out"
      >
        {label ?? "삭제"}
      </button>
    </form>
  );
}
