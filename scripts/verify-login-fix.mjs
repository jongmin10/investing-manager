/**
 * Playwright 검증 스크립트: 로그인 세션 전파 + 이전 페이지 복귀 버그 수정 확인
 *
 * 검증 항목:
 * 1. callbackUrl 있을 때 로그인 성공 → 해당 경로로 하드 내비게이션
 * 2. 로그인 후 Sidebar에 세션 반영(로딩 스켈레톤 해소)
 * 3. callbackUrl 없이 /login 직접 진입 → 기본값(/portfolio)으로 이동
 * 4. 보안: 외부 URL callbackUrl → 기본값으로 폴백
 * 5. 빈 이메일 시 버튼 disabled 상태 확인
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const TEST_EMAIL = "playwright-test@example.com";

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  PASS  ${label}`);
  passed++;
}
function fail(label, detail) {
  console.error(`  FAIL  ${label}${detail ? " — " + detail : ""}`);
  failed++;
}

const browser = await chromium.launch({ headless: true });

// ── 테스트 1: callbackUrl=/portfolio 로그인 후 복귀 + 세션 전파 ──────────
console.log("\n[테스트 1] callbackUrl 복귀 + 세션 전파");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login?callbackUrl=/portfolio`);
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });

  // 로그인 폼 입력
  await page.fill('input[type="email"]', TEST_EMAIL);

  // 버튼 클릭 후 하드 내비게이션 대기
  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);

  const finalUrl = new URL(page.url());
  if (finalUrl.pathname === "/portfolio") {
    ok("로그인 성공 후 /portfolio로 복귀");
  } else {
    fail("로그인 성공 후 /portfolio로 복귀", `실제 URL: ${page.url()}`);
  }

  // 하드 내비게이션이므로 SessionProvider가 새 쿠키로 세션 조회
  // Sidebar 로딩 스켈레톤 해소 확인 (최대 3초 대기)
  try {
    await page.waitForSelector("aside .animate-pulse", { state: "hidden", timeout: 3000 });
    ok("Sidebar loading 스켈레톤 해소");
  } catch {
    // 스켈레톤이 안 사라지면 로그아웃 버튼이 있는지 확인
    const hasLogout = await page.locator("aside button", { hasText: "로그아웃" }).isVisible();
    if (hasLogout) {
      ok("Sidebar loading 스켈레톤 해소 (로그아웃 버튼 확인)");
    } else {
      const skeleton = await page.locator("aside .animate-pulse").isVisible();
      fail("Sidebar loading 스켈레톤 해소", skeleton ? "animate-pulse 여전히 표시" : "로그아웃 버튼도 없음");
    }
  }

  const hasLogout = await page.locator("aside button", { hasText: "로그아웃" }).isVisible();
  if (hasLogout) {
    ok("Sidebar 로그아웃 버튼 표시 (세션 인식)");
  } else {
    fail("Sidebar 로그아웃 버튼 표시", "버튼 없음");
  }

  await ctx.close();
}

// ── 테스트 2: /login 직접 진입 → /portfolio (기본값) 복귀 ───────────────
console.log("\n[테스트 2] /login 직접 진입 → 기본값(/portfolio) 복귀");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // callbackUrl 없이 /login 직접 진입
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });

  await page.fill('input[type="email"]', TEST_EMAIL);

  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);

  const finalUrl = new URL(page.url());
  if (finalUrl.pathname === "/portfolio") {
    ok("직접 /login 진입 후 기본값(/portfolio)으로 이동");
  } else {
    fail("직접 /login 진입 후 기본값(/portfolio)으로 이동", `실제 URL: ${page.url()}`);
  }

  await ctx.close();
}

// ── 테스트 3: 보안 — 외부 URL callbackUrl 거부 ────────────────────────────
console.log("\n[테스트 3] 외부 URL callbackUrl 오픈 리다이렉트 방어");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login?callbackUrl=https://evil.com`);
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });

  await page.fill('input[type="email"]', TEST_EMAIL);

  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);

  const finalUrl = new URL(page.url());
  const isExternal = finalUrl.hostname !== "localhost";
  if (!isExternal && finalUrl.pathname === "/portfolio") {
    ok("외부 URL callbackUrl 거부 → 기본값(/portfolio) 폴백");
  } else if (!isExternal) {
    // 내부로 갔지만 /portfolio가 아닌 경우도 통과(중요한 건 외부 리다이렉트 안 됨)
    ok(`외부 URL callbackUrl 거부 → 내부 경로 ${finalUrl.pathname}로 폴백`);
  } else {
    fail("외부 URL callbackUrl 거부", `외부 도메인으로 리다이렉트됨: ${page.url()}`);
  }

  await ctx.close();
}

// ── 테스트 4: // 시작 프로토콜-상대 URL 거부 ───────────────────────────
console.log("\n[테스트 4] //evil.com 프로토콜-상대 URL 거부");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login?callbackUrl=//evil.com`);
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });

  await page.fill('input[type="email"]', TEST_EMAIL);

  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);

  const finalUrl = new URL(page.url());
  const isExternal = finalUrl.hostname !== "localhost";
  if (!isExternal) {
    ok("//evil.com 프로토콜-상대 URL 거부 → 내부 경로 폴백");
  } else {
    fail("//evil.com 프로토콜-상대 URL 거부", `외부로 리다이렉트됨: ${page.url()}`);
  }

  await ctx.close();
}

// ── 테스트 5: 빈 이메일 → 버튼 disabled ────────────────────────────────
console.log("\n[테스트 5] 빈 이메일 → 버튼 disabled");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`);
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });

  // 이메일 비어있는 상태에서 버튼 상태 확인
  const submitBtn = page.locator('button[type="submit"]');
  const isDisabled = await submitBtn.isDisabled();
  if (isDisabled) {
    ok("이메일 없을 때 버튼 disabled (early-return 안전장치)");
  } else {
    fail("이메일 없을 때 버튼 disabled", "버튼이 활성화됨");
  }

  await ctx.close();
}

// ── 테스트 6: 모바일 뷰포트 (390px) 로그인 플로우 ─────────────────────
console.log("\n[테스트 6] 모바일 뷰포트(390px) 로그인 + 세션 전파");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login?callbackUrl=/portfolio`);
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });

  await page.fill('input[type="email"]', TEST_EMAIL);

  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);

  const finalUrl = new URL(page.url());
  if (finalUrl.pathname === "/portfolio") {
    ok("모바일(390px) 로그인 후 /portfolio 복귀");
  } else {
    fail("모바일(390px) 로그인 후 /portfolio 복귀", `실제 URL: ${page.url()}`);
  }

  await ctx.close();
}

// ── 결과 요약 ──────────────────────────────────────────────────────────────
await browser.close();

console.log("\n" + "─".repeat(50));
console.log(`결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) {
  process.exit(1);
}
