"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ExtractResponse {
  item_count?: number;
  needs_attention?: number;
  detected_date?: string | null;
  message?: string;
}

/**
 * 판독 시작.
 *
 * 서버 액션이 아니라 fetch 로 라우트를 부른다. 판독은 1분을 넘길 수 있어
 * 진행 중임을 계속 보여줘야 하는데, 서버 액션은 그 사이 화면이 멈춘 것처럼
 * 보인다.
 */
export function ExtractButton({
  checkupId,
  label = "자동 판독 시작",
}: {
  checkupId: string;
  label?: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setRunning(true);
    setError(null);

    try {
      const response = await fetch(`/api/checkups/${checkupId}/extract`, {
        method: "POST",
      });

      const body = (await response.json().catch(() => ({}))) as ExtractResponse;

      if (!response.ok) {
        setError(body.message ?? "판독에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        setRunning(false);
        // 실패도 기록으로 남으므로 화면을 갱신해 상태를 맞춘다.
        router.refresh();
        return;
      }

      router.refresh();
    } catch {
      setError("판독 요청을 보내지 못했습니다. 연결을 확인해 주세요.");
      setRunning(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        disabled={running}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white
                   transition-colors hover:bg-brand-700 disabled:opacity-60"
      >
        {running ? "판독 중… (1분 정도 걸립니다)" : label}
      </button>

      {running ? (
        <p role="status" className="text-xs text-muted">
          결과지를 읽고 있습니다. 이 화면을 닫지 말고 기다려 주세요.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-status-out">
          {error}
        </p>
      ) : null}
    </div>
  );
}
