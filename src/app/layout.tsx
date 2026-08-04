import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "건강기록",
    template: "%s · 건강기록",
  },
  description:
    "식단·운동·복약·수면·신체수치·건강검진 결과를 한 곳에서 관리하는 개인 건강 기록 도구",
  applicationName: "건강기록",
  // 검색엔진 노출은 서비스 오픈 시점에 결정한다. 그때까지는 색인 금지.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
  width: "device-width",
  initialScale: 1,
  // 모바일에서 입력 필드 포커스 시 확대되는 것을 막되, 사용자 확대는 허용한다.
  maximumScale: 5,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
