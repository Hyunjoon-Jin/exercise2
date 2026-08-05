import type { MetadataRoute } from "next";

/**
 * PWA 매니페스트.
 *
 * 홈 화면에 추가했을 때 브라우저 UI 없이 뜨게 한다. 매일 복약을 체크하는
 * 화면이라 주소창을 거치는 두 단계가 그대로 이탈로 이어진다.
 *
 * ⚠️ shortcuts 의 목적지는 인증이 필요한 화면이다. 로그아웃 상태에서 누르면
 *    로그인으로 넘어가는데, 이는 proxy 가 처리한다 (건강 화면은 세션 없이
 *    절대 열리지 않는다).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "건강기록",
    short_name: "건강기록",
    description:
      "식단·운동·복약·수면·신체수치·건강검진 결과를 한 곳에서 관리하는 개인 건강 기록 도구",
    lang: "ko",
    dir: "ltr",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0d9488",
    categories: ["health", "lifestyle", "medical"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "복약 체크", url: "/medications" },
      { name: "수치 기록", url: "/metrics" },
      { name: "식단 기록", url: "/meals/new" },
    ],
  };
}
