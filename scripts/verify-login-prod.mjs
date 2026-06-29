/**
 * 프로덕션 라이브 로그인 검증 (Playwright)
 *
 * 비밀번호는 코드에 하드코딩하지 않고 환경변수로만 받는다:
 *   LOGIN_PASSWORD=<공유비번> node scripts/verify-login-prod.mjs
 *
 * 선택 환경변수:
 *   PROD_BASE   (기본 https://investing-manager-kf7m.vercel.app)
 *   LOGIN_EMAIL (기본 playwright-verify@example.com — admin 로그인기록 오염 방지용 테스트 이메일)
 *
 * 검증 항목:
 *  1. 미인증 /portfolio → /login?callbackUrl=%2Fportfolio 리다이렉트 (게이트 동작)
 *  2. 오답 비밀번호 → 로그인 거부(세션 없음)
 *  3. 정답 로그인 + callbackUrl=/portfolio → /portfolio 복귀 + 로딩 스켈레톤 해소(세션 전파)  ★핵심
 *  4. /login 직접 진입 → 기본값(/portfolio) 복귀
 *  5. 외부 URL callbackUrl(https://evil.com) 거부 → 내부 폴백
 *  6. //evil.com 프로토콜-상대 URL 거부 → 내부 폴백
 */
import { chromium } from "playwright";

const BASE = (process.env.PROD_BASE || "https://investing-manager-kf7m.vercel.app").replace(/\/$/, "");
const EMAIL = process.env.LOGIN_EMAIL || "playwright-verify@example.com";
const PASSWORD = process.env.LOGIN_PASSWORD || "";

if (!PASSWORD) {
  console.error("ERROR: LOGIN_PASSWORD 환경변수가 필요합니다.");
  process.exit(2);
}

let passed = 0, failed = 0;
const ok = (l) => { console.log(`  PASS  ${l}`); passed++; };
const fail = (l, d) => { console.error(`  FAIL  ${l}${d ? " — " + d : ""}`); failed++; };

async function login(page, { callbackUrl, password = PASSWORD } = {}) {
  const url = callbackUrl !== undefined
    ? `${BASE}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : `${BASE}/login`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
}

console.log(`\n프로덕션 로그인 검증: ${BASE} (email=${EMAIL})`);
const browser = await chromium.launch({ headless: true });

// ── 1. 미인증 보호경로 → 로그인 리다이렉트 ──────────────────────────────
console.log("\n[1] 미인증 /portfolio → /login?callbackUrl 리다이렉트");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const resp = await page.goto(`${BASE}/portfolio`, { waitUntil: "networkidle" });
  const u = new URL(page.url());
  if (u.pathname === "/login" && u.searchParams.get("callbackUrl") === "/portfolio") {
    ok("미인증 접근 시 /login?callbackUrl=/portfolio로 보호 리다이렉트");
  } else {
    fail("보호 리다이렉트", `최종 URL: ${page.url()} (status ${resp?.status()})`);
  }
  await ctx.close();
}

// ── 2. 오답 비밀번호 → 거부 ─────────────────────────────────────────────
console.log("\n[2] 오답 비밀번호 → 로그인 거부");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, { callbackUrl: "/portfolio", password: PASSWORD + "_wrong_xyz" });
  // 거부 시 페이지 이동 없이 에러 메시지 노출, 세션 쿠키 없음
  await page.waitForTimeout(3000);
  const stayed = new URL(page.url()).pathname === "/login";
  const cookies = await ctx.cookies();
  const hasSession = cookies.some((c) => /next-auth|authjs/i.test(c.name) && /session-token/i.test(c.name));
  if (stayed && !hasSession) {
    ok("오답 비밀번호 → /login 잔류 + 세션 쿠키 없음");
  } else {
    fail("오답 비밀번호 거부", `pathname=${new URL(page.url()).pathname}, hasSession=${hasSession}`);
  }
  await ctx.close();
}

// ── 3. ★핵심: 정답 로그인 → /portfolio 복귀 + 로딩 해소 ──────────────────
console.log("\n[3] ★ 정답 로그인 → /portfolio 복귀 + 로딩 스켈레톤 해소");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, { callbackUrl: "/portfolio" });
  try {
    await page.waitForURL("**/portfolio", { timeout: 20000 });
    ok("로그인 성공 후 /portfolio로 복귀(하드 내비게이션)");
  } catch {
    fail("/portfolio 복귀", `최종 URL: ${page.url()}`);
  }

  // 세션 전파: Sidebar 로딩 스켈레톤 해소 / 로그아웃 버튼 표시
  let resolved = false;
  try {
    await page.waitForSelector("aside .animate-pulse", { state: "hidden", timeout: 8000 });
    resolved = true;
  } catch { /* fall through */ }
  const hasLogout = await page.locator("aside button", { hasText: "로그아웃" }).isVisible().catch(() => false);
  if (resolved || hasLogout) {
    ok(`Sidebar 로딩 스켈레톤 해소(세션 전파 확인)${hasLogout ? " · 로그아웃 버튼 표시" : ""}`);
  } else {
    const stillPulse = await page.locator("aside .animate-pulse").first().isVisible().catch(() => false);
    fail("로딩 스켈레톤 해소", stillPulse ? "animate-pulse 여전히 표시(고착 재현)" : "로그아웃 버튼 미발견");
  }
  await ctx.close();
}

// ── 4. /login 직접 진입 → 기본값 복귀 ──────────────────────────────────
console.log("\n[4] /login 직접 진입 → 기본값(/portfolio) 복귀");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, {}); // callbackUrl 없음
  try {
    await page.waitForURL("**/portfolio", { timeout: 20000 });
    ok("callbackUrl 없을 때 기본값 /portfolio로 이동");
  } catch {
    fail("기본값 복귀", `최종 URL: ${page.url()}`);
  }
  await ctx.close();
}

// ── 5. 외부 URL 거부 ───────────────────────────────────────────────────
console.log("\n[5] 외부 URL callbackUrl 오픈 리다이렉트 방어");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, { callbackUrl: "https://evil.com" });
  await page.waitForTimeout(5000);
  const host = new URL(page.url()).hostname;
  const prodHost = new URL(BASE).hostname;
  if (host === prodHost) {
    ok(`외부 URL 거부 → 내부 경로(${new URL(page.url()).pathname}) 폴백`);
  } else {
    fail("외부 URL 거부", `외부 도메인으로 이동됨: ${page.url()}`);
  }
  await ctx.close();
}

// ── 6. //evil.com 거부 ─────────────────────────────────────────────────
console.log("\n[6] //evil.com 프로토콜-상대 URL 방어");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, { callbackUrl: "//evil.com" });
  await page.waitForTimeout(5000);
  const host = new URL(page.url()).hostname;
  const prodHost = new URL(BASE).hostname;
  if (host === prodHost) {
    ok(`//evil.com 거부 → 내부 경로(${new URL(page.url()).pathname}) 폴백`);
  } else {
    fail("//evil.com 거부", `외부로 이동됨: ${page.url()}`);
  }
  await ctx.close();
}

await browser.close();
console.log("\n" + "─".repeat(50));
console.log(`결과: ${passed} 통과 / ${failed} 실패`);
process.exit(failed > 0 ? 1 : 0);
