import { NextRequest } from "next/server";

/**
 * Vercel Cron / 내부 자기호출(self-chaining)용 공용 유틸.
 *
 * 배경: 야간 cron이 전체 유니버스(200종목)를 한 번의 함수 실행으로 처리하려다
 * 60초 함수 타임아웃(504)에 걸려 중단되던 문제를 해결하기 위해, 수집을 페이지
 * 단위로 쪼개고 각 슬라이스가 다음 슬라이스를 fire-and-forget 으로 트리거한다.
 */

/**
 * Vercel 환경에서 자기 자신을 호출할 절대 URL의 base 를 결정한다.
 * - 프로덕션: VERCEL_PROJECT_PRODUCTION_URL (안정적인 프로덕션 도메인)
 * - 프리뷰/그 외: VERCEL_URL (해당 배포의 도메인)
 * - 로컬 개발: NEXTAUTH_URL(예: http://localhost:3000) 폴백
 *
 * NEXTAUTH_URL 은 로컬에서 localhost 로 박혀 있어 프로덕션 self-fetch 기준으로
 * 신뢰할 수 없으므로 VERCEL_* 를 우선한다.
 */
export function getBaseUrl(req?: NextRequest): string {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  // 로컬: 들어온 요청의 origin 우선, 없으면 NEXTAUTH_URL
  if (req) {
    try {
      return new URL(req.url).origin;
    } catch {
      /* noop */
    }
  }
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

/** Vercel Cron 및 내부 self-fetch 인증 헤더 검증 */
export function isAuthorizedCron(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
}

/**
 * 다음 슬라이스를 비차단(fire-and-forget)으로 트리거한다.
 * 응답을 기다리지 않으므로 현재 함수 실행시간에 영향을 주지 않는다.
 * 실패해도 다음 cron 주기에 offset 0 부터 다시 시작되므로 안전(idempotent).
 */
export async function triggerNextSlice(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  const url = `${baseUrl}${path}`;
  try {
    // keepalive: 함수가 곧 종료돼도 요청이 끊기지 않도록
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
      },
      body: JSON.stringify(body),
      keepalive: true,
      // 트리거 자체는 빠르게 던지고 빠진다. 응답 본문은 소비하지 않는다.
      signal: AbortSignal.timeout(8_000),
    }).catch(() => {});
  } catch {
    /* 트리거 실패는 치명적이지 않음 — 다음 주기에 복구 */
  }
}
