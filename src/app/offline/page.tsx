export const metadata = { title: "오프라인" };

/**
 * 오프라인 안내.
 *
 * 서비스 워커가 미리 받아 두는 유일한 화면이다. 그래서 여기에는 어떤
 * 개인 데이터도 실을 수 없다 — 이 HTML 은 기기 디스크에 남는다.
 *
 * 기록을 오프라인에서 임시 저장했다가 나중에 보내는 방식은 일부러 넣지
 * 않았다. 복약 체크가 보내지지 않은 채 "저장됨"으로 보이면, 사용자는
 * 먹었다고 믿고 다시 먹지 않는다. 지금은 못 보냈다고 정직하게 말한다.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">연결이 끊겼습니다</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
        네트워크에 연결되면 다시 이어서 사용할 수 있습니다. 기록은 저장되지 않았으니,
        연결된 뒤 다시 입력해 주세요.
      </p>

      <a
        href="/today"
        className="mt-6 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white
                   transition-colors hover:bg-brand-700"
      >
        다시 시도
      </a>
    </main>
  );
}
