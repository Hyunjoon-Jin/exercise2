/**
 * 접근 제어 경로 규칙.
 *
 * proxy 에서 쓰는 판정을 따로 떼어 둔다. 여기가 틀리면 건강 화면이 로그인
 * 없이 열리거나, 동의 게이트를 우회할 수 있다 — 조용히 통과하는 종류의
 * 버그라 테스트로 붙잡아 두는 편이 낫다.
 */

/**
 * 로그인 없이 접근 가능한 경로.
 *
 * /offline 이 여기 있어야 하는 이유: 서비스 워커가 설치 시점에 이 페이지를
 * 미리 받아 둔다. 로그인 전이라 로그인으로 리다이렉트되면 addAll 이 실패하고
 * 워커 설치 자체가 무산된다 — 알림도 오프라인 안내도 통째로 사라진다.
 */
export const PUBLIC_PATHS = ["/", "/login", "/signup", "/auth", "/legal", "/offline"];

/** 동의를 아직 마치지 않아도 접근 가능한 경로 (동의 절차 자체 + 로그아웃) */
export const CONSENT_EXEMPT_PATHS = ["/onboarding", "/auth", "/legal", "/offline"];

/**
 * 경로가 목록에 속하는가.
 *
 * 단순 startsWith 로 비교하면 "/legalese" 가 "/legal" 에 걸린다. 경계를
 * 슬래시로 끊어 하위 경로만 인정한다.
 */
function matches(pathname: string, paths: string[]): boolean {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function isPublicPath(pathname: string): boolean {
  // "/" 는 목록에 있지만 startsWith("/") 로는 모든 경로가 걸린다.
  // matches 가 정확히 일치하거나 "//" 로 시작할 때만 인정하므로 문제없다.
  return matches(pathname, PUBLIC_PATHS);
}

export function isConsentExempt(pathname: string): boolean {
  return matches(pathname, CONSENT_EXEMPT_PATHS);
}
