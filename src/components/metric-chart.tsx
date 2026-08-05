"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MetricReferenceRange, MetricSource } from "@/lib/db/types";

export interface ChartPoint {
  /** 정렬·축 계산용 밀리초 타임스탬프 */
  t: number;
  value: number;
  source: MetricSource | string;
}

interface Props {
  points: ChartPoint[];
  unit: string;
  decimalPlaces: number;
  range: MetricReferenceRange | null;
}

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" });
const FULL_FMT = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const SOURCE_LABEL: Record<string, string> = {
  self: "직접 입력",
  checkup: "건강검진",
  device: "기기 연동",
  derived: "자동 계산",
};

/**
 * 출처별 점 모양.
 *
 * 검진값은 자가측정과 같은 선 위에 있지만 성격이 다르다 — 병원 장비로 잰
 * 값이고 몇 달에 한 번뿐이다. 어느 점이 검진에서 온 것인지 눈으로 구분되지
 * 않으면 "왜 갑자기 값이 튀지"의 답을 찾을 수 없다.
 *
 * 색만으로 구분하지 않고 모양도 바꾼다 (색각 이상 대응).
 */
function SourceDot(props: {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
  key?: string;
}) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined) return <g />;

  if (payload?.source === "checkup") {
    // 마름모, 속을 비워 선보다 앞으로 나오게
    const r = 5;
    return (
      <path
        d={`M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z`}
        fill="var(--background)"
        stroke="var(--color-brand-700)"
        strokeWidth={2}
      />
    );
  }

  return <circle cx={cx} cy={cy} r={3} fill="var(--color-brand-600)" />;
}

/**
 * 지표 추세 그래프.
 *
 * 정상 구간을 옅은 띠로 깔아 값이 범위 안에 있는지 눈으로 바로 읽히게 한다.
 * 축 범위는 데이터와 정상범위를 모두 감싸도록 잡는다 — 데이터만 기준으로
 * 잡으면 정상 띠가 화면 밖으로 밀려 의미가 없어진다.
 */
export function MetricChart({ points, unit, decimalPlaces, range }: Props) {
  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  const candidates = [...values];
  if (range?.normal_low !== null && range?.normal_low !== undefined) {
    candidates.push(range.normal_low);
  }
  if (range?.normal_high !== null && range?.normal_high !== undefined) {
    candidates.push(range.normal_high);
  }

  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const pad = (max - min || Math.abs(max) || 1) * 0.15;

  const bandLow = range?.normal_low ?? min - pad;
  const bandHigh = range?.normal_high ?? max + pad;

  const hasCheckup = points.some((p) => p.source === "checkup");

  return (
    <>
      <div className="h-56 w-full" role="img" aria-label="지표 추세 그래프">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />

            {range ? (
              <ReferenceArea
                y1={bandLow}
                y2={bandHigh}
                fill="var(--color-status-normal)"
                fillOpacity={0.07}
                stroke="none"
              />
            ) : null}

            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(t: number) => DATE_FMT.format(new Date(t))}
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              stroke="var(--border)"
              minTickGap={24}
            />
            <YAxis
              domain={[min - pad, max + pad]}
              tickFormatter={(v: number) => v.toFixed(decimalPlaces)}
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              stroke="var(--border)"
              width={48}
            />

            <Tooltip
              contentStyle={{
                background: "var(--background)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 12,
              }}
              labelFormatter={(t) => FULL_FMT.format(new Date(Number(t)))}
              formatter={(v, _name, item) => {
                const source = (item?.payload as ChartPoint | undefined)?.source;
                return [
                  `${Number(v).toFixed(decimalPlaces)} ${unit}`,
                  SOURCE_LABEL[source ?? ""] ?? "값",
                ];
              }}
            />

            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-brand-600)"
              strokeWidth={2}
              dot={<SourceDot />}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {hasCheckup ? (
        <div className="mt-2 flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden>
              <circle cx="5" cy="5" r="3" fill="var(--color-brand-600)" />
            </svg>
            직접 입력
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" aria-hidden>
              <path
                d="M6,1 L11,6 L6,11 L1,6 Z"
                fill="var(--background)"
                stroke="var(--color-brand-700)"
                strokeWidth={2}
              />
            </svg>
            건강검진
          </span>
        </div>
      ) : null}
    </>
  );
}
