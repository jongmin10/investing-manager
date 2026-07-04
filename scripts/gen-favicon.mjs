/**
 * 브랜드 파비콘(favicon.ico) 생성
 *
 * src/app/icon.svg(나침반 타일)를 16·32·48px PNG로 래스터화해 멀티해상도 ICO로 묶는다.
 * 데스크톱 Chrome "바로가기 만들기"·브라우저 favicon 캐시가 /favicon.ico(래스터)를
 * 우선 사용하므로, SVG 파비콘만으로는 부족해 별도로 생성해 커밋한다.
 *
 * 아이콘 디자인을 바꾸면(icon.svg / _brand/compass.tsx) 이 스크립트를 다시 실행:
 *   node scripts/gen-favicon.mjs
 */
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "src/app/icon.svg"));

// favicon.ico는 탭·바로가기 fallback용으로 작게 유지(BMP 저장이라 큰 사이즈는 비대).
// 데스크톱 바로가기의 고해상도 아이콘은 apple-icon(180)·manifest PNG(192/512)에서 나온다.
const sizes = [16, 32, 48, 64];
const pngs = await Promise.all(
  sizes.map((s) =>
    sharp(svg, { density: 384 }).resize(s, s, { fit: "contain" }).png().toBuffer()
  )
);

const ico = await pngToIco(pngs);
const out = join(root, "src/app/favicon.ico");
writeFileSync(out, ico);
console.log(`✓ favicon.ico 생성 (${sizes.join("/")}px, ${ico.length} bytes) → ${out}`);
