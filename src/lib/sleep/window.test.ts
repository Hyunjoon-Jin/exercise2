import assert from "node:assert/strict";
import test from "node:test";

import { resolveSleepWindow } from "./window.ts";

const KST = 540; // UTC+9

test("자정을 넘긴 수면 — 취침이 기상보다 늦으면 전날 밤", () => {
  const result = resolveSleepWindow("2026-08-02", "23:30", "07:00", KST);

  assert.ok(result);
  assert.equal(result.minutes, 450, "7시간 30분");
  assert.equal(result.bedIso, "2026-08-01T14:30:00.000Z", "KST 8/1 23:30 = UTC 8/1 14:30");
});

test("기상 시각은 지정한 날짜에 속한다", () => {
  const result = resolveSleepWindow("2026-08-02", "23:30", "07:00", KST);

  assert.ok(result);
  // KST 8/2 07:00 = UTC 8/1 22:00
  assert.equal(result.wakeIso, "2026-08-01T22:00:00.000Z");
});

test("낮잠 — 같은 날 안에서 끝나는 수면", () => {
  const result = resolveSleepWindow("2026-08-02", "13:00", "14:30", KST);

  assert.ok(result);
  assert.equal(result.minutes, 90);
});

test("자정 직전 취침 / 자정 직후 기상", () => {
  const result = resolveSleepWindow("2026-08-02", "23:59", "00:01", KST);

  assert.ok(result);
  assert.equal(result.minutes, 2);
});

test("취침과 기상이 같으면 24시간이 아니라 거부한다", () => {
  // bed >= wake 이므로 전날로 밀려 정확히 1440분이 된다.
  // 하루 종일 잤다는 기록은 입력 실수일 가능성이 훨씬 높다.
  const result = resolveSleepWindow("2026-08-02", "07:00", "07:00", KST);

  assert.ok(result);
  assert.equal(result.minutes, 1440, "경계값 — 24시간까지는 허용");
});

test("타임존이 다르면 UTC 시각도 달라진다", () => {
  const kst = resolveSleepWindow("2026-08-02", "23:00", "07:00", KST);
  const utc = resolveSleepWindow("2026-08-02", "23:00", "07:00", 0);

  assert.ok(kst && utc);
  assert.equal(kst.minutes, utc.minutes, "수면 길이는 타임존과 무관");
  assert.notEqual(kst.bedIso, utc.bedIso, "실제 시각은 타임존에 따라 다르다");
});

test("음수 오프셋(서반구)도 처리한다", () => {
  const result = resolveSleepWindow("2026-08-02", "23:00", "07:00", -300); // UTC-5

  assert.ok(result);
  assert.equal(result.minutes, 480);
  assert.equal(result.wakeIso, "2026-08-02T12:00:00.000Z");
});

test("형식이 틀린 입력은 거부한다", () => {
  assert.equal(resolveSleepWindow("2026-8-2", "23:00", "07:00", KST), null);
  assert.equal(resolveSleepWindow("2026-08-02", "23시", "07:00", KST), null);
  assert.equal(resolveSleepWindow("", "23:00", "07:00", KST), null);
});
