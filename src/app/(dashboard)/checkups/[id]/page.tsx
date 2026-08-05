import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { isExtractionConfigured } from "@/lib/checkup/extract";
import { createClient } from "@/lib/supabase/server";

import { ExtractButton } from "./extract-button";
import { ItemRow } from "./item-row";
import { DeleteCheckupButton, ReviewActions, RevertButton } from "./review-actions";

export const metadata = { title: "검진 결과 확인" };

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** 원본을 보는 동안만 유효하면 된다. 링크가 새어 나가도 곧 만료된다. */
const SIGNED_URL_TTL_SEC = 600;

export default async function CheckupDetailPage({
  params,
}: PageProps<"/checkups/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // RLS 가 남의 검진을 걸러 준다. 없으면 404 — "있는데 못 본다"를 노출하지 않는다.
  const { data: checkup } = await supabase
    .from("checkups")
    .select("id, checkup_date, institution")
    .eq("id", id)
    .maybeSingle();

  if (!checkup) notFound();

  const [documentsResult, extractionResult, definitionsResult] = await Promise.all([
    supabase
      .from("checkup_documents")
      .select("id, storage_path, file_name, mime_type")
      .eq("checkup_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("checkup_extractions")
      .select("id, status, error_message, completed_at")
      .eq("checkup_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("metric_definitions").select("code, display_name, unit").order("code"),
  ]);

  const documents = documentsResult.data ?? [];
  const extraction = extractionResult.data;
  const definitions = definitionsResult.data ?? [];

  const preview = documents[0];
  const { data: signed } = preview
    ? await supabase.storage
        .from("checkup-documents")
        .createSignedUrl(preview.storage_path, SIGNED_URL_TTL_SEC)
    : { data: null };

  const { data: items } = extraction
    ? await supabase
        .from("checkup_extraction_items")
        .select("*")
        .eq("extraction_id", extraction.id)
        .order("status", { ascending: true })
        .order("page_number", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
    : { data: null };

  const rows = items ?? [];
  const confirmed = extraction?.status === "confirmed";

  const pendingCount = rows.filter((row) => row.status === "pending").length;
  const readyCount = rows.filter(
    (row) =>
      (row.status === "accepted" || row.status === "edited") &&
      row.metric_code !== null &&
      row.value !== null,
  ).length;

  return (
    <>
      <Link href="/checkups" className="text-sm text-muted hover:text-foreground">
        ← 건강검진
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {DATE_FMT.format(new Date(`${checkup.checkup_date}T00:00:00`))}
          </h1>
          <p className="mt-1 text-sm text-muted">{checkup.institution ?? "기관 미입력"}</p>
        </div>

        <div className="shrink-0">
          <DeleteCheckupButton
            checkupId={checkup.id}
            confirmedCount={rows.filter((row) => row.health_metric_id !== null).length}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* 원본 — 판독 결과를 대조할 기준. 화면이 넓으면 나란히 둔다. */}
        <section className="lg:sticky lg:top-6 lg:self-start">
          <h2 className="text-sm font-semibold">원본</h2>

          {signed?.signedUrl ? (
            <div className="mt-2 overflow-hidden rounded-xl border border-border">
              {preview?.mime_type === "application/pdf" ? (
                <iframe
                  src={signed.signedUrl}
                  title="검진 결과지 원본"
                  className="h-[60vh] w-full lg:h-[70vh]"
                />
              ) : (
                // 원본은 Storage 의 signed URL 이라 next/image 의 최적화 대상이 아니다.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signed.signedUrl}
                  alt="검진 결과지 원본"
                  className="w-full"
                />
              )}
            </div>
          ) : (
            <p className="mt-2 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
              원본을 불러오지 못했습니다.
            </p>
          )}

          {preview?.file_name ? (
            <p className="mt-2 truncate text-xs text-muted">{preview.file_name}</p>
          ) : null}
        </section>

        <section>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">읽어낸 항목</h2>
            {confirmed && extraction ? (
              <RevertButton extractionId={extraction.id} checkupId={checkup.id} />
            ) : null}
          </div>

          {!extraction ? (
            <div className="mt-3 space-y-3">
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                아직 판독하지 않았습니다.
              </p>
              {isExtractionConfigured() ? (
                <ExtractButton checkupId={checkup.id} />
              ) : (
                <p className="text-xs text-muted">
                  자동 판독이 준비되지 않았습니다. 수치는 기록 화면에서 직접 입력하실
                  수 있습니다.
                </p>
              )}
            </div>
          ) : extraction.status === "failed" ? (
            <div className="mt-3 space-y-3">
              <p className="rounded-xl border border-status-out/40 px-4 py-4 text-sm text-status-out">
                {extraction.error_message ?? "판독에 실패했습니다."}
              </p>
              <ExtractButton checkupId={checkup.id} label="다시 판독" />
            </div>
          ) : extraction.status === "pending" || extraction.status === "running" ? (
            <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
              판독 중입니다. 잠시 후 새로고침해 주세요.
            </p>
          ) : rows.length === 0 ? (
            <div className="mt-3 space-y-3">
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                읽어낼 수 있는 수치 항목을 찾지 못했습니다.
              </p>
              <ExtractButton checkupId={checkup.id} label="다시 판독" />
            </div>
          ) : (
            <>
              {confirmed ? (
                <p className="mt-3 rounded-xl border border-status-normal/40 px-4 py-3 text-sm text-status-normal">
                  확인한 항목이 기록에 반영되었습니다.{" "}
                  <Link href="/metrics" className="underline">
                    기록 보기
                  </Link>
                </p>
              ) : (
                <p className="mt-3 text-xs text-muted">
                  원본과 대조해 값을 확인해 주세요. 확인한 항목만 기록에 들어갑니다.
                </p>
              )}

              <ul className="mt-3 space-y-2">
                {rows.map((row) => (
                  <ItemRow
                    key={row.id}
                    item={row}
                    checkupId={checkup.id}
                    definitions={definitions}
                    locked={confirmed}
                  />
                ))}
              </ul>

              {!confirmed ? (
                <ReviewActions
                  extractionId={extraction.id}
                  checkupId={checkup.id}
                  pendingCount={pendingCount}
                  readyCount={readyCount}
                />
              ) : null}
            </>
          )}
        </section>
      </div>
    </>
  );
}
