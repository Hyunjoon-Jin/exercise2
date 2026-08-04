import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "복약" };

export default function MedicationsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">복약</h1>
      <p className="mt-2 text-sm text-muted">
        복용 중인 약을 등록하고 알림과 복용 여부를 관리합니다.
      </p>
      <div className="mt-6">
        <ComingSoon
          phase="Phase 1"
          title="복약 관리"
          description="약 등록, 복용 스케줄, 알림, 복용 체크와 순응도 통계가 들어옵니다."
        />
      </div>
    </>
  );
}
