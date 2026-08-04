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

import type { MetricReferenceRange } from "@/lib/db/types";

export interface ChartPoint {
  /** 정렬·축 계산용 밀리초 타임스탬프 */
  t: number;
  value: number;
  source: string;
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

  return (
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
            formatter={(v) => [`${Number(v).toFixed(decimalPlaces)} ${unit}`, "값"]}
          />

          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-brand-600)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--color-brand-600)" }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
