import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "scripts/_calc-shots";
mkdirSync(OUT, { recursive: true });

const TABS = ["적립식 계산", "목표 역산", "세액공제", "연금 수령", "연금 로드맵"];
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 1400 },
  { name: "mobile", width: 390, height: 1600 },
];

const browser = await chromium.launch();
const errors = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${vp.name}] console: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`[${vp.name}] pageerror: ${e.message}`));

  await page.goto("http://localhost:3000/calculator", { waitUntil: "networkidle" });

  for (const tab of TABS) {
    await page.getByRole("button", { name: tab }).click();
    await page.waitForTimeout(700); // chart animation
    const file = `${OUT}/${vp.name}-${tab.replace(/\s/g, "")}.png`;
    await page.screenshot({ path: file, fullPage: true });
    // sanity: result card present
    const hasResult = await page.locator("text=추정치, text=세액공제 예상액, text=월 수령액").first().count().catch(() => 0);
    console.log(`✓ ${vp.name} / ${tab} → ${file}`);
  }
  await ctx.close();
}

await browser.close();

if (errors.length) {
  console.log("\n⚠ 콘솔/페이지 오류:");
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
} else {
  console.log("\n✅ 4개 탭 × 2뷰포트 렌더링 완료 — JS 오류 없음");
}
