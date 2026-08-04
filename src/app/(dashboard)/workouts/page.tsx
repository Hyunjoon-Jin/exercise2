import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "운동" };

export default function WorkoutsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">운동</h1>
      <p className="mt-2 text-sm text-muted">운동 기록과 주간 목표를 관리합니다.</p>
      <div className="mt-6">
        <ComingSoon
          phase="Phase 2"
          title="운동 기록"
          description="운동 종류·시간·강도를 기록하고 주간 목표 대비 달성률을 봅니다. MET 기반으로 소모 칼로리를 추정합니다."
        />
      </div>
    </>
  );
}
