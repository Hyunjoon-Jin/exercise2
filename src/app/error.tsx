"use client";

import Link from "next/link";

/**
 * 화면 단위 오류 경계.
 *
 * ⚠️ error.message 를 화면에 그리지 않는다. 이 앱의 오류 메시지에는 복약
 *    이력이나 검진 수치가 섞여 들어올 수 있고, 사용자가 그 화면을 캡처해
 *    공유하는 순간 의도치 않은 노출이 된다. digest 만 보여 준다 — 서버
 *    로그와 대조할 수 있는 값이면서 그 자체로는 아무것도 알려주지 않는다.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">문제가 생겼습니다</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        화면을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요. 방금 입력한 내용은
        저장되지 않았을 수 있습니다.
      </p>

      <div className="mt-6 flex justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white
                     transition-colors hover:bg-brand-700"
        >
          다시 시도
        </button>
        <Link
          href="/today"
          className="rounded-lg border border-border-strong px-4 py-2.5 text-sm
                     transition-colors hover:bg-surface"
        >
          처음으로
        </Link>
      </div>

      {error.digest ? (
        <p className="tabular mt-6 text-xs text-muted">
          문의하실 때 이 번호를 알려 주세요: {error.digest}
        </p>
      ) : null}
    </div>
  );
}
