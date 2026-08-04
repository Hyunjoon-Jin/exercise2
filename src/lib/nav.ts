import {
  Activity,
  CalendarCheck,
  ClipboardList,
  Dumbbell,
  FileHeart,
  Pill,
  Settings,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** 모바일 하단 탭에 노출할지. 화면이 좁으므로 5개로 제한한다. */
  primary: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/today", label: "오늘", icon: CalendarCheck, primary: true },
  { href: "/metrics", label: "기록", icon: Activity, primary: true },
  { href: "/meals", label: "식단", icon: UtensilsCrossed, primary: true },
  { href: "/workouts", label: "운동", icon: Dumbbell, primary: false },
  { href: "/medications", label: "복약", icon: Pill, primary: true },
  { href: "/checkups", label: "검진", icon: FileHeart, primary: true },
  { href: "/reports", label: "리포트", icon: ClipboardList, primary: false },
  { href: "/settings", label: "설정", icon: Settings, primary: false },
];

export const PRIMARY_NAV_ITEMS = NAV_ITEMS.filter((item) => item.primary);
