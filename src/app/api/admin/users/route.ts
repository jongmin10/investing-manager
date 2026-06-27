import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users
 * 로그인한 사용자 목록 조회 — 사용자 아이디(email/id) · 첫 로그인(createdAt) · 마지막 로그인(lastLoginAt).
 * isAdminEmail 가드 — 미충족 시 404(존재 은닉, api-status 패턴 동일).
 */
export async function GET() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, createdAt: true, lastLoginAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    })),
    serverTime: new Date().toISOString(),
  });
}
