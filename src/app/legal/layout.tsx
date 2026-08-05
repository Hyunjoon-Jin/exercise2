import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 약관·처리방침 레이아웃.
 *
 * 로그인 없이 볼 수 있어야 한다 (proxy 의 PUBLIC_PATHS). 가입 전에 무엇에
 * 동의하는지 읽을 수 없다면 그 동의는 유효하지 않다.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-base font-semibold tracking-tight">
            건강기록
          </Link>
          <nav aria-label="약관" className="flex gap-3 text-sm">
            <Link href="/legal/terms" className="text-muted hover:text-foreground">
              이용약관
            </Link>
            <Link href="/legal/privacy" className="text-muted hover:text-foreground">
              개인정보 처리방침
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
