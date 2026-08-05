import { notFound } from "next/navigation";

import { LegalDocumentView } from "@/components/legal-document";
import { getLegalDocument } from "@/lib/legal/documents";

export const metadata = { title: "이용약관" };

export default async function TermsPage() {
  const document = await getLegalDocument("terms_of_service");
  if (!document) notFound();

  return <LegalDocumentView document={document} />;
}
