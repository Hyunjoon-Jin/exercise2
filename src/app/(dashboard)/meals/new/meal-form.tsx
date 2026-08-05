"use client";

import { Plus, Search, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import type { MealType } from "@/lib/db/types";
import type { FoodSearchHit } from "@/lib/food/search";
import { EMPTY_FORM_STATE } from "@/lib/forms";

import { createMeal, searchFoodAction } from "../actions";

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "아침" },
  { value: "lunch", label: "점심" },
  { value: "dinner", label: "저녁" },
  { value: "snack", label: "간식" },
];

interface DraftItem {
  key: string;
  foodCode: string | null;
  customName: string | null;
  displayName: string;
  quantity: number;
  unit: string;
  /** 기준량 1인분 기준 영양성분. 저장 시 quantity 를 곱한다. */
  perServing: { kcal: number | null; carbG: number | null; proteinG: number | null; fatG: number | null };
  servingLabel: string;
  saveAsUserFood: boolean;
}

const FIELD =
  "w-full rounded-lg border border-border-strong bg-background px-3 py-2.5 text-base " +
  "placeholder:text-muted focus:border-brand-500";

function nowLocalInput(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function scale(value: number | null, quantity: number): number | null {
  return value === null ? null : Math.round(value * quantity * 10) / 10;
}

export function MealForm({ defaultMealType }: { defaultMealType: MealType }) {
  const [state, formAction, pending] = useActionState(createMeal, EMPTY_FORM_STATE);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [query, setQuery] = useState("");
  // 어떤 검색어의 결과인지 함께 들고 있는다. 검색어가 바뀐 뒤 이전 결과가
  // 남아 있으면 엉뚱한 음식을 담게 되므로, 렌더에서 검색어와 대조해 거른다.
  const [search, setSearch] = useState<{
    query: string;
    hits: FoodSearchHit[];
    note: string | null;
  }>({ query: "", hits: [], note: null });
  const [searching, startSearch] = useTransition();
  const [manualOpen, setManualOpen] = useState(false);
  const eatenAtRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (eatenAtRef.current && !eatenAtRef.current.value) {
      eatenAtRef.current.value = nowLocalInput();
    }
  }, []);

  // 입력할 때마다 서버를 부르면 공공 API 쿼터가 빨리 닳는다. 350ms 쉬고 나서 조회.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 1) return;

    const timer = setTimeout(() => {
      startSearch(async () => {
        const outcome = await searchFoodAction(trimmed);
        setSearch({
          query: trimmed,
          hits: outcome.hits,
          note:
            outcome.apiError ??
            (outcome.hits.length === 0
              ? "검색 결과가 없습니다. 직접 입력해 보세요."
              : null),
        });
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  // 지금 입력된 검색어의 결과일 때만 보여준다.
  const fresh = search.query === query.trim() && query.trim().length > 0;
  const results = fresh ? search.hits : [];
  const searchNote = fresh ? search.note : null;

  function addFromSearch(hit: FoodSearchHit) {
    setItems((prev) => [
      ...prev,
      {
        key: `${hit.code}-${Date.now()}`,
        foodCode: hit.origin === "user" ? null : hit.code,
        customName: hit.origin === "user" ? hit.name : null,
        displayName: hit.name,
        quantity: 1,
        unit: hit.servingUnit,
        perServing: {
          kcal: hit.kcal,
          carbG: hit.carbG,
          proteinG: hit.proteinG,
          fatG: hit.fatG,
        },
        servingLabel: `${hit.servingSize}${hit.servingUnit}`,
        saveAsUserFood: false,
      },
    ]);
    // 검색어를 비우면 결과도 함께 가려진다 (fresh 판정).
    setQuery("");
  }

  function addManual(form: HTMLFormElement) {
    const data = new FormData(form);
    const name = String(data.get("m_name") ?? "").trim();
    if (!name) return;

    const num = (key: string) => {
      const raw = String(data.get(key) ?? "").trim();
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    };

    setItems((prev) => [
      ...prev,
      {
        key: `manual-${Date.now()}`,
        foodCode: null,
        customName: name,
        displayName: name,
        quantity: 1,
        unit: "serving",
        perServing: {
          kcal: num("m_kcal"),
          carbG: num("m_carb"),
          proteinG: num("m_protein"),
          fatG: num("m_fat"),
        },
        servingLabel: "1인분",
        saveAsUserFood: data.get("m_save") === "on",
      },
    ]);

    form.reset();
    setManualOpen(false);
  }

  function updateQuantity(key: string, quantity: number) {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, quantity } : item)),
    );
  }

  const totals = items.reduce(
    (acc, item) => ({
      kcal: acc.kcal + (scale(item.perServing.kcal, item.quantity) ?? 0),
      carbG: acc.carbG + (scale(item.perServing.carbG, item.quantity) ?? 0),
      proteinG: acc.proteinG + (scale(item.perServing.proteinG, item.quantity) ?? 0),
      fatG: acc.fatG + (scale(item.perServing.fatG, item.quantity) ?? 0),
    }),
    { kcal: 0, carbG: 0, proteinG: 0, fatG: 0 },
  );

  // 서버로는 quantity 를 곱한 실제 섭취량을 보낸다.
  const payload = JSON.stringify(
    items.map((item) => ({
      foodCode: item.foodCode,
      customName: item.customName,
      quantity: item.quantity,
      unit: item.unit,
      kcal: scale(item.perServing.kcal, item.quantity),
      carbG: scale(item.perServing.carbG, item.quantity),
      proteinG: scale(item.perServing.proteinG, item.quantity),
      fatG: scale(item.perServing.fatG, item.quantity),
      saveAsUserFood: item.saveAsUserFood,
    })),
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="tz_offset" value={-new Date().getTimezoneOffset()} readOnly />
      <input type="hidden" name="items" value={payload} readOnly />

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">끼니</legend>
        <div className="flex gap-1.5">
          {MEAL_TYPES.map((type) => (
            <label
              key={type.value}
              className="flex flex-1 cursor-pointer items-center justify-center rounded-lg border
                         border-border py-2.5 text-sm transition-colors
                         has-[:checked]:border-brand-500 has-[:checked]:bg-brand-soft
                         has-[:checked]:font-medium has-[:checked]:text-brand-strong"
            >
              <input
                type="radio"
                name="meal_type"
                value={type.value}
                defaultChecked={type.value === defaultMealType}
                className="sr-only"
              />
              {type.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="eaten_at" className="block text-sm font-medium">
          식사 시각
        </label>
        <input ref={eatenAtRef} id="eaten_at" name="eaten_at" type="datetime-local" className={FIELD} />
      </div>

      {/* ---------------- 음식 검색 ---------------- */}
      <div className="space-y-2">
        <label htmlFor="food_query" className="block text-sm font-medium">
          음식 추가
        </label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <input
            id="food_query"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="음식 이름으로 검색"
            autoComplete="off"
            className={`${FIELD} pl-9`}
          />
        </div>

        {searching ? <p className="text-xs text-muted">검색 중…</p> : null}

        {results.length > 0 ? (
          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {results.map((hit) => (
              <li key={`${hit.origin}-${hit.code}`}>
                <button
                  type="button"
                  onClick={() => addFromSearch(hit)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left
                             transition-colors hover:bg-surface"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {hit.name}
                      {hit.origin === "user" ? (
                        <span className="ml-1.5 text-[11px] text-brand-text">내 음식</span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted">
                      {hit.servingSize}
                      {hit.servingUnit} 기준
                      {hit.kcal !== null ? ` · ${hit.kcal}kcal` : ""}
                    </span>
                  </span>
                  <Plus aria-hidden className="size-4 shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {searchNote ? <p className="text-xs text-muted">{searchNote}</p> : null}

        {!manualOpen ? (
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="w-full rounded-lg border border-dashed border-border py-2 text-sm
                       text-muted transition-colors hover:bg-surface"
          >
            직접 입력하기
          </button>
        ) : (
          // 검색으로 못 찾는 음식(집밥 등)을 위한 경로. 폼 중첩은 불가능하므로
          // div 안에서 값을 읽어 항목으로 추가한다.
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">직접 입력</h3>
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                aria-label="직접 입력 닫기"
                className="text-muted hover:text-foreground"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>

            <ManualEntry onAdd={addManual} />
          </div>
        )}
      </div>

      {/* ---------------- 담은 음식 ---------------- */}
      {items.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">담은 음식</h2>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.map((item) => (
              <li key={item.key} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.displayName}</p>
                  <p className="text-xs text-muted">
                    {item.servingLabel} × {item.quantity}
                    {item.perServing.kcal !== null
                      ? ` · ${scale(item.perServing.kcal, item.quantity)}kcal`
                      : ""}
                  </p>
                </div>

                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={item.quantity}
                  onChange={(e) => updateQuantity(item.key, Number(e.target.value) || 1)}
                  aria-label={`${item.displayName} 수량`}
                  className="tabular w-16 shrink-0 rounded-lg border border-border-strong bg-background
                             px-2 py-1.5 text-sm"
                />

                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
                  aria-label={`${item.displayName} 제거`}
                  className="shrink-0 text-muted transition-colors hover:text-status-out"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>

          <div className="rounded-lg bg-surface px-4 py-3">
            <p className="tabular text-sm font-medium">
              합계 {Math.round(totals.kcal)}kcal
            </p>
            <p className="tabular mt-0.5 text-xs text-muted">
              탄수 {totals.carbG.toFixed(1)}g · 단백 {totals.proteinG.toFixed(1)}g · 지방{" "}
              {totals.fatG.toFixed(1)}g
            </p>
          </div>
        </div>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm text-status-out">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || items.length === 0}
        className="w-full rounded-lg bg-brand-600 px-4 py-3 font-medium text-white
                   transition-colors hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "저장 중…" : "기록하기"}
      </button>
    </form>
  );
}

/** 직접 입력 칸. 폼 안에 폼을 넣을 수 없어 별도 컴포넌트로 값만 모은다. */
function ManualEntry({ onAdd }: { onAdd: (form: HTMLFormElement) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  function handleAdd() {
    const container = ref.current;
    if (!container) return;

    // 컨테이너 안의 입력들을 임시 form 에 담아 FormData 로 읽는다.
    const temp = document.createElement("form");
    for (const input of container.querySelectorAll("input")) {
      const clone = input.cloneNode(true) as HTMLInputElement;
      clone.value = input.value;
      clone.checked = input.checked;
      temp.appendChild(clone);
    }
    onAdd(temp);

    for (const input of container.querySelectorAll("input")) {
      if (input.type === "checkbox") input.checked = false;
      else input.value = "";
    }
  }

  return (
    <div ref={ref} className="space-y-3">
      <input name="m_name" type="text" placeholder="음식 이름" className={FIELD} />

      <div className="grid grid-cols-2 gap-2">
        <input name="m_kcal" type="number" step="any" min="0" placeholder="칼로리 (kcal)" className={`tabular ${FIELD}`} />
        <input name="m_carb" type="number" step="any" min="0" placeholder="탄수화물 (g)" className={`tabular ${FIELD}`} />
        <input name="m_protein" type="number" step="any" min="0" placeholder="단백질 (g)" className={`tabular ${FIELD}`} />
        <input name="m_fat" type="number" step="any" min="0" placeholder="지방 (g)" className={`tabular ${FIELD}`} />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
        <input name="m_save" type="checkbox" className="size-4 accent-brand-600" />
        내 음식으로 저장 (다음에 검색됨)
      </label>

      <button
        type="button"
        onClick={handleAdd}
        className="w-full rounded-lg border border-border py-2 text-sm font-medium
                   transition-colors hover:bg-surface"
      >
        추가
      </button>
    </div>
  );
}
