import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "건강검진" };

export default function CheckupsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">건강검진</h1>
      <p className="mt-2 text-sm text-muted">
        검진 결과지를 올리면 항목과 수치를 자동으로 읽어냅니다.
      </p>
      <div className="mt-6">
        <ComingSoon
          phase="Phase 3"
          title="결과지 자동 판독"
          description="PDF·이미지를 업로드하면 검사 항목과 수치를 추출합니다. 추출 결과는 원본과 나란히 확인한 뒤에만 기록에 반영되며, 자동으로 저장되지 않습니다."
        />
      </div>
    </>
  );
}
