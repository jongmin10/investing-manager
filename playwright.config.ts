import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E 설정
 *
 * - 데스크톱(Chromium) + 모바일(Pixel 5 에뮬레이션, 393px) 두 프로젝트 병렬 실행
 * - webServer: npm run dev 자동 기동 (포트 3000)
 * - 산출물: /test-results/, /playwright-report/ — .gitignore 처리됨
 */
export default defineConfig({
  testDir: "./e2e",
  /* 각 테스트 최대 30초 */
  timeout: 30_000,
  /* assertion 기본 타임아웃 */
  expect: { timeout: 8_000 },
  /* 실패 시 재시도 없음 (로컬 스모크 기준) */
  retries: 0,
  /* 워커 수 — dev 빌드 + SQLite/Postgres 경합 방지를 위해 1로 직렬화 */
  workers: 1,
  /* HTML 리포트 경로 */
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],
  /* 모든 프로젝트 공통 설정 */
  use: {
    baseURL: "http://localhost:3000",
    /* 실패 시 스크린샷 자동 저장 */
    screenshot: "only-on-failure",
    /* 실패 시 비디오 저장 */
    video: "retain-on-failure",
    /* 느린 네트워크 환경 대비 navigation 타임아웃 */
    navigationTimeout: 20_000,
    /* 로케일 — 한국어 환경 */
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },

  projects: [
    /* ── 인증 픽스처 설정 (반드시 먼저 실행) ── */
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },

    /* ── 데스크톱 (Chromium 1280×720) ── */
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/session.json",
      },
      dependencies: ["setup"],
    },

    /* ── 모바일 (Pixel 5: 393×851, deviceScaleFactor 2.75) ── */
    {
      name: "mobile",
      use: {
        ...devices["Pixel 5"],
        storageState: "e2e/.auth/session.json",
      },
      dependencies: ["setup"],
    },
  ],

  /* 개발 서버 자동 기동 */
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    /* 이미 실행 중이면 재사용 */
    reuseExistingServer: true,
    /* 서버 기동 최대 60초 대기 */
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
