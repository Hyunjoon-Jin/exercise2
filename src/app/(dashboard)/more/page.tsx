import type { Route } from "next";
import Link from "next/link";

import { MORE_NAV_ITEMS } from "@/lib/nav";

export const metadata = { title: "더보기" };

/**
 * 모바일 전용 오버플로 화면.
 *
 * 하단 탭 다섯 칸에 들어가지 못한 메뉴를 모은다. 데스크톱에서는
 * 사이드바에 전부 보이므로 이 화면에 올 일이 거의 없다.
 */
export default function MorePage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">더보기</h1>

      <ul className="mt-6 divide-y divide-border rounded-xl border border-border">
        {MORE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href as Route}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface"
              >
                <Icon aria-hidden className="size-5 text-muted" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
