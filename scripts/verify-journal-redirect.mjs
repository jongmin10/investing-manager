/**
 * 투자일기(/journal) 로그인 후 이전 페이지 복귀 검증 (로컬 dev)
 * 버그: /journal에서 미인증 시 /login으로 갔다가 로그인 후 대시보드로 가던 문제.
 * 기대: /journal → /login?callbackUrl=/journal → 로그인 → /journal 복귀.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const EMAIL = "journal-verify@example.com";
let passed = 0, failed = 0;
const ok = (l) => { console.log(`  PASS  ${l}`); passed++; };
const fail = (l, d) => { console.error(`  FAIL  ${l}${d ? " — " + d : ""}`); failed++; };

const browser = await chromium.launch({ headless: true });

async function flow(start, expectReturn, label) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // 대시보드를 먼저 하드 로드해 referrer 함정 재현(soft-nav 시 referrer가 대시보드를 가리킴)
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  // SPA 소프트 내비게이션으로 목표 페이지 진입
  await page.evaluate((p) => { window.history.pushState({}, "", p); window.dispatchEvent(new PopStateEvent("popstate")); }, start);
  await page.goto(`${BASE}${start}`, { waitUntil: "networkidle" });

  // 미인증 → /login?callbackUrl=<start> 로 이동했는지
  await page.waitForURL("**/login**", { timeout: 10000 }).catch(() => {});
  const loginUrl = new URL(page.url());
  const cb = loginUrl.searchParams.get("callbackUrl");
  if (loginUrl.pathname === "/login" && cb === start) {
    ok(`${label}: /login?callbackUrl=${start} 주입 확인`);
  } else {
    fail(`${label}: callbackUrl 주입`, `pathname=${loginUrl.pathname} callbackUrl=${cb}`);
  }

  // 로그인 (로컬 dev는 이메일만)
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', EMAIL);
  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForURL(`**${expectReturn}**`, { timeout: 15000 }).catch(() => {});

  const finalPath = new URL(page.url()).pathname;
  if (finalPath === expectReturn) {
    ok(`${label}: 로그인 후 ${expectReturn} 복귀(대시보드 아님)`);
  } else {
    fail(`${label}: 복귀 경로`, `기대 ${expectReturn}, 실제 ${finalPath}`);
  }
  await ctx.close();
}

console.log("\n[투자일기 목록] /journal");
await flow("/journal", "/journal", "journal");

console.log("\n[투자일기 작성] /journal/new");
await flow("/journal/new", "/journal/new", "journal-new");

await browser.close();
console.log("\n" + "─".repeat(50));
console.log(`결과: ${passed} 통과 / ${failed} 실패`);
process.exit(failed > 0 ? 1 : 0);
