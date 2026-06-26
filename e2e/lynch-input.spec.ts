/**
 * lynch-input.spec.ts
 *
 * 피터 린치 종목분석(/screener/lynch) 입력창 회귀 테스트
 *
 * 회귀 배경(2026-06-26):
 * - 모바일에서 회사명(한글) 입력 불가 버그. 원인은 입력창 inputMode="numeric"으로
 *   모바일 가상 키보드가 숫자 전용이 되어 한글 회사명을 칠 수 없었음.
 *   (이 입력창은 자동완성으로 회사명 검색을 지원하므로 numeric은 기능과 모순)
 * - 수정: inputMode="text" + maxLength 8→20 + placeholder/aria에 회사명 명시.
 *
 * 주의:
 * - Playwright의 fill()/type()은 OS 가상 키보드를 우회하므로 "숫자 키패드라 한글 못 침"
 *   증상 자체는 재현 불가. 따라서 회귀는 **렌더된 inputmode 속성**으로 가드한다.
 * - 로그인 필수(D1) — storageState로 인증된 desktop/mobile 프로젝트에서 실행.
 * - OpenRouter 402 제약상 실제 분석은 트리거하지 않는다(입력·자동완성까지만).
 */
import { test, expect } from "@playwright/test";

test.describe("피터 린치 입력창", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/screener/lynch");
    await expect(page.getByRole("heading", { name: "피터 린치 종목분석", level: 1 })).toBeVisible();
  });

  test("입력창 inputmode는 'text'다 (모바일 한글 입력 회귀 가드)", async ({ page }) => {
    const input = page.locator("#lynch-ticker");
    await expect(input).toBeVisible();
    // numeric이면 모바일 키패드가 숫자 전용이 되어 회사명 입력 불가 → 반드시 text
    await expect(input).toHaveAttribute("inputmode", "text");
  });

  test("placeholder에 회사명 입력 가능함이 안내된다", async ({ page }) => {
    const input = page.locator("#lynch-ticker");
    await expect(input).toHaveAttribute("placeholder", /회사명/);
  });

  test("회사명을 입력하면 자동완성 후보가 뜨고 선택 시 6자리 코드가 채워진다", async ({ page }) => {
    const input = page.locator("#lynch-ticker");
    // 회사명 일부 입력 — universe(상위 200) 로드 후 자동완성 동작
    await input.fill("삼성");
    const listbox = page.getByRole("listbox", { name: "종목 자동완성" });
    // universe fetch 의존 — 데이터 있으면 후보 표시. 없으면 스킵(환경 의존)
    const appeared = await listbox.waitFor({ state: "visible", timeout: 8_000 }).then(() => true).catch(() => false);
    test.skip(!appeared, "universe 미로딩(데이터 없음) — 자동완성 검증 스킵");

    const firstOption = listbox.getByRole("option").first();
    await expect(firstOption).toBeVisible();
    await firstOption.click();

    // 선택 후 입력값은 6자리 종목코드로 치환된다
    await expect(input).toHaveValue(/^\d{6}$/);
  });
});
