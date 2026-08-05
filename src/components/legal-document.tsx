import type { LegalDocument } from "@/lib/legal/documents";

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

/**
 * 약관 본문 렌더러.
 *
 * 본문은 DB 에 평문으로 들어 있다. HTML 을 넣게 두면 문서 편집이 곧 XSS
 * 통로가 되므로, 줄바꿈만 살려서 문단으로 나눈다. 서식이 더 필요해지면
 * 그때 제한된 마크업을 정의한다 — 지금 dangerouslySetInnerHTML 로 여는 것은
 * 필요보다 위험이 크다.
 */
export function LegalDocumentView({ document }: { document: LegalDocument }) {
  const paragraphs = document.body.split(/\n{2,}/);

  return (
    <article>
      <h1 className="text-2xl font-semibold tracking-tight">{document.title}</h1>
      <p className="mt-2 text-sm text-muted">
        버전 {document.version} · {DATE_FMT.format(new Date(document.effective_from))}
        부터 적용
      </p>

      <div className="mt-8 space-y-5">
        {paragraphs.map((paragraph, index) => (
          <p
            key={index}
            className="whitespace-pre-line text-sm leading-relaxed text-foreground"
          >
            {paragraph}
          </p>
        ))}
      </div>
    </article>
  );
}
