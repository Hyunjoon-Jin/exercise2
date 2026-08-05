import Link from "next/link";
import { redirect } from "next/navigation";

import { DeleteRecordButton } from "@/components/delete-record-button";
import { createClient } from "@/lib/supabase/server";

import { deleteMeal } from "./actions";

export const metadata = { title: "식단" };

const MEAL_LABEL: Record<string, string> = {
  breakfast: "아침",
  lunch: "점심",
  dinner: "저녁",
  snack: "간식",
};

const TIME_FMT = new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" });
const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "short",
});

function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

export default async function MealsPage() {
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
  const today = todayIn(timezone);

  // 최근 3일치를 한 번에 읽고 화면에서 날짜별로 묶는다.
  const since = new Date();
  since.setDate(since.getDate() - 3);

  const [summaryResult, mealsResult] = await Promise.all([
    supabase.rpc("daily_nutrition_summary", { target_date: today }),
    supabase
      .from("meals")
      .select("*, meal_items(*)")
      .gte("eaten_at", since.toISOString())
      .order("eaten_at", { ascending: false }),
  ]);

  const summary = summaryResult.data?.[0];
  const meals = mealsResult.data ?? [];

  const byDate = new Map<string, typeof meals>();
  for (const meal of meals) {
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
      new Date(meal.eaten_at),
    );
    const list = byDate.get(key) ?? [];
    list.push(meal);
    byDate.set(key, list);
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">식단</h1>
          <p className="mt-2 text-sm text-muted">
            끼니를 기록하면 하루 섭취량이 지표로 함께 쌓입니다.
          </p>
        </div>
        <Link
          href="/meals/new"
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white
                     transition-colors hover:bg-brand-700"
        >
          기록하기
        </Link>
      </div>

      {summary ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">오늘 섭취</h2>
          <p className="tabular mt-1 text-2xl font-semibold">
            {Math.round(summary.kcal)}
            <span className="ml-1 text-sm font-normal text-muted">kcal</span>
          </p>
          <dl className="tabular mt-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted">탄수화물</dt>
              <dd className="font-medium">{Number(summary.carb_g).toFixed(1)}g</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">단백질</dt>
              <dd className="font-medium">{Number(summary.protein_g).toFixed(1)}g</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">지방</dt>
              <dd className="font-medium">{Number(summary.fat_g).toFixed(1)}g</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-semibold">최근 기록</h2>

        {meals.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            아직 기록이 없습니다.
          </p>
        ) : (
          <div className="mt-3 space-y-6">
            {[...byDate.entries()].map(([date, dayMeals]) => (
              <div key={date}>
                <h3 className="text-xs font-medium text-muted">
                  {DATE_FMT.format(new Date(`${date}T00:00:00`))}
                  {date === today ? " · 오늘" : ""}
                </h3>

                <ul className="mt-2 space-y-2">
                  {dayMeals.map((meal) => {
                    const items = meal.meal_items ?? [];
                    const kcal = items.reduce((sum, item) => sum + (item.kcal ?? 0), 0);

                    return (
                      <li key={meal.id} className="rounded-xl border border-border">
                        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                          <p className="text-sm font-medium">
                            {MEAL_LABEL[meal.meal_type] ?? meal.meal_type}
                            <span className="ml-2 text-xs font-normal text-muted">
                              {TIME_FMT.format(new Date(meal.eaten_at))}
                            </span>
                          </p>
                          <div className="flex shrink-0 items-center gap-3">
                            <span className="tabular text-sm">{Math.round(kcal)}kcal</span>
                            <DeleteRecordButton
                              action={deleteMeal}
                              fields={{ id: meal.id }}
                              what={`${DATE_FMT.format(new Date(meal.eaten_at))} ${
                                MEAL_LABEL[meal.meal_type] ?? meal.meal_type
                              } 기록`}
                            />
                          </div>
                        </div>

                        <ul className="px-4 py-2">
                          {items.map((item) => (
                            <li
                              key={item.id}
                              className="flex items-center justify-between gap-3 py-1 text-sm"
                            >
                              <span className="min-w-0 truncate text-muted">
                                {item.custom_name ?? item.food_code}
                                {item.quantity !== 1 ? (
                                  <span className="tabular ml-1.5 text-xs">
                                    × {item.quantity}
                                  </span>
                                ) : null}
                              </span>
                              {item.kcal !== null ? (
                                <span className="tabular shrink-0 text-xs text-muted">
                                  {Math.round(item.kcal)}kcal
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
