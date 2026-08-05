import type { ReactNode } from "react";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto w-full max-w-2xl px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">건강기록</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
