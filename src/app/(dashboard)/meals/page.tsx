import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "식단" };

export default function MealsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">식단</h1>
      <p className="mt-2 text-sm text-muted">끼니를 기록하고 영양 섭취를 확인합니다.</p>
      <div className="mt-6">
        <ComingSoon
          phase="Phase 2"
          title="식단 기록"
          description="식약처 식품영양성분 데이터를 연동해 음식을 검색하고, 최근 항목·즐겨찾기로 빠르게 기록할 수 있게 됩니다."
        />
      </div>
    </>
  );
}
