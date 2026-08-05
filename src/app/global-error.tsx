"use client";

/**
 * 루트 레이아웃까지 무너졌을 때의 마지막 화면.
 *
 * 이 컴포넌트는 자신의 <html>/<body> 를 직접 그린다 — 레이아웃이 죽은
 * 상황이라 물려받을 것이 없다. 같은 이유로 globals.css 의 토큰도 믿을 수
 * 없어 색을 인라인으로 둔다. 여기서 CSS 를 기대하면 흰 화면이 된다.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif',
          color: "#0f172a",
          background: "#ffffff",
        }}
      >
        <div style={{ maxWidth: "24rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
            앱을 불러오지 못했습니다
          </h1>
          <p
            style={{
              marginTop: "0.75rem",
              fontSize: "0.875rem",
              lineHeight: 1.7,
              color: "#556270",
            }}
          >
            새로고침해도 같은 화면이 나오면 잠시 후 다시 접속해 주세요.
          </p>
          {/* next/link 를 쓰지 않는다. 루트 레이아웃이 무너진 상태라
              클라이언트 라우팅으로 넘어가면 같은 깨진 트리로 돌아온다.
              전체 새로고침이 유일하게 확실한 탈출구다. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              display: "inline-block",
              marginTop: "1.5rem",
              padding: "0.625rem 1rem",
              borderRadius: "0.5rem",
              background: "#0d9488",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            처음으로
          </a>

          {error.digest ? (
            <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: "#556270" }}>
              문의하실 때 이 번호를 알려 주세요: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
