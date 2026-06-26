/**
 * calculator.spec.ts
 *
 * 연금 계산기(/calculator) 스모크 테스트
 *
 * 5개 탭(적립식·목표 역산·세액공제·연금 수령·연금 로드맵) 전환 및
 * 기본 계산 결과 렌더 검증.
 * 외부 API 미의존 — 완전 클라이언트 계산.
 * 쓰기 동작 없음.
 *
 * 주의: "연금 수령"은 탭 버튼과 "연금 수령 →" 이동 버튼 2개가 존재.
 * exact: true + 탭 컨테이너로 스코핑하여 strict mode 오류 방지.
 */
import { test, expect } from "@playwright/test";

test.describe("연금 계산기", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/calculator");
  });

  test("H1이 '연금 계산기'이다", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "연금 계산기", level: 1 })).toBeVisible();
  });

  test("5개 탭 버튼이 모두 렌더된다", async ({ page }) => {
    // 탭 컨테이너: "flex gap-1 bg-gray-100 rounded-xl p-0.5 overflow-x-auto"
    // "연금 수령" 이름은 탭 버튼 + "연금 수령 →" 이동 버튼 2개 존재
    // → exact: true로 정확히 일치하는 탭 버튼만 선택
    for (const label of ["적립식 계산", "목표 역산", "세액공제", "연금 수령", "연금 로드맵"]) {
      await expect(
        page.getByRole("button", { name: label, exact: true }).first()
      ).toBeVisible();
    }
  });

  test("적립식 탭(기본): '투자 설정' 카드와 결과 카드가 렌더된다", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "투자 설정" })).toBeVisible();
    // 결과 카드에 '최종 금액' 텍스트 존재
    await expect(page.getByText("최종 금액")).toBeVisible();
    await expect(page.getByText("수익금")).toBeVisible();
  });

  test("목표 역산 탭 전환: '목표 설정' 카드 렌더", async ({ page }) => {
    await page.getByRole("button", { name: "목표 역산", exact: true }).click();
    await expect(page.getByRole("heading", { name: "목표 설정" })).toBeVisible();
    // 필요 월 투자금 결과 카드 존재
    await expect(page.getByText("필요").first()).toBeVisible();
  });

  test("세액공제 탭 전환: '납입 정보' 카드와 환급액 렌더", async ({ page }) => {
    await page.getByRole("button", { name: "세액공제", exact: true }).click();
    await expect(page.getByRole("heading", { name: "납입 정보" })).toBeVisible();
    await expect(page.getByText("환급받는 세금")).toBeVisible();
    await expect(page.getByText("첫해 실효 수익률")).toBeVisible();
  });

  test("연금 수령 탭 전환: '수령 조건 설정' 카드와 결과 렌더", async ({ page }) => {
    // exact: true → 탭 버튼("연금 수령")만 선택, "연금 수령 →" 이동 버튼 제외
    await page.getByRole("button", { name: "연금 수령", exact: true }).click();
    await expect(page.getByRole("heading", { name: "수령 조건 설정" })).toBeVisible();
    await expect(page.getByText("월 수령액 (세후)")).toBeVisible();
  });

  test("연금 로드맵 탭 전환: '평생 자산 흐름' 차트 섹션 렌더", async ({ page }) => {
    await page.getByRole("button", { name: "연금 로드맵", exact: true }).click();
    await expect(page.getByText("평생 자산 흐름")).toBeVisible();
    await expect(page.getByText("자산 소진 나이")).toBeVisible();
  });

  test("적립식: 기본값으로 최종 금액이 계산·표시된다", async ({ page }) => {
    // 기본 월 50만원 × 20년 × 7% → 0원이 아닌 금액 표시
    const resultCard = page.locator("div").filter({ hasText: "최종 금액" }).first();
    await expect(resultCard).toBeVisible();
    const resultText = await resultCard.textContent();
    // 숫자(금액)가 포함돼 있어야 함
    expect(resultText).toMatch(/[0-9]/);
  });
});
