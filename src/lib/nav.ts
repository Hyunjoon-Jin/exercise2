import {
  Activity,
  CalendarCheck,
  ClipboardList,
  Dumbbell,
  FileHeart,
  MoreHorizontal,
  Moon,
  Pill,
  Settings,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** 사이드바(데스크톱)에 노출하는 전체 메뉴 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/today", label: "오늘", icon: CalendarCheck },
  { href: "/metrics", label: "기록", icon: Activity },
  { href: "/sleep", label: "수면", icon: Moon },
  { href: "/medications", label: "복약", icon: Pill },
  { href: "/meals", label: "식단", icon: UtensilsCrossed },
  { href: "/workouts", label: "운동", icon: Dumbbell },
  { href: "/checkups", label: "검진", icon: FileHeart },
  { href: "/reports", label: "리포트", icon: ClipboardList },
  { href: "/settings", label: "설정", icon: Settings },
];

/**
 * 모바일 하단 탭.
 *
 * 다섯 칸이 한 손으로 누를 수 있는 한계다. 매일 쓰는 네 개만 두고
 * 나머지는 "더보기"로 뺀다.
 */
export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { href: "/today", label: "오늘", icon: CalendarCheck },
  { href: "/metrics", label: "기록", icon: Activity },
  { href: "/sleep", label: "수면", icon: Moon },
  { href: "/medications", label: "복약", icon: Pill },
  { href: "/more", label: "더보기", icon: MoreHorizontal },
];

/** 더보기 화면에 담을 항목 — 하단 탭에 없는 나머지 */
export const MORE_NAV_ITEMS: NavItem[] = NAV_ITEMS.filter(
  (item) => !BOTTOM_NAV_ITEMS.some((primary) => primary.href === item.href),
);
