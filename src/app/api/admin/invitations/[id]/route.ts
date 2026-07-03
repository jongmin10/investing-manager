import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/invitations/:id — 미사용 초대 폐기(규격 §5.2).
 * Next.js 16: params 는 Promise (AGENTS.md breaking change).
 * isAdminEmail 가드 — 미충족 시 404.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const { id } = await params;

  // 이미 사용된 초대는 이력 보존을 위해 삭제하지 않음.
  const deleted = await prisma.invitation.deleteMany({ where: { id, usedAt: null } });
  if (deleted.count === 0) {
    return NextResponse.json({ error: "폐기할 수 없는 초대입니다(존재하지 않거나 이미 사용됨)." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
