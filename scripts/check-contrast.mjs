#!/usr/bin/env node
/**
 * 명도 대비 검사 (WCAG 2.1 AA).
 *
 *   npm run a11y:contrast
 *
 * globals.css 의 토큰 값을 직접 읽어 계산한다. 색을 손으로 고르고 눈으로
 * 확인하면 "그럭저럭 읽히네"에서 멈추는데, 4.5:1 은 눈으로 판별되지 않는
 * 경계다. 여기서 떨어지면 커밋 전에 알게 된다.
 *
 * 검사 대상은 실제로 화면에서 쓰이는 조합만이다. 쓰지 않는 조합까지 넣으면
 * 통과시키려고 색을 비트는 일이 생긴다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSS = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

/** 본문(4.5:1)과 큰 글씨(3:1)의 기준. 이 앱의 보조 텍스트는 대부분 12px 다. */
const AA_NORMAL = 4.5;
const AA_LARGE = 3;

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;

  const r = channel(parseInt(full.slice(0, 2), 16));
  const g = channel(parseInt(full.slice(2, 4), 16));
  const b = channel(parseInt(full.slice(4, 6), 16));

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * globals.css 에서 테마별 토큰을 뽑는다.
 *
 * :root 블록이 라이트, prefers-color-scheme: dark 안의 :root 가 다크다.
 * 순서대로 나타나므로 두 번째 :root 를 다크로 본다.
 */
function readThemes(css) {
  const blocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((match) => match[1]);
  if (blocks.length < 2) {
    throw new Error("globals.css 에서 :root 블록 두 개(라이트/다크)를 찾지 못했습니다.");
  }

  const parse = (block) => {
    const tokens = {};
    for (const [, name, value] of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8});/g)) {
      tokens[name] = value;
    }
    return tokens;
  };

  const light = parse(blocks[0]);
  // 다크는 라이트를 덮어쓰는 형태라 병합해야 빠진 토큰이 없다.
  return { light, dark: { ...light, ...parse(blocks[1]) } };
}

/** [전경, 배경, 설명, 기준] */
const PAIRS = [
  ["foreground", "background", "본문", AA_NORMAL],
  ["foreground", "surface", "본문(카드 위)", AA_NORMAL],
  ["muted", "background", "보조 텍스트", AA_NORMAL],
  ["muted", "surface", "보조 텍스트(카드 위)", AA_NORMAL],
  ["brand-text", "background", "링크", AA_NORMAL],
  ["brand-text", "surface", "링크(카드 위)", AA_NORMAL],
  ["brand-strong", "brand-soft", "선택된 항목", AA_NORMAL],
  ["status-normal", "background", "정상 표시", AA_NORMAL],
  ["status-caution", "background", "주의 표시", AA_NORMAL],
  ["status-out", "background", "범위 밖 표시", AA_NORMAL],
  ["status-unknown", "background", "판정 없음 표시", AA_NORMAL],
  ["status-caution", "surface", "주의 표시(카드 위)", AA_NORMAL],
  ["status-out", "surface", "범위 밖 표시(카드 위)", AA_NORMAL],
  // 컨트롤 테두리는 인접 색과 3:1 이 필요하다 (WCAG 1.4.11 비텍스트 대비).
  // --border 는 카드 외곽선·구분선 장식이라 기준 대상이 아니다.
  ["border-strong", "background", "입력 테두리", AA_LARGE],
  ["border-strong", "surface", "입력 테두리(카드 위)", AA_LARGE],
  // 포커스 표시도 3:1 (WCAG 2.4.11).
  ["brand-text", "background", "포커스 링", AA_LARGE],
  ["brand-text", "surface", "포커스 링(카드 위)", AA_LARGE],
];

const themes = readThemes(CSS);
let failed = 0;

for (const [themeName, tokens] of Object.entries(themes)) {
  console.log(`\n[${themeName === "light" ? "라이트" : "다크"}]`);

  for (const [fg, bg, label, threshold] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) {
      console.log(`  ?  ${label.padEnd(22)} 토큰 없음 (${fg} / ${bg})`);
      failed += 1;
      continue;
    }

    const value = ratio(tokens[fg], tokens[bg]);
    const ok = value >= threshold;
    if (!ok) failed += 1;

    console.log(
      `  ${ok ? "✓" : "✗"}  ${label.padEnd(22)} ${value.toFixed(2)}:1` +
        `  (기준 ${threshold}:1, ${tokens[fg]} on ${tokens[bg]})`,
    );
  }
}

if (failed > 0) {
  console.error(`\n${failed}개 조합이 기준에 못 미칩니다.`);
  process.exit(1);
}

console.log("\n모든 조합이 WCAG AA 를 만족합니다.");
