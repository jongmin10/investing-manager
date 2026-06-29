/**
 * journal-bbs.spec.ts
 *
 * 투자 일기 목록 페이지 BBS 레이아웃 검증:
 * - 데스크톱: 시맨틱 테이블 표시, 행 클릭 이동
 * - 모바일(390px): 2열 그리드, 가로 스크롤 없음, 셀 탭 이동
 */
import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:3000";

/** 테스트용 일기가 없으면 API로 생성 */
async function ensureTestEntries(page: Page, count = 3) {
  const res = await page.request.get(`${BASE}/api/journal`);
  const data = await res.json();
  if ((data.entries ?? []).length >= count) return;

  const samples = [
    { title: "삼성전자 분할 매수 진입", mood: "optimistic", decisionType: "buy",   tickers: ["005930", "000660"] },
    { title: "코스피 급락 대응 전략",   mood: "anxious",   decisionType: "hold",  tickers: ["SPY"] },
    { title: "포트폴리오 리밸런싱 기록", mood: "neutral",   decisionType: "rebalance", tickers: [] },
  ];
  for (const s of samples) {
    await page.request.post(`${BASE}/api/journal`, {
      data: { ...s, date: new Date().toISOString().slice(0, 10), content: "테스트 본문" },
    });
  }
}

test.describe("데스크톱 — 게시판 테이블", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("시맨틱 테이블이 렌더링된다", async ({ page }) => {
    await ensureTestEntries(page);
    await page.goto(`${BASE}/journal`);
    await page.waitForLoadState("networkidle");

    // 테이블 존재
    const table = page.getByRole("table", { name: "투자 일기 목록" });
    await expect(table).toBeVisible();

    // 헤더 셀
    const ths = table.locator("thead th");
    await expect(ths).toHaveCount(5);

    // 적어도 1행
    const rows = table.locator("tbody tr");
    await expect(rows.first()).toBeVisible();

    // 스크린샷
    await page.screenshot({ path: "test-results/journal-desktop.png", fullPage: false });
  });

  test("행 클릭 시 상세 페이지로 이동한다", async ({ page }) => {
    await page.goto(`${BASE}/journal`);
    await page.waitForLoadState("networkidle");

    const table = page.getByRole("table");
    const firstRow = table.locator("tbody tr").first();
    await expect(firstRow).toBeVisible();

    await firstRow.click();
    await page.waitForURL(/\/journal\/.+/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/journal\/.+/);
  });

  test("제목 셀 Link 포커스 후 Enter로 이동", async ({ page }) => {
    await page.goto(`${BASE}/journal`);
    await page.waitForLoadState("networkidle");

    const table = page.getByRole("table");
    const firstLink = table.locator("tbody tr").first().locator("a").first();
    await firstLink.focus();
    await firstLink.press("Enter");
    await page.waitForURL(/\/journal\/.+/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/journal\/.+/);
  });

  test("모바일 그리드가 md+ 뷰포트에서 숨겨져 있다", async ({ page }) => {
    await page.goto(`${BASE}/journal`);
    await page.waitForLoadState("networkidle");

    // md:hidden 그리드는 데스크톱에서 display:none
    const grid = page.locator('[aria-label="투자 일기 목록"]').filter({ has: page.locator(".grid-cols-2") }).first();
    // getByRole table 이 보이면 grid는 숨겨져 있어야 함
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
  });
});

test.describe("모바일 — 2열 그리드", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("2열 그리드가 렌더링되고 테이블은 숨겨진다", async ({ page }) => {
    await ensureTestEntries(page);
    await page.goto(`${BASE}/journal`);
    await page.waitForLoadState("networkidle");

    // grid 컨테이너 (md:hidden)
    const grid = page.locator(".grid-cols-2").first();
    await expect(grid).toBeVisible();

    // 테이블은 hidden
    const table = page.locator("table");
    await expect(table).not.toBeVisible();

    // 스크린샷
    await page.screenshot({ path: "test-results/journal-mobile.png", fullPage: false });
  });

  test("가로 스크롤이 없다", async ({ page }) => {
    await page.goto(`${BASE}/journal`);
    await page.waitForLoadState("networkidle");

    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = 390;
    expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 2); // 2px 여유
  });

  test("셀 클릭 시 상세 페이지로 이동한다", async ({ page }) => {
    await page.goto(`${BASE}/journal`);
    await page.waitForLoadState("networkidle");

    const grid = page.locator(".grid-cols-2").first();
    const firstCell = grid.locator("a").first();
    await expect(firstCell).toBeVisible();

    await firstCell.click();
    await page.waitForURL(/\/journal\/.+/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/journal\/.+/);
  });

  test("셀 탭 포커스 후 Enter로 이동", async ({ page }) => {
    await page.goto(`${BASE}/journal`);
    await page.waitForLoadState("networkidle");

    const grid = page.locator(".grid-cols-2").first();
    const firstCell = grid.locator("a").first();
    await firstCell.focus();
    await firstCell.press("Enter");
    await page.waitForURL(/\/journal\/.+/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/journal\/.+/);
  });
});
