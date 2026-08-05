import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { WorkoutForm } from "./workout-form";

export const metadata = { title: "운동 기록" };

export default async function NewWorkoutPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [exercisesResult, weightResult] = await Promise.all([
    supabase.from("exercises").select("*").order("category").order("met"),
    // 소모 칼로리 추정을 미리 보여주기 위해 최근 체중을 읽는다.
    supabase
      .from("health_metrics")
      .select("value")
      .eq("metric_code", "WEIGHT")
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <>
      <Link href="/workouts" className="text-sm text-muted hover:text-foreground">
        ← 운동
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">운동 기록</h1>

      <div className="mt-6">
        <WorkoutForm
          exercises={exercisesResult.data ?? []}
          latestWeightKg={weightResult.data ? Number(weightResult.data.value) : null}
        />
      </div>
    </>
  );
}
