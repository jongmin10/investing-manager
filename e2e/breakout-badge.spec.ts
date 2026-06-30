/**
 * breakout-badge.spec.ts — 돌파 배지 렌더링 QA (API 모킹)
 * 실제 히스토리 데이터 없이도 배지 위치·포맷·이모지 금지를 검증한다.
 */
import { test, expect } from "@playwright/test";

const MOCK_ITEM = {
  id: "005930",
  name: "삼성전자",
  market: "KOSPI",
  sector: "반도체와반도체장비",
  price: 89500,
  changeRate: 2.5,
  high52w: 90000,
  low52w: 55000,
  high52wRatio: 99.4,
  volume: 5000000,
  collectedAt: new Date().toISOString(),
  revenue: 320000,
  operatingProfit: 44000,
  revenueGrowth: 12.3,
  opGrowth: 25.1,
  netGrowth: 18.5,
  opMargin: 13.75,
  cnsEps: 7500,
  per: 11.9,
  cnsPer: 10.5,
  pbr: 1.2,
  dividendYield: 2.1,
  period: "2025A",
  breakout: true,
  breakoutDate: "2026-06-26",
  consolidationDays: 63,
  priorMaxRatio: 74.2,
  breakoutReason: null,
};

const MOCK_RESPONSE = {
  items: [MOCK_ITEM],
  total: 1,
  sectors: ["반도체와반도체장비"],
  financialStatus: { count: 1, hasDartKey: true },
  collectedAt: new Date().toISOString(),
  isUpToDate: true,
};

test.describe("돌파 배지 렌더링 (API 모킹)", () => {
  test.beforeEach(async ({ page }) => {
    // /api/screener 요청 가로채기 → 돌파 종목이 포함된 mock 응답 주입
    await page.route("**/api/screener**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_RESPONSE),
      });
    });

    await page.goto("/screener");
    await expect(page.getByText("검색 중...")).toBeHidden({ timeout: 15_000 });
  });

  // ── 1. 배지가 종목명 줄 인라인에 노출 ──
  test("돌파 배지가 종목명 행(2번째 줄)에 인라인으로 렌더된다", async ({ page }) => {
    // 배지: "돌파 06/26" 형식
    const badge = page.locator("span.bg-emerald-100.text-emerald-800").filter({ hasText: /돌파 06\/26/ });
    await expect(badge).toBeVisible();
  });

  // ── 2. 배지에 이모지 없음 ──
  test("돌파 배지에 이모지가 없다(텍스트+색상만)", async ({ page }) => {
    const badge = page.locator("span.bg-emerald-100.text-emerald-800").filter({ hasText: /돌파 06\/26/ });
    const text = await badge.textContent();
    // 이모지 유니코드 범위 검사
    expect(text).not.toMatch(/[\u{1F000}-\u{1FFFF}]/u);
    expect(text).not.toMatch(/[\u{2600}-\u{27BF}]/u);
  });

  // ── 3. 배지에 날짜 직접 표기 ("돌파 MM/DD") ──
  test("배지 텍스트에 날짜가 MM/DD 형식으로 직접 표기된다", async ({ page }) => {
    const badge = page.locator("span.bg-emerald-100.text-emerald-800").filter({ hasText: /돌파 06\/26/ });
    const text = await badge.textContent();
    expect(text).toMatch(/돌파 06\/26/);
  });

  // ── 4. consolidationDays 표기 ──
  test("배지에 조정일수(63일 조정)가 표기된다", async ({ page }) => {
    const badge = page.locator("span.bg-emerald-100.text-emerald-800");
    const text = await badge.textContent();
    expect(text).toContain("63일 조정");
  });

  // ── 5. 배지가 "52주 고가 근접" 컬럼이 아닌 종목명 줄에 위치 ──
  test("배지가 52주 고가 근접 컬럼 밖에 있다(종목명 셀)", async ({ page }) => {
    const badge = page.locator("span.bg-emerald-100.text-emerald-800").filter({ hasText: /돌파/ });
    // 배지의 부모가 종목명 셀(첫 번째 grid 셀)이어야 함
    // 종목명 셀: div.min-w-0 > div(flex items-center gap-2 flex-wrap) + div(업종·코드·배지 줄)
    const parentDiv = badge.locator(".."); // 직계 부모
    await expect(parentDiv).toHaveClass(/flex.*flex-wrap.*items-center/);
  });

  // ── 6. 모바일에서 좌우 스크롤 없이 배지 보임 ──
  test("[mobile] 배지가 뷰포트 안에서 좌우 스크롤 없이 보인다", async ({ page, isMobile }) => {
    if (!isMobile) test.skip();
    const badge = page.locator("span.bg-emerald-100.text-emerald-800").filter({ hasText: /돌파 06\/26/ });
    await expect(badge).toBeVisible();
    // 배지 bounding box가 뷰포트 내에 있어야 함
    const box = await badge.boundingBox();
    const viewport = page.viewportSize();
    if (box && viewport) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 2); // 2px tolerance
    }
  });
});
