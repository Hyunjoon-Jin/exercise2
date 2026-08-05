/**
 * 대시보드 공통 로딩 화면.
 *
 * 화면마다 서버에서 여러 쿼리를 병렬로 읽는다. loading.tsx 가 없으면 그동안
 * 이전 화면이 그대로 멈춰 있어, 느린 회선에서는 탭을 눌러도 반응이 없는
 * 것처럼 보인다.
 *
 * 실제 레이아웃을 흉내 낸 자리표시자를 둔다. 스피너만 돌리면 내용이 들어올
 * 때 화면이 통째로 뛴다.
 *
 * aria-hidden 인 이유: 스크린리더에는 아래 role="status" 한 줄만 읽히면
 * 충분하다. 빈 상자 여러 개를 읽어 주면 방해만 된다.
 */
export default function DashboardLoading() {
  return (
    <div>
      <p role="status" className="sr-only">
        불러오는 중입니다
      </p>

      <div aria-hidden className="animate-pulse">
        <div className="h-8 w-40 rounded-lg bg-surface" />
        <div className="mt-3 h-4 w-64 rounded bg-surface" />

        <div className="mt-8 space-y-3">
          <div className="h-24 rounded-xl bg-surface" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-28 rounded-xl bg-surface" />
            <div className="h-28 rounded-xl bg-surface" />
          </div>
          <div className="h-40 rounded-xl bg-surface" />
        </div>
      </div>
    </div>
  );
}
