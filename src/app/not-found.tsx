import Link from "next/link";

export const metadata = { title: "찾을 수 없음" };

/**
 * 404.
 *
 * 검진 상세 등에서 남의 것을 열려고 하면 여기로 온다. "권한이 없습니다"가
 * 아니라 "없습니다"로 답하는 것이 의도다 — 존재 여부를 알려주는 것만으로도
 * 누가 어떤 검진을 받았는지가 새어 나간다.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">페이지를 찾을 수 없습니다</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        주소가 바뀌었거나 삭제된 기록일 수 있습니다.
      </p>

      <Link
        href="/today"
        className="mt-6 inline-block rounded-lg bg-brand-600 px-4 py-2.5 text-sm
                   font-medium text-white transition-colors hover:bg-brand-700"
      >
        처음으로
      </Link>
    </div>
  );
}
