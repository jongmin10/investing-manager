/**
 * tmp_breakout.spec.ts — 52주 신고가 돌파 필터 QA 검증
 * Sam (QA) 임시 검증 스펙 — 검증 완료 후 삭제 또는 e2e/screener.spec.ts에 병합
 */
import { test, expect } from "@playwright/test";

test.describe("신고가 돌파 필터", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/screener");
    await expect(page.getByText("검색 중...")).toBeHidden({ timeout: 15_000 });
  });

  // ── 1. 토글 기본 렌더 ──
  test("토글 '조정 후 신고가 돌파'가 렌더된다", async ({ page }) => {
    await expect(page.getByText("조정 후 신고가 돌파")).toBeVisible();
  });

  // ── 2. 토글 a11y: role=switch, aria-checked, 키보드 ──
  test("토글 role=switch + aria-checked=false (기본)", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: /조정 후 신고가 돌파/ });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("토글 클릭 시 aria-checked=true로 변경", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: /조정 후 신고가 돌파/ });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    // 다시 OFF
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("토글 키보드(Space/Enter) 작동", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: /조정 후 신고가 돌파/ });
    await toggle.focus();
    await toggle.press("Space");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.press("Space");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.press("Enter");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  // ── 3. 토글 OFF 시 파라미터 패널 숨김 ──
  test("토글 OFF 시 조정 기간 프리셋이 보이지 않는다", async ({ page }) => {
    // 기본 OFF 상태
    await expect(page.getByText("1개월 조정 후")).not.toBeVisible();
    await expect(page.getByText("3개월 조정 후")).not.toBeVisible();
    await expect(page.getByText("6개월 조정 후")).not.toBeVisible();
  });

  // ── 4. 토글 ON 시 프리셋 노출 ──
  test("토글 ON 시 조정 기간 프리셋(1·3·6개월) 노출", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: /조정 후 신고가 돌파/ });
    await toggle.click();
    await expect(page.getByRole("button", { name: "1개월 조정 후" })).toBeVisible();
    await expect(page.getByRole("button", { name: "3개월 조정 후" })).toBeVisible();
    await expect(page.getByRole("button", { name: "6개월 조정 후" })).toBeVisible();
  });

  test("토글 ON 시 돌파 시점 프리셋(오늘·이번주·최근2주) 노출", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: /조정 후 신고가 돌파/ });
    await toggle.click();
    await expect(page.getByRole("button", { name: "오늘 돌파" })).toBeVisible();
    await expect(page.getByRole("button", { name: "이번 주 돌파" })).toBeVisible();
    await expect(page.getByRole("button", { name: "최근 2주 돌파" })).toBeVisible();
  });

  // ── 5. 정렬 "신고가 돌파 최신순" — breakout ON일 때만 노출 (§8.4) ──
  test("정렬 드롭다운: breakout OFF → '신고가 돌파 최신순' 없음", async ({ page }) => {
    const sortSelect = page.locator("select").filter({ hasText: "52주 고가 근접도" });
    await expect(sortSelect).toBeVisible();
    // breakout OFF 상태에서 '신고가 돌파 최신순' 옵션이 없어야 함
    await expect(sortSelect.locator("option", { hasText: "신고가 돌파 최신순" })).not.toBeVisible();
  });

  test("정렬 드롭다운: breakout ON → '신고가 돌파 최신순' 노출", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: /조정 후 신고가 돌파/ });
    await toggle.click();
    // 정렬 select는 기본값 "52주 고가 근접도" 옵션을 포함하는 select (두 번째 select)
    const sortSelect = page.locator("select").filter({ hasText: "52주 고가 근접도" });
    await expect(sortSelect.locator("option[value='breakoutDate']")).toBeAttached();
  });

  // ── 6. breakout ON → API 호출 후 "히스토리 분석 중..." 로딩 ──
  test("토글 ON 시 '히스토리 분석 중...' 로딩 텍스트 노출 후 결과", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: /조정 후 신고가 돌파/ });
    await toggle.click();
    // 로딩 중 "히스토리 분석 중..." 잠시 나타남 (빠를 수도 있어 toBeHidden까지만 확인)
    await expect(page.getByText("히스토리 분석 중...")).toBeHidden({ timeout: 20_000 });
  });

  // ── 7. breakout ON → 빈 결과 전용 카피 ──
  test("breakout ON 결과 없을 때 전용 빈 결과 문구", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: /조정 후 신고가 돌파/ });
    await toggle.click();
    await expect(page.getByText("히스토리 분석 중...")).toBeHidden({ timeout: 20_000 });
    // 결과가 0개일 때 전용 카피 ("돌파 조건에 맞는 종목이 없습니다." OR 실제 종목이 있을 수도)
    const hasBreakoutItems = await page.locator("span:has-text('돌파')").isVisible().catch(() => false);
    const hasEmptyMsg = await page.getByText("돌파 조건에 맞는 종목이 없습니다.").isVisible().catch(() => false);
    expect(hasBreakoutItems || hasEmptyMsg).toBe(true);
  });

  // ── 8. 고급 설정 접힘/펼침 ──
  test("고급 설정 토글: 접힘 기본, 클릭 시 슬라이더 노출", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: /조정 후 신고가 돌파/ });
    await toggle.click();
    // 기본: 고급 설정 접힘 (슬라이더 미노출)
    await expect(page.locator("#breakout-advanced-panel")).not.toBeVisible();
    // 고급 설정 버튼 클릭
    await page.getByRole("button", { name: /고급 설정/ }).click();
    await expect(page.locator("#breakout-advanced-panel")).toBeVisible();
    // 슬라이더 존재 확인
    await expect(page.locator("#breakout-tolerance")).toBeVisible();
    await expect(page.locator("#breakout-quiet-max")).toBeVisible();
  });

  // ── 9. 고급 설정 aria-valuetext ──
  test("허용 오차 슬라이더 aria-valuetext 기본값", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: /조정 후 신고가 돌파/ });
    await toggle.click();
    await page.getByRole("button", { name: /고급 설정/ }).click();
    const toleranceSlider = page.locator("#breakout-tolerance");
    await expect(toleranceSlider).toHaveAttribute("aria-valuetext", "0.5% 허용 오차");
  });

  // ── 10. breakout OFF 시 정렬이 breakoutDate라면 자동으로 해제 ──
  test("breakout ON→정렬선택→OFF 시 정렬이 default로 복귀", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: /조정 후 신고가 돌파/ });
    await toggle.click();
    // 정렬 select는 기본값 "52주 고가 근접도" 옵션을 포함하는 select (두 번째 select)
    const sortSelect = page.locator("select").filter({ hasText: "52주 고가 근접도" });
    await sortSelect.selectOption("breakoutDate");
    // 토글 OFF
    await toggle.click();
    // breakoutDate 옵션이 사라져야 함 (useBreakout=false → 조건부 렌더 제거)
    await expect(sortSelect.locator("option[value='breakoutDate']")).not.toBeAttached();
  });

  // ── 11. 디스클레이머 노출 ──
  test("디스클레이머가 노출된다", async ({ page }) => {
    await expect(page.getByText(/투자 결정의 근거로 사용하지 마세요/)).toBeVisible();
  });

  // ── 12. 프리셋 aria-pressed ──
  test("조정 기간 프리셋 aria-pressed 상태 반영", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: /조정 후 신고가 돌파/ });
    await toggle.click();
    // 기본: 3개월(60) 선택 상태
    const btn3m = page.getByRole("button", { name: "3개월 조정 후" });
    await expect(btn3m).toHaveAttribute("aria-pressed", "true");
    // 1개월 클릭
    const btn1m = page.getByRole("button", { name: "1개월 조정 후" });
    await btn1m.click();
    await expect(btn1m).toHaveAttribute("aria-pressed", "true");
    await expect(btn3m).toHaveAttribute("aria-pressed", "false");
  });
});
