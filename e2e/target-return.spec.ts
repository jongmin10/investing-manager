/**
 * target-return.spec.ts
 *
 * 목표 수익률 기반 자산배분 UI e2e 테스트 (설계 §10.2)
 *
 * 전제: 로그인된 사용자 + 성향 진단 완료 (session.json / storageState)
 * 계정 성향: 위험중립형(MODERATE) → 7.0% 설정 시 riskGap=1 (모달 없음)
 *
 * 테스트 종료 후 반드시 DELETE /api/portfolio/target 로 계정 원복
 * (afterAll — 다른 스펙 영향 방지)
 */
import { test, expect, Page } from "@playwright/test";

async function waitForPortfolio(page: Page) {
  await page.goto("/portfolio");
  await page
    .locator('[aria-label="포트폴리오 로딩 중"]')
    .waitFor({ state: "hidden", timeout: 10_000 })
    .catch(() => {
      // 스피너가 없으면(이미 완료 or noProfile) 무시
    });
}

test.describe("목표 수익률 기반 자산배분", () => {
  // 테스트 종료 후 목표 수익률 해제 (계정 원복)
  test.afterAll(async ({ request }) => {
    try {
      await request.delete("/api/portfolio/target");
    } catch {
      // 정리 실패는 무시 (다음 실행에서 재정리)
    }
  });

  test.beforeEach(async ({ page }) => {
    await waitForPortfolio(page);
  });

  // ── (a) 성향 카드에 연 예상 수익률 표시 ──────────────────────────────
  test("(a) 성향 카드에 연 예상 수익률이 표시된다", async ({ page }) => {
    const hasPortfolio = await page
      .getByRole("heading", { name: "투자전략 플래너", level: 1 })
      .isVisible();
    if (!hasPortfolio) {
      test.skip(true, "성향 진단 데이터 없음");
      return;
    }

    // 카드에 "연 예상 수익률 X.X%" 텍스트가 보여야 함
    await expect(page.getByText(/연 예상 수익률 \d+\.\d+%/)).toBeVisible();

    // 수익률 분석 탭의 CAGR과 수치가 일치하는지 교차 확인
    const cardText = await page.getByText(/연 예상 수익률 \d+\.\d+%/).textContent();
    const cardMatch = cardText?.match(/(\d+\.\d+)%/);

    if (cardMatch) {
      const cardCagr = parseFloat(cardMatch[1]);

      // 수익률 분석 탭으로 이동
      await page.getByRole("tab", { name: "수익률 분석" }).click();
      await expect(page.locator("#panel-returns")).toBeVisible();

      // CAGR 표시값이 카드와 일치해야 함 — panel 내부로 스코핑해 strict 위반 방지
      await expect(
        page.locator("#panel-returns").getByText(
          new RegExp(`\\+${cardCagr.toFixed(1).replace(".", "\\.")}%`)
        ).first()
      ).toBeVisible();
    }
  });

  // ── (b) 목표 설정 → 적용 → 카드 표기 + 배지 + 새로고침 유지 ───────────
  test("(b) 목표 설정 패널 열기 → 7.0 입력 → 적용 → 카드 + 배지 + 새로고침 유지", async ({ page, isMobile }) => {
    const hasPortfolio = await page
      .getByRole("heading", { name: "투자전략 플래너", level: 1 })
      .isVisible();
    if (!hasPortfolio) {
      test.skip(true, "성향 진단 데이터 없음");
      return;
    }

    // 패널 열기
    await page.getByRole("button", { name: /목표 설정/ }).click();

    // 슬라이더가 보이는지 확인
    await expect(
      page.getByRole("slider", { name: "연 목표 수익률" })
    ).toBeVisible();

    // 숫자 입력으로 7.0 입력
    const numInput = page.getByLabel("목표 수익률 직접 입력");
    await numInput.fill("7");
    await numInput.press("Tab");

    // 미리보기 렌더 확인 (기대 연 X.X%)
    await expect(page.getByText(/기대 연 \d+\.\d+%/)).toBeVisible();

    // 모바일 스크린샷 (test-results/ 는 .gitignore에 있음)
    if (isMobile) {
      await page.screenshot({ path: "test-results/target-ui-mobile.png" });
    }

    // riskGap=1이므로 모달 없이 바로 적용 — "적용하기" 클릭
    await page.getByRole("button", { name: "적용하기" }).click();

    // PUT 완료 대기: 카드에 "목표 수익률 적용 중" 표기
    await expect(page.getByText("🎯 목표 수익률 적용 중")).toBeVisible({ timeout: 8_000 });

    // 자산 배분 탭으로 이동해서 배지 확인
    await page.getByRole("tab", { name: "자산 배분" }).click();
    await expect(page.locator("#panel-allocation")).toBeVisible();
    await expect(page.getByText("목표 수익률 반영됨")).toBeVisible();

    // 새로고침 후에도 TARGET 모드 유지
    await page.reload();
    await page
      .locator('[aria-label="포트폴리오 로딩 중"]')
      .waitFor({ state: "hidden", timeout: 10_000 })
      .catch(() => {});

    await expect(page.getByText("🎯 목표 수익률 적용 중")).toBeVisible({ timeout: 8_000 });

    // 배지도 유지
    await page.getByRole("tab", { name: "자산 배분" }).click();
    await expect(page.getByText("목표 수익률 반영됨")).toBeVisible();
  });

  // ── (c) 해제 → 원래 RISK_TYPE 상태 복귀 ──────────────────────────────
  test("(c) 해제 → 원래 성향 배분 상태 복귀", async ({ page }) => {
    const hasPortfolio = await page
      .getByRole("heading", { name: "투자전략 플래너", level: 1 })
      .isVisible();
    if (!hasPortfolio) {
      test.skip(true, "성향 진단 데이터 없음");
      return;
    }

    // TARGET 모드가 아니라면 먼저 목표를 설정 (이 테스트를 독립 실행할 때 대비)
    const isTargetMode = await page.getByText("🎯 목표 수익률 적용 중").isVisible();
    if (!isTargetMode) {
      await page.getByRole("button", { name: /목표 설정/ }).click();
      const numInput = page.getByLabel("목표 수익률 직접 입력");
      await numInput.fill("7");
      await numInput.press("Tab");
      await page.getByRole("button", { name: "적용하기" }).click();
      await expect(page.getByText("🎯 목표 수익률 적용 중")).toBeVisible({ timeout: 8_000 });
    }

    // 해제 버튼 클릭
    await page.getByRole("button", { name: "해제" }).click();

    // RISK_TYPE 모드 복귀 — 카드에 "연 예상 수익률 X%" 다시 표시
    await expect(page.getByText(/연 예상 수익률 \d+\.\d+%/)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("🎯 목표 수익률 적용 중")).not.toBeVisible();

    // 자산 배분 탭: "목표 수익률 반영됨" 배지 사라짐
    await page.getByRole("tab", { name: "자산 배분" }).click();
    await expect(page.getByText("목표 수익률 반영됨")).not.toBeVisible();
  });
});
