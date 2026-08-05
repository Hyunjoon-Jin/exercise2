import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isConsentExempt, isPublicPath } from "./paths.ts";

describe("isPublicPath", () => {
  it("공개 경로를 허용한다", () => {
    assert.equal(isPublicPath("/"), true);
    assert.equal(isPublicPath("/login"), true);
    assert.equal(isPublicPath("/signup"), true);
    assert.equal(isPublicPath("/legal/terms"), true);
    assert.equal(isPublicPath("/legal/privacy"), true);
    assert.equal(isPublicPath("/auth/callback"), true);
  });

  it("오프라인 안내는 공개다 — 서비스 워커가 설치 때 미리 받는다", () => {
    assert.equal(isPublicPath("/offline"), true);
  });

  it("건강 화면은 전부 막는다", () => {
    for (const path of [
      "/today",
      "/metrics",
      "/metrics/WEIGHT",
      "/sleep",
      "/medications",
      "/meals",
      "/meals/new",
      "/workouts",
      "/checkups",
      "/checkups/abc-123",
      "/reports",
      "/settings",
      "/more",
      "/onboarding/consent",
    ]) {
      assert.equal(isPublicPath(path), false, `${path} 가 열려 있다`);
    }
  });

  it("접두사가 겹치는 경로를 공개로 착각하지 않는다", () => {
    // startsWith 만 쓰면 여기서 뚫린다. "/" 로 경계를 끊어야 한다.
    assert.equal(isPublicPath("/legalese"), false);
    assert.equal(isPublicPath("/logins"), false);
    assert.equal(isPublicPath("/offline-data"), false);
    assert.equal(isPublicPath("/signup-bonus"), false);
    assert.equal(isPublicPath("/authorize"), false);
  });

  it('"/" 가 목록에 있어도 모든 경로가 열리지는 않는다', () => {
    // "/" 는 startsWith("/") 로 전부 걸린다. 그래서 정확 일치와 "/" 경계
    // 비교를 쓴다 — 이 테스트가 그 구현을 고정한다.
    assert.equal(isPublicPath("/today"), false);
  });

  it("API 라우트는 공개가 아니다", () => {
    assert.equal(isPublicPath("/api/checkups/1/extract"), false);
  });
});

describe("isConsentExempt", () => {
  it("동의 절차 자체와 약관은 통과시킨다", () => {
    assert.equal(isConsentExempt("/onboarding/consent"), true);
    assert.equal(isConsentExempt("/onboarding/profile"), true);
    assert.equal(isConsentExempt("/legal/terms"), true);
    assert.equal(isConsentExempt("/auth/callback"), true);
    assert.equal(isConsentExempt("/offline"), true);
  });

  it("건강 데이터가 보이는 화면은 동의 전에 열리지 않는다", () => {
    // 민감정보는 별도 동의 없이 수집·표시할 수 없다. 이 게이트가 그 경계다.
    for (const path of ["/today", "/metrics", "/checkups", "/reports", "/settings"]) {
      assert.equal(isConsentExempt(path), false, `${path} 가 동의 전에 열린다`);
    }
  });

  it("접두사가 겹쳐도 통과시키지 않는다", () => {
    assert.equal(isConsentExempt("/onboarding-tips"), false);
    assert.equal(isConsentExempt("/legalese"), false);
  });
});
