import "server-only";

import type {
  HealthMetric,
  MetricDefinition,
  MetricReferenceRange,
  Profile,
} from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

import {
  approximateAge,
  evaluateMetric,
  resolveReferenceRange,
  type MetricStatus,
} from "./status";

export interface LatestMetric {
  id: string;
  metric_code: string;
  value: number;
  unit: string;
  measured_at: string;
  source: HealthMetric["source"];
}

/** 지표 정의 + 최신값 + 판정 결과를 한 덩어리로 묶은 화면용 모델 */
export interface MetricSummary {
  definition: MetricDefinition;
  latest: LatestMetric | null;
  range: MetricReferenceRange | null;
  status: MetricStatus;
}

type ProfileSubject = Pick<Profile, "sex" | "birth_year">;

/**
 * 지표 목록 화면 데이터.
 *
 * 정의·참고범위·최신값을 각각 한 번씩만 읽고 메모리에서 조립한다.
 * 지표 수가 수십 개 수준이므로 지표마다 쿼리를 날리는 것보다 훨씬 싸다.
 */
export async function getMetricSummaries(
  profile: ProfileSubject,
): Promise<MetricSummary[]> {
  const supabase = await createClient();

  const [definitionsResult, rangesResult, latestResult] = await Promise.all([
    supabase
      .from("metric_definitions")
      .select("*")
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("metric_reference_ranges").select("*"),
    supabase.rpc("latest_metrics"),
  ]);

  const definitions = definitionsResult.data ?? [];
  const ranges = rangesResult.data ?? [];
  const latest = (latestResult.data ?? []) as LatestMetric[];

  const latestByCode = new Map(latest.map((row) => [row.metric_code, row]));
  const rangesByCode = new Map<string, MetricReferenceRange[]>();
  for (const range of ranges) {
    const list = rangesByCode.get(range.metric_code) ?? [];
    list.push(range);
    rangesByCode.set(range.metric_code, list);
  }

  const subject = {
    sex: profile.sex,
    age: approximateAge(profile.birth_year),
  };

  return definitions.map((definition) => {
    const latestValue = latestByCode.get(definition.code) ?? null;
    const range = resolveReferenceRange(rangesByCode.get(definition.code) ?? [], subject);

    return {
      definition,
      latest: latestValue,
      range,
      status: latestValue ? evaluateMetric(latestValue.value, range) : "unknown",
    };
  });
}

export interface MetricDetail {
  definition: MetricDefinition;
  range: MetricReferenceRange | null;
  records: HealthMetric[];
}

/**
 * 지표 상세 화면 데이터.
 *
 * 기록이 없는 지표도 정의는 존재하므로, 정의가 없을 때만 null 을 돌려준다.
 */
export async function getMetricDetail(
  code: string,
  profile: ProfileSubject,
  days = 180,
): Promise<MetricDetail | null> {
  const supabase = await createClient();

  const since = new Date();
  since.setDate(since.getDate() - days);

  const [definitionResult, rangesResult, recordsResult] = await Promise.all([
    supabase.from("metric_definitions").select("*").eq("code", code).maybeSingle(),
    supabase.from("metric_reference_ranges").select("*").eq("metric_code", code),
    supabase
      .from("health_metrics")
      .select("*")
      .eq("metric_code", code)
      .gte("measured_at", since.toISOString())
      .order("measured_at", { ascending: false })
      .limit(500),
  ]);

  if (!definitionResult.data) return null;

  const range = resolveReferenceRange(rangesResult.data ?? [], {
    sex: profile.sex,
    age: approximateAge(profile.birth_year),
  });

  return {
    definition: definitionResult.data,
    range,
    records: recordsResult.data ?? [],
  };
}
