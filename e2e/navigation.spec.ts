/**
 * navigation.spec.ts
 *
 * 네비게이션 스모크 테스트
 *
 * 데스크톱:
 *   - 사이드바 로고 렌더
 *   - 주요 링크 클릭 → 페이지 전환
 *
 * 모바일:
 *   - 하단 탭바 4개 기본 탭 렌더
 *   - '더보기' 버튼 → 시트 열림 → 아이템 클릭 → 페이지 전환
 *   - 뒤로가기 또는 배경 탭으로 시트 닫힘
 */
import { test, expect } from "@playwright/test";

// ── 데스크톱 사이드바 ─────────────────────────────────────

test.describe("데스크톱 사이드바 네비게이션", () => {
  test("사이드바에 '연금 나침반' 로고가 표시된다", async ({ page, isMobile }) => {
    if (isMobile) return;
    await page.goto("/");
    const aside = page.locator("aside");
    await expect(aside).toBeVisible();
    // 로고 링크로 특정: aside.getByText("연금")은 "연금 계산기" 메뉴도 매칭하므로
    // role=link 로 특정 (accessible name에 '연금 나침반' 포함)
    await expect(aside.getByRole("link", { name: /연금 나침반/ })).toBeVisible();
  });

  test("사이드바 '투자전략 플래너' 링크 → /portfolio 이동", async ({ page, isMobile }) => {
    if (isMobile) return;
    await page.goto("/");
    const link = page.locator("aside a[href='/portfolio']");
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/portfolio/);
  });

  test("사이드바 '연금 계산기' 링크 → /calculator 이동", async ({ page, isMobile }) => {
    if (isMobile) return;
    await page.goto("/");
    await page.locator("aside a[href='/calculator']").click();
    await expect(page).toHaveURL(/\/calculator/);
  });

  test("사이드바 '종목 스크리너' 링크 → /screener 이동", async ({ page, isMobile }) => {
    if (isMobile) return;
    await page.goto("/");
    await page.locator("aside a[href='/screener']").click();
    await expect(page).toHaveURL(/\/screener/);
  });

  test("사이드바에서 /screener 이동 시 하위 메뉴('관심종목','피터 린치')가 펼쳐진다", async ({ page, isMobile }) => {
    if (isMobile) return;
    await page.goto("/screener");
    const aside = page.locator("aside");
    await expect(aside.getByRole("link", { name: /관심종목/ })).toBeVisible();
    await expect(aside.getByRole("link", { name: /피터 린치/ })).toBeVisible();
  });
});

// ── 모바일 하단 탭바 + 더보기 시트 ─────────────────────────

test.describe("모바일 하단 탭바 & 더보기 시트", () => {
  test("하단 탭바 4개 기본 탭(대시보드·리포트·포트폴리오·스크리너)이 렌더된다", async ({ page, isMobile }) => {
    if (!isMobile) return;
    await page.goto("/");
    const mobileNav = page.locator("nav.fixed");
    await expect(mobileNav).toBeVisible();
    for (const label of ["대시보드", "리포트", "포트폴리오", "스크리너"]) {
      await expect(mobileNav.getByText(label)).toBeVisible();
    }
  });

  test("'더보기' 버튼을 누르면 더보기 시트가 열린다", async ({ page, isMobile }) => {
    if (!isMobile) return;
    await page.goto("/");
    const mobileNav = page.locator("nav.fixed");
    await mobileNav.getByText("더보기").click();
    // 더보기 시트 열림 확인
    // "대가 13F" → MobileNav MORE_ITEMS에만 있음(사이드바는 "투자 대가 13F") → unique
    await expect(page.getByText("대가 13F", { exact: true })).toBeVisible();
    // "관심종목" 도 more sheet 전용 텍스트 (unique)
    await expect(page.getByText("관심종목", { exact: true })).toBeVisible();
  });

  test("더보기 시트에서 '연금 계산기' 클릭 → /calculator 이동", async ({ page, isMobile }) => {
    if (!isMobile) return;
    await page.goto("/");
    const mobileNav = page.locator("nav.fixed");
    await mobileNav.getByText("더보기").click();
    // 더보기 시트 내 '연금 계산기' 링크 — 링크가 2개(사이드바+시트)이므로 visible 필터 적용
    // 시트 링크만 화면에 표시됨 (사이드바는 md:hidden)
    const calculatorLinks = page.getByRole("link", { name: /연금 계산기/ });
    // visible한 링크 클릭 (first() — 시트가 z-30으로 상단에 위치)
    await calculatorLinks.filter({ hasText: "연금 계산기" }).first().click();
    await expect(page).toHaveURL(/\/calculator/);
  });

  test("더보기 시트 배경 탭으로 닫힌다", async ({ page, isMobile }) => {
    if (!isMobile) return;
    await page.goto("/");
    const mobileNav = page.locator("nav.fixed");
    await mobileNav.getByText("더보기").click();
    // 시트 열림 확인 — "대가 13F"는 시트 전용 텍스트
    const markerText = page.getByText("대가 13F", { exact: true });
    await expect(markerText).toBeVisible();
    // 배경(검은 오버레이) 클릭
    await page.locator(".bg-black\\/40").click();
    await expect(markerText).toBeHidden({ timeout: 3_000 });
  });
});
