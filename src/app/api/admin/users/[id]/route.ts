import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * 관리자 사용자 관리 — 로그인 차단 토글 / 삭제.
 * Next.js 16: params 는 Promise. isAdminEmail 가드(미충족 404).
 *
 * 안전장치:
 *  - 본인 계정에는 차단·삭제 불가(자기 잠금 방지).
 *  - 다른 관리자(ADMIN_EMAILS) 계정에는 차단·삭제 불가(상호 보호).
 */

/** 대상 사용자 조회 + 관리자/본인 보호 검사. 문제 시 에러 응답, 정상 시 { user, adminEmail }. */
async function guard(id: string) {
  const session = await auth();
  const adminEmail = session?.user?.email;
  if (!isAdminEmail(adminEmail)) {
    return { error: NextResponse.json({ error: "Not Found" }, { status: 404 }) };
  }
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
  if (!user) {
    return { error: NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 }) };
  }
  if (user.email.toLowerCase() === adminEmail!.toLowerCase()) {
    return { error: NextResponse.json({ error: "본인 계정에는 수행할 수 없습니다." }, { status: 400 }) };
  }
  if (isAdminEmail(user.email)) {
    return { error: NextResponse.json({ error: "관리자 계정에는 수행할 수 없습니다." }, { status: 400 }) };
  }
  return { user };
}

/** PATCH /api/admin/users/:id — 로그인 차단 토글. 요청: { blocked: boolean } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if (g.error) return g.error;

  let body: { blocked?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const blocked = body.blocked === true;

  const updated = await prisma.user.update({
    where: { id },
    data: { blockedAt: blocked ? new Date() : null },
    select: { id: true, blockedAt: true },
  });

  return NextResponse.json({ ok: true, id: updated.id, blockedAt: updated.blockedAt?.toISOString() ?? null });
}

/** DELETE /api/admin/users/:id — 사용자 삭제(연관 데이터 onDelete: Cascade 로 함께 삭제). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if (g.error) return g.error;

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
