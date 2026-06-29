/**
 * journal-bbs.spec.ts
 *
 * 투자 일기 목록 페이지 BBS(게시판) 레이아웃 검증:
 * - 전 뷰포트 공통: 시맨틱 테이블, 행 클릭 이동
 * - 데스크톱: 5컬럼(번호·제목·결정·종목·날짜) 모두 표시
 * - 모바일(390px): 동일 테이블을 압축 — 보조 컬럼(번호·종목) 숨김, 가로 스크롤 없음
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

  test("시맨틱 테이블이 5컬럼으로 렌더링된다", async ({ page }) => {
    await ensureTestEntries(page);
    await page.goto(`${BASE}/journal`);
    await page.waitForLoadState("networkidle");

    const table = page.getByRole("table", { name: "투자 일기 목록" });
    await expect(table).toBeVisible();

    // 5개 헤더 모두 표시(번호·제목·결정·종목·날짜)
    await expect(table.locator("thead th")).toHaveCount(5);
    await expect(page.getByRole("columnheader", { name: "번호" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "종목" })).toBeVisible();

    await expect(table.locator("tbody tr").first()).toBeVisible();
    await page.screenshot({ path: "test-results/journal-desktop.png", fullPage: false });
  });

  test("행 클릭 시 상세 페이지로 이동한다", async ({ page }) => {
    await page.goto(`${BASE}/journal`);
    await page.waitForLoadState("networkidle");

    const firstRow = page.getByRole("table").locator("tbody tr").first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await page.waitForURL(/\/journal\/.+/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/journal\/.+/);
  });

  test("제목 셀 Link 포커스 후 Enter로 이동", async ({ page }) => {
    await page.goto(`${BASE}/journal`);
    await page.waitForLoadState("networkidle");

    const firstLink = page.getByRole("table").locator("tbody tr").first().locator("a").first();
    await firstLink.focus();
    await firstLink.press("Enter");
    await page.waitForURL(/\/journal\/.+/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/journal\/.+/);
  });
});

test.describe("모바일 — 압축 테이블", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("동일 테이블을 사용하되 보조 컬럼(번호·종목)이 숨겨진다", async ({ page }) => {
    await ensureTestEntries(page);
    await page.goto(`${BASE}/journal`);
    await page.waitForLoadState("networkidle");

    // 모바일에서도 테이블 사용(2열 그리드 아님)
    const table = page.getByRole("table", { name: "투자 일기 목록" });
    await expect(table).toBeVisible();
    await expect(page.locator(".grid-cols-2")).toHaveCount(0);

    // 보조 컬럼은 숨김, 핵심 컬럼은 표시
    await expect(page.getByRole("columnheader", { name: "번호" })).toBeHidden();
    await expect(page.getByRole("columnheader", { name: "종목" })).toBeHidden();
    await expect(page.getByRole("columnheader", { name: "제목" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "결정" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "날짜" })).toBeVisible();

    await page.screenshot({ path: "test-results/journal-mobile.png", fullPage: false });
  });

  test("가로 스크롤이 없다", async ({ page }) => {
    await page.goto(`${BASE}/journal`);
    await page.waitForLoadState("networkidle");

    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(390 + 2); // 2px 여유
  });

  test("행 클릭 시 상세 페이지로 이동한다", async ({ page }) => {
    await page.goto(`${BASE}/journal`);
    await page.waitForLoadState("networkidle");

    const firstRow = page.getByRole("table").locator("tbody tr").first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await page.waitForURL(/\/journal\/.+/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/journal\/.+/);
  });
});
