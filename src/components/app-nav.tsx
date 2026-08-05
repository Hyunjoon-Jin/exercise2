"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BOTTOM_NAV_ITEMS, NAV_ITEMS } from "@/lib/nav";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** 데스크톱 사이드바 */
export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="주 메뉴"
      className="hidden w-56 shrink-0 border-r border-border md:block"
    >
      <ul className="sticky top-0 space-y-1 p-4">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href as Route}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-brand-soft font-medium text-brand-strong"
                    : "text-muted hover:bg-surface hover:text-foreground"
                }`}
              >
                <Icon aria-hidden className="size-4.5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * 모바일 하단 탭.
 *
 * 한 손 조작 영역에 두고, 홈 인디케이터와 겹치지 않도록
 * safe-area-inset-bottom 만큼 여백을 준다.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="주 메뉴"
      className="sticky bottom-0 z-10 border-t border-border bg-background md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href as Route}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors ${
                  active ? "font-medium text-brand-text" : "text-muted"
                }`}
              >
                <Icon aria-hidden className="size-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
