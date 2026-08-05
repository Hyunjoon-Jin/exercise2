#!/usr/bin/env node
/**
 * 앱 아이콘 생성.
 *
 *   npm run icons
 *
 * SVG 하나를 원본으로 두고 필요한 크기의 PNG 를 뽑는다. 디자인을 고치면
 * 이 파일의 SVG 만 바꾸고 다시 돌리면 된다 — 여러 PNG 를 손으로 맞추다
 * 하나만 옛 버전으로 남는 사고를 막기 위함.
 *
 * sharp 는 Next.js 가 이미지 최적화에 쓰는 의존성이라 따로 설치하지 않는다.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");

const BRAND = "#0d9488";

/**
 * 심박 라인이 지나가는 사각형.
 *
 * 홈 화면에서는 20px 남짓으로 줄어든다. 선을 굵게 잡고 요소를 하나만 둔다 —
 * 작은 크기에서 형태가 뭉개지면 아이콘이 아니라 색 덩어리가 된다.
 */
function markup({ padding = 0 } = {}) {
  const scale = (512 - padding * 2) / 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${padding > 0 ? 0 : 112}" fill="${BRAND}"/>
  <g transform="translate(${padding} ${padding}) scale(${scale})">
    <path d="M64 268 H164 L200 176 L256 348 L308 244 L344 268 H448"
          fill="none" stroke="#ffffff" stroke-width="34"
          stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

/**
 * maskable 아이콘은 플랫폼이 원·둥근사각 등으로 잘라낸다. 안전 영역이
 * 중앙 80% 뿐이라 여백 없이 만들면 선 끝이 잘린다.
 */
const TARGETS = [
  { file: "icon-192.png", size: 192, svg: markup() },
  { file: "icon-512.png", size: 512, svg: markup() },
  { file: "icon-maskable-512.png", size: 512, svg: markup({ padding: 64 }) },
  { file: "apple-touch-icon.png", size: 180, svg: markup({ padding: 24 }) },
];

mkdirSync(PUBLIC, { recursive: true });

for (const target of TARGETS) {
  const png = await sharp(Buffer.from(target.svg))
    .resize(target.size, target.size)
    .png()
    .toBuffer();

  writeFileSync(join(PUBLIC, target.file), png);
  console.log(`${target.file.padEnd(28)} ${target.size}×${target.size}`);
}

// 파비콘용 SVG 도 함께 남긴다. 벡터라 어떤 크기에서도 또렷하다.
writeFileSync(join(PUBLIC, "icon.svg"), markup());
console.log("icon.svg".padEnd(28) + "vector");
