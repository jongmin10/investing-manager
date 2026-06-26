import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/api-status (규격 §6)
 * 외부 API 헬스 전체 + 최근 API 요청 로그 N건 조회.
 * isAdminEmail 가드 — 미충족 시 404(존재 은닉, §8-5 확정).
 *
 * 쿼리: ?limit=N (기본 100, 최대 300) — 최근 API 요청 로그 건수.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(300, Math.max(1, Number(searchParams.get("limit")) || 100));

  const [health, requests] = await Promise.all([
    prisma.externalApiHealth.findMany({ orderBy: { apiKey: "asc" } }),
    prisma.apiRequestLog.findMany({ orderBy: { createdAt: "desc" }, take: limit }),
  ]);

  return NextResponse.json({ health, requests, serverTime: new Date().toISOString() });
}
