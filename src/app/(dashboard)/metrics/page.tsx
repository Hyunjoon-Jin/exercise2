import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "기록" };

export default function MetricsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">기록</h1>
      <p className="mt-2 text-sm text-muted">
        체중·혈압·혈당 같은 수치와 수면 기록을 남기고 추세를 봅니다.
      </p>
      <div className="mt-6">
        <ComingSoon
          phase="Phase 1"
          title="신체기록 · 수면"
          description="지표 입력 폼과 추세 그래프가 들어옵니다. 여기에 기록한 값은 건강검진에서 확인된 수치와 같은 시간축에 표시됩니다."
        />
      </div>
    </>
  );
}
