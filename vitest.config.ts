import { defineConfig } from "vitest/config";

// 단위 테스트 전용 — e2e/*.spec.ts는 Playwright 소관이므로 제외
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
