import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  describeDelta,
  formatDuration,
  goalPercent,
  parseWeekOffset,
  MAX_WEEK_OFFSET,
} from "./format.ts";

describe("parseWeekOffset", () => {
  it("숫자를 그대로 받는다", () => {
    assert.equal(parseWeekOffset("3"), 3);
  });

  it("없으면 이번 주", () => {
    assert.equal(parseWeekOffset(undefined), 0);
    assert.equal(parseWeekOffset(""), 0);
  });

  it("음수는 0 으로 — 미래 주는 없다", () => {
    assert.equal(parseWeekOffset("-5"), 0);
  });

  it("상한을 넘기지 않는다", () => {
    assert.equal(parseWeekOffset("9999"), MAX_WEEK_OFFSET);
  });

  it("숫자가 아니면 0", () => {
    assert.equal(parseWeekOffset("지난주"), 0);
    assert.equal(parseWeekOffset("NaN"), 0);
  });

  it("소수는 버린다", () => {
    assert.equal(parseWeekOffset("2.9"), 2);
  });

  it("배열로 오면 첫 값만 본다", () => {
    // ?w=1&w=2 로 오는 경우. 뒤엣것을 쓰면 링크와 화면이 어긋난다.
    assert.equal(parseWeekOffset(["1", "2"]), 1);
  });
});

describe("describeDelta", () => {
  it("증가·감소를 방향으로 돌려준다", () => {
    assert.deepEqual(describeDelta(70, 69), { direction: "up", amount: 1 });
    assert.deepEqual(describeDelta(69, 70), { direction: "down", amount: 1 });
  });

  it("비교 대상이 없으면 null — 0 으로 취급하지 않는다", () => {
    // 지난주에 기록이 아예 없던 경우. "지난주 대비 -2000kcal" 은 거짓말이다.
    assert.equal(describeDelta(2000, null), null);
    assert.equal(describeDelta(2000, undefined), null);
    assert.equal(describeDelta(null, 2000), null);
  });

  it("무시할 만한 차이는 flat", () => {
    assert.deepEqual(describeDelta(69.62, 69.6), { direction: "flat", amount: 0 });
  });

  it("epsilon 을 넘으면 방향이 잡힌다", () => {
    const delta = describeDelta(69.7, 69.6);
    assert.equal(delta?.direction, "up");
    assert.ok(Math.abs((delta?.amount ?? 0) - 0.1) < 1e-9);
  });

  it("0 과 null 을 구분한다", () => {
    // 운동 0분은 "안 했다"는 기록이지 "기록이 없다"가 아니다.
    assert.deepEqual(describeDelta(0, 90), { direction: "down", amount: 90 });
  });

  it("NaN·Infinity 는 비교하지 않는다", () => {
    assert.equal(describeDelta(Number.NaN, 1), null);
    assert.equal(describeDelta(1, Number.POSITIVE_INFINITY), null);
  });
});

describe("formatDuration", () => {
  it("시간과 분으로 나눈다", () => {
    assert.equal(formatDuration(400), "6시간 40분");
    assert.equal(formatDuration(60), "1시간 0분");
    assert.equal(formatDuration(45), "0시간 45분");
  });

  it("반올림한다", () => {
    assert.equal(formatDuration(399.6), "6시간 40분");
  });

  it("음수는 0 으로", () => {
    assert.equal(formatDuration(-10), "0시간 0분");
  });
});

describe("goalPercent", () => {
  it("달성률을 반올림해 돌려준다", () => {
    assert.equal(goalPercent(90, 150), 60);
  });

  it("목표를 넘어도 자르지 않는다", () => {
    // 목표 초과를 100% 로 깎으면 얼마나 더 했는지가 사라진다.
    assert.equal(goalPercent(300, 150), 200);
  });

  it("목표가 없거나 0 이면 null", () => {
    assert.equal(goalPercent(90, null), null);
    assert.equal(goalPercent(90, 0), null);
  });
});
