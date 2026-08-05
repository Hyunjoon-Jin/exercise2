import { notFound } from "next/navigation";

import { LegalDocumentView } from "@/components/legal-document";
import { getLegalDocument } from "@/lib/legal/documents";

export const metadata = { title: "개인정보 처리방침" };

export default async function PrivacyPage() {
  const document = await getLegalDocument("privacy_policy");
  if (!document) notFound();

  return (
    <>
      <LegalDocumentView document={document} />

      {/* 민감정보 처리는 별도 동의 대상이라 처리방침에서도 따로 짚는다. */}
      <SensitiveSection />
    </>
  );
}

async function SensitiveSection() {
  const sensitive = await getLegalDocument("sensitive_health_data");
  const llm = await getLegalDocument("llm_processing");

  if (!sensitive && !llm) return null;

  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="text-lg font-semibold tracking-tight">함께 받는 별도 동의</h2>
      <p className="mt-2 text-sm text-muted">
        아래 항목은 위 처리방침과 별도로 동의를 받습니다.
      </p>

      <div className="mt-6 space-y-8">
        {[sensitive, llm].filter((doc) => doc !== null).map((doc) => (
          <div key={doc.kind}>
            <h3 className="text-base font-semibold">{doc.title}</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
              {doc.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
