import Link from "next/link";
import { redirect } from "next/navigation";

import type { MealType } from "@/lib/db/types";
import { isFoodApiConfigured } from "@/lib/food/search";
import { createClient } from "@/lib/supabase/server";

import { MealForm } from "./meal-form";

export const metadata = { title: "식단 기록" };

/** 지금 시각으로 끼니를 추정한다. 대부분 맞으므로 탭 한 번을 아낀다. */
function guessMealType(hour: number): MealType {
  if (hour < 10) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

export default async function NewMealPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();

  const timezone = profile?.timezone ?? "Asia/Seoul";
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );

  return (
    <>
      <Link href="/meals" className="text-sm text-muted hover:text-foreground">
        ← 식단
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">식단 기록</h1>

      {!isFoodApiConfigured() ? (
        <p className="mt-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          음식 데이터베이스가 아직 연결되지 않았습니다. 직접 입력으로 기록하시면 되고,
          한 번 입력한 음식은 &lsquo;내 음식&rsquo;에 저장되어 다음부터 검색됩니다.
        </p>
      ) : null}

      <div className="mt-6">
        <MealForm defaultMealType={guessMealType(hour)} />
      </div>
    </>
  );
}
