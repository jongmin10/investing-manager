import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "scripts/_calc-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto("http://localhost:3000/calculator", { waitUntil: "networkidle" });

// 1) 적립식 → 연금 연결
await page.getByRole("button", { name: "적립식 계산" }).click();
await page.waitForTimeout(400);
const cta = page.getByRole("button", { name: /연금으로 받으면 매달 얼마/ });
const ctaCount = await cta.count();
console.log(`적립식 CTA 존재: ${ctaCount === 1 ? "✓" : "✗ (" + ctaCount + ")"}`);
await cta.first().click();
await page.waitForTimeout(600);

// 연금 탭으로 전환 + 배너 노출 확인
const banner = page.getByText(/에서 가져온 적립금/);
const bannerVisible = await banner.isVisible().catch(() => false);
console.log(`연금 탭 인바운드 배너: ${bannerVisible ? "✓" : "✗"}`);
await page.screenshot({ path: `${OUT}/link-1-accum-to-pension.png`, fullPage: true });

// 2) "적립 단계로" 되돌아가기
await page.getByRole("button", { name: /적립 단계로/ }).click();
await page.waitForTimeout(400);
const backToAccum = await page.getByRole("button", { name: "적립식 계산" }).getAttribute("class");
console.log(`되돌아가기 → 적립식 활성: ${backToAccum?.includes("bg-white") ? "✓" : "✗"}`);

// 3) 목표 역산 → 연금 연결
await page.getByRole("button", { name: "목표 역산" }).click();
await page.waitForTimeout(400);
const cta2 = page.getByRole("button", { name: /연금으로 받으면 매달 얼마/ });
await cta2.first().click();
await page.waitForTimeout(600);
const banner2 = await page.getByText(/목표 역산.*가져온 적립금/).isVisible().catch(() => false);
console.log(`목표 역산 → 연금 배너: ${banner2 ? "✓" : "✗"}`);
await page.screenshot({ path: `${OUT}/link-2-target-to-pension.png`, fullPage: true });

// 4) 적립금 수동 변경 시 배너 사라짐 확인
await page.locator('input[type="range"]').first().click();
await page.waitForTimeout(300);
const bannerGone = !(await page.getByText(/에서 가져온 적립금/).isVisible().catch(() => false));
console.log(`수동 변경 시 배너 해제: ${bannerGone ? "✓" : "✗"}`);

await ctx.close();
await browser.close();

if (errors.length) { console.log("\n⚠ 오류:"); errors.forEach((e) => console.log("  " + e)); process.exit(1); }
else console.log("\n✅ 탭 연결 플로우 검증 완료 — JS 오류 없음");
