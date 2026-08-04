import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { BottomNav, SidebarNav } from "@/components/app-nav";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy 가 이미 막지만, 레이아웃에서도 확인한다.
  // proxy 의 matcher 가 바뀌었을 때 조용히 뚫리는 걸 막기 위한 두 번째 방어선.
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const name = profile?.display_name ?? user.email?.split("@")[0] ?? "사용자";

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className="flex items-center justify-between px-4 py-3 md:px-6">
          <Link href="/today" className="text-base font-semibold tracking-tight">
            건강기록
          </Link>
          <Link
            href="/settings"
            className="rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:text-foreground"
          >
            {name}
          </Link>
        </div>
      </header>

      <div className="flex flex-1">
        <SidebarNav />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
