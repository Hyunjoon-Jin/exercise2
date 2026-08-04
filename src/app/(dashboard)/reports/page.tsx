import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "리포트" };

export default function ReportsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">리포트</h1>
      <p className="mt-2 text-sm text-muted">주간 흐름을 한눈에 정리해 봅니다.</p>
      <div className="mt-6">
        <ComingSoon
          phase="Phase 4"
          title="주간 리포트"
          description="체중 추세, 복약 순응도, 운동 빈도, 평균 섭취 칼로리를 자동으로 정리합니다."
        />
      </div>
    </>
  );
}
