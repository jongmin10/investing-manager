/**
 * auth.setup.ts
 *
 * 로그인 세션을 e2e/.auth/session.json 에 저장한다.
 * 이후 desktop / mobile 프로젝트는 이 storageState를 재사용한다.
 *
 * 로그인 폼 구조 (src/app/login/page.tsx 실제 확인 기준):
 *   - email:    input[type=email]    placeholder="example@email.com"
 *   - password: input[type=password] placeholder="비밀번호"
 *   - submit:   button "이메일로 계속하기"
 *   - label 태그에 htmlFor 없음 → getByPlaceholder 사용
 *
 * 개인 비밀번호 로그인(초대제 가입) 전환 후 — 테스트 계정은 prisma/seed.ts 가 생성.
 * NextAuth signIn("credentials") → redirect false → window.location.assign(callbackUrl)
 * callbackUrl 기본값: /portfolio
 */
import { test as setup, expect } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(__dirname, ".auth/session.json");

// prisma/seed.ts 의 TEST_ACCOUNT 와 일치해야 한다.
const TEST_EMAIL = "e2e-test@example.com";
const TEST_PASSWORD = "test-pass-1234";

setup("인증 세션 생성", async ({ page }) => {
  await page.goto("/login");

  // 페이지 H1 확인
  await expect(page.getByRole("heading", { name: "로그인", level: 1 })).toBeVisible();

  // 이메일 · 비밀번호 입력
  await page.getByPlaceholder("example@email.com").fill(TEST_EMAIL);
  await page.getByPlaceholder("비밀번호").fill(TEST_PASSWORD);

  // 로그인 버튼 클릭
  await page.getByRole("button", { name: "이메일로 계속하기" }).click();

  // 성공 시 /portfolio(기본 callbackUrl) 또는 /로 리다이렉트
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

  // 세션 저장
  await page.context().storageState({ path: AUTH_FILE });
});
