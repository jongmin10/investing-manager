import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { generateInviteToken, inviteState, DEFAULT_INVITE_EXPIRY_DAYS } from "@/lib/invite";

export const dynamic = "force-dynamic";

/**
 * 관리자 초대 관리 API (규격: docs/signup-auth-spec.md §5.2).
 * isAdminEmail 가드 — 미충족 시 404(존재 은닉, 기존 admin 라우트 패턴).
 */

/** GET /api/admin/invitations — 발급 초대 목록(토큰 원문 마스킹, 상태 계산). */
export async function GET() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const invites = await prisma.invitation.findMany({ orderBy: { createdAt: "desc" }, take: 100 });

  return NextResponse.json({
    invitations: invites.map((inv) => ({
      id: inv.id,
      email: inv.email,
      state: inviteState(inv),
      createdBy: inv.createdBy,
      createdAt: inv.createdAt.toISOString(),
      expiresAt: inv.expiresAt?.toISOString() ?? null,
      usedAt: inv.usedAt?.toISOString() ?? null,
      // 토큰 원문은 노출하지 않음(발급 시 1회만). 미사용 초대는 앞 6자만 힌트로.
      tokenHint: inv.usedAt ? null : `${inv.token.slice(0, 6)}…`,
    })),
    serverTime: new Date().toISOString(),
  });
}

/**
 * POST /api/admin/invitations — 초대 생성.
 * 요청: { email?, expiresInDays? } → 생성 후 초대 링크(토큰 원문)를 1회 반환.
 */
export async function POST(req: Request) {
  const session = await auth();
  const adminEmail = session?.user?.email;
  if (!isAdminEmail(adminEmail)) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  let body: { email?: string; expiresInDays?: number } = {};
  try {
    body = await req.json();
  } catch {
    // 본문 없이 호출 가능(임의 이메일·기본 만료).
  }

  const email = body.email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "올바른 이메일을 입력해주세요." }, { status: 400 });
  }

  const days =
    typeof body.expiresInDays === "number" && body.expiresInDays > 0
      ? Math.min(body.expiresInDays, 365)
      : DEFAULT_INVITE_EXPIRY_DAYS;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const token = generateInviteToken();
  const inv = await prisma.invitation.create({
    data: { token, email, createdBy: adminEmail!, expiresAt },
  });

  return NextResponse.json(
    {
      id: inv.id,
      token, // 원문 — 이 응답에서만 노출.
      inviteUrl: `/signup?invite=${encodeURIComponent(token)}`,
      email: inv.email,
      expiresAt: inv.expiresAt?.toISOString() ?? null,
    },
    { status: 201 },
  );
}
