/**
 * screener.spec.ts
 *
 * 종목 스크리너(/screener) 스모크 테스트
 *
 * 검증:
 * - 페이지 헤더 렌더
 * - 필터 패널 렌더(시장·업종·정렬 컨트롤)
 * - 결과 테이블 렌더(로딩 종료 후 헤더 확인)
 * - 수집 버튼은 클릭하지 않음 (읽기 전용)
 *
 * 주의:
 * - "현재가"는 툴팁·정렬옵션·컬럼헤더 등 여러 곳에 존재 → 컬럼헤더 span으로 스코핑
 * - "/개 종목/"은 결과카운트 p + "재무 데이터 보유" span 2곳 존재 → p 태그로 스코핑
 */
import { test, expect } from "@playwright/test";

test.describe("종목 스크리너", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/screener");
    // 초기 로딩 완료 대기 — "검색 중..." 텍스트가 사라지길 기다림
    await expect(page.getByText("검색 중...")).toBeHidden({ timeout: 15_000 });
  });

  test("H1이 '종목 스크리너'이다", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "종목 스크리너", level: 1 })).toBeVisible();
  });

  test("'코스피·코스닥 시총 상위 200개' 배지가 표시된다", async ({ page }) => {
    await expect(page.getByText(/시총 상위 200개/)).toBeVisible();
  });

  test("필터 패널: 시장 버튼(전체·코스피·코스닥)이 렌더된다", async ({ page }) => {
    // "전체" 버튼: 시장필터 + 등락률필터 두 곳에 각각 존재 → strict mode 오류 발생
    // → toHaveCount(2)로 둘 다 렌더됨을 검증 (각 필터 1개씩)
    await expect(page.getByRole("button", { name: "전체", exact: true })).toHaveCount(2);
    // "코스피"·"코스닥"은 시장필터에만 존재 → strict mode 안전
    await expect(page.getByRole("button", { name: "코스피", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "코스닥", exact: true })).toBeVisible();
  });

  test("필터 패널: 업종 셀렉트박스가 존재한다", async ({ page }) => {
    await expect(page.getByText("업종").first()).toBeVisible();
    // select 요소 확인
    await expect(page.getByRole("combobox").first()).toBeVisible();
  });

  test("결과 테이블 컬럼 헤더(종목·현재가·등락률)가 렌더된다", async ({ page }) => {
    // 컬럼 헤더는 "grid ... bg-gray-50 border-b" 내 span.text-right 에 위치
    // "현재가"는 여러 곳에 있으므로 정확히 일치하는 span의 first()로 찾음
    await expect(page.getByText("종목", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("현재가", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("등락률", { exact: true }).first()).toBeVisible();
  });

  test("결과: 데이터 있으면 N개 종목 표시, 없으면 빈 결과 문구가 표시된다", async ({ page }) => {
    // 결과 카운트 p 태그: "text-sm font-semibold text-gray-800"
    // "재무 데이터 보유" span과 구분하기 위해 p 태그로 스코핑
    const resultCountP = page.locator("p.text-sm.font-semibold.text-gray-800").filter({ hasText: /개 종목/ });
    const hasItems = await resultCountP.isVisible().catch(() => false);
    const hasEmpty = await page.getByText("조건에 맞는 종목이 없습니다.").isVisible().catch(() => false);
    // 둘 중 하나는 반드시 표시
    expect(hasItems || hasEmpty).toBe(true);
  });

  test("수집 버튼이 존재하되 클릭하지 않는다", async ({ page }) => {
    // 수집 버튼 존재만 확인 (쓰기 동작 금지)
    await expect(page.getByRole("button", { name: /주가 수집/ })).toBeVisible();
  });

  test("시장 필터: '코스피'를 클릭하면 URL이 유지되고 결과가 재렌더된다", async ({ page }) => {
    const filterPanel = page.locator(".bg-white.border.border-gray-200.rounded-2xl.p-5").first();
    await filterPanel.getByRole("button", { name: "코스피" }).click();
    // 필터 버튼은 URL을 변경하지 않고 상태만 바꾸므로 URL은 /screener 유지
    await expect(page).toHaveURL(/\/screener$/);
    // 재로딩 후 결과 대기
    await expect(page.getByText("검색 중...")).toBeHidden({ timeout: 10_000 });
  });

  test("등락률 프리셋 '상승' 클릭 후 결과 재렌더", async ({ page }) => {
    await page.getByRole("button", { name: "상승", exact: true }).click();
    await expect(page.getByText("검색 중...")).toBeHidden({ timeout: 10_000 });
    // 결과 상태 확인
    const resultCountP = page.locator("p.text-sm.font-semibold.text-gray-800").filter({ hasText: /개 종목/ });
    const hasItems = await resultCountP.isVisible().catch(() => false);
    const hasEmpty = await page.getByText("조건에 맞는 종목이 없습니다.").isVisible().catch(() => false);
    expect(hasItems || hasEmpty).toBe(true);
  });
});
