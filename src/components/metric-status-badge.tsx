import { METRIC_STATUS_LABEL, type MetricStatus } from "@/lib/metrics/status";

/**
 * 지표 상태 배지.
 *
 * 색만으로 구분되지 않도록 항상 텍스트 라벨을 함께 낸다 (색각 이상 고려).
 * 표시 문구는 status.ts 의 네 가지로 고정되어 있으며, 여기서 임의로
 * 다른 문구를 추가하지 않는다 — 진단성 표현 금지.
 */
const STYLES: Record<MetricStatus, string> = {
  normal: "bg-status-normal/10 text-status-normal",
  caution: "bg-status-caution/10 text-status-caution",
  out_of_range: "bg-status-out/10 text-status-out",
  unknown: "bg-surface text-muted",
};

export function MetricStatusBadge({
  status,
  size = "sm",
}: {
  status: MetricStatus;
  size?: "sm" | "md";
}) {
  if (status === "unknown") return null;

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-medium ${STYLES[status]} ${
        size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]"
      }`}
    >
      {METRIC_STATUS_LABEL[status]}
    </span>
  );
}
