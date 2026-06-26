/**
 * portfolio.spec.ts
 *
 * 투자전략 플래너(/portfolio) 스모크 테스트
 *
 * 로그인한 사용자 기준.
 * /portfolio는 세션 없으면 401 → "성향 진단 시작하기" 안내 화면.
 * 성향 진단이 없어도 noProfile 화면이 렌더되는 것 자체를 검증.
 *
 * 4탭 전환 테스트는 포트폴리오 데이터가 있어야 하므로:
 *   - 데이터 있음 → 4탭 렌더 + 전환 검증
 *   - 데이터 없음(noProfile) → 안내 문구 렌더 검증
 *
 * 쓰기 동작 없음 — 읽기 전용
 */
import { test, expect } from "@playwright/test";

test.describe("투자전략 플래너", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/portfolio");
    // 로딩 스피너가 사라질 때까지 대기 (최대 10초)
    await page
      .locator('[aria-label="포트폴리오 로딩 중"]')
      .waitFor({ state: "hidden", timeout: 10_000 })
      .catch(() => {
        // 스피너가 애초에 없으면(이미 로드 완료 or noProfile) 무시
      });
  });

  test("페이지 H1이 '투자전략 플래너' 또는 안내 문구가 표시된다", async ({ page }) => {
    // 두 가지 경우: 포트폴리오 데이터 있음 / noProfile
    const hasPortfolio = await page.getByRole("heading", { name: "투자전략 플래너", level: 1 }).isVisible();
    const hasNoProfile = await page.getByText("성향 진단 시작하기").isVisible();
    expect(hasPortfolio || hasNoProfile).toBe(true);
  });

  test("포트폴리오 데이터가 있을 때 4탭이 렌더된다", async ({ page }) => {
    const hasPortfolio = await page.getByRole("heading", { name: "투자전략 플래너", level: 1 }).isVisible();
    if (!hasPortfolio) {
      test.skip(true, "성향 진단 데이터 없음 — 4탭 테스트 건너뜀");
      return;
    }
    const tablist = page.getByRole("tablist", { name: "투자전략 플래너 탭" });
    await expect(tablist).toBeVisible();
    for (const tabLabel of ["자산 배분", "ETF 추천", "수익률 분석", "리밸런싱"]) {
      await expect(tablist.getByRole("tab", { name: tabLabel })).toBeVisible();
    }
  });

  test("4탭 전환: 자산 배분 → ETF 추천 → 수익률 분석 → 리밸런싱", async ({ page }) => {
    const hasPortfolio = await page.getByRole("heading", { name: "투자전략 플래너", level: 1 }).isVisible();
    if (!hasPortfolio) {
      test.skip(true, "성향 진단 데이터 없음 — 탭 전환 건너뜀");
      return;
    }
    const tablist = page.getByRole("tablist", { name: "투자전략 플래너 탭" });

    // ETF 추천 탭
    await tablist.getByRole("tab", { name: "ETF 추천" }).click();
    await expect(page.getByRole("tabpanel", { name: "ETF 추천" }).or(
      page.locator("[id='panel-etf']")
    )).toBeVisible();

    // 수익률 분석 탭
    await tablist.getByRole("tab", { name: "수익률 분석" }).click();
    await expect(page.locator("[id='panel-returns']")).toBeVisible();

    // 리밸런싱 탭
    await tablist.getByRole("tab", { name: "리밸런싱" }).click();
    await expect(page.locator("[id='panel-rebalancing']")).toBeVisible();

    // 자산 배분으로 돌아오기
    await tablist.getByRole("tab", { name: "자산 배분" }).click();
    await expect(page.locator("[id='panel-allocation']")).toBeVisible();
  });

  test("noProfile 화면: '성향 진단 시작하기' 링크가 /survey로 연결된다", async ({ page }) => {
    const noProfileLink = page.getByRole("link", { name: /성향 진단 시작하기/ });
    const isVisible = await noProfileLink.isVisible();
    if (!isVisible) {
      // 포트폴리오 데이터가 있으면 이 테스트는 의미 없음 — 스킵
      test.skip(true, "포트폴리오 데이터 있음 — noProfile 화면 없음");
      return;
    }
    await expect(noProfileLink).toHaveAttribute("href", "/survey");
  });
});
