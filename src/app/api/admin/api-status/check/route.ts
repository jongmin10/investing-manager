import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { checkAllApiHealth } from "@/lib/api-health";

export const dynamic = "force-dynamic";
// 외부 6종 핑(각 8s 타임아웃, 병렬)이라 짧게 끝나지만 안전 여유.
export const maxDuration = 30;

const RATE_GUARD_MS = 60_000; // 최소 60초 간격(규격 §6)

/**
 * POST /api/admin/api-status/check (규격 §6)
 * 외부 API 헬스 즉시 재점검(온디맨드) → ExternalApiHealth upsert.
 * isAdminEmail 가드(미충족 404). 외부 호출 발생 → 60초 레이트 가드.
 */
export async function POST() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  // 레이트 가드: 마지막 체크가 60초 이내면 외부 호출 없이 캐시 반환(429).
  const last = await prisma.externalApiHealth.findFirst({ orderBy: { lastCheckedAt: "desc" } });
  if (last) {
    const elapsed = Date.now() - last.lastCheckedAt.getTime();
    if (elapsed < RATE_GUARD_MS) {
      const health = await prisma.externalApiHealth.findMany({ orderBy: { apiKey: "asc" } });
      return NextResponse.json(
        { throttled: true, retryAfterSec: Math.ceil((RATE_GUARD_MS - elapsed) / 1000), health },
        { status: 429, headers: { "Retry-After": String(Math.ceil((RATE_GUARD_MS - elapsed) / 1000)) } },
      );
    }
  }

  await checkAllApiHealth();
  const health = await prisma.externalApiHealth.findMany({ orderBy: { apiKey: "asc" } });
  return NextResponse.json({ throttled: false, health, checkedAt: new Date().toISOString() });
}

// 잘못된 메서드 안내 대신 존재 은닉을 위해 GET 도 404 처리.
export async function GET() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }
  return NextResponse.json({ error: "Method Not Allowed — use POST" }, { status: 405 });
}
