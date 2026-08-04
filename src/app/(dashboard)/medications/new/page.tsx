import Link from "next/link";

import { MedicationForm } from "./medication-form";

export const metadata = { title: "약 추가" };

export default function NewMedicationPage() {
  return (
    <>
      <Link href="/medications" className="text-sm text-muted hover:text-foreground">
        ← 복약
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">약 추가</h1>
      <p className="mt-2 text-sm text-muted">
        복용 시간을 등록하면 그 시간에 알림을 받을 수 있습니다.
      </p>

      <div className="mt-6">
        <MedicationForm />
      </div>
    </>
  );
}
