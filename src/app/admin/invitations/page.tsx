/**
 * /admin/invitations — 관리자 초대 발급/관리 페이지 (서버 컴포넌트)
 *
 * isAdminEmail 가드 → 미충족 시 notFound()(존재 은닉, 기존 admin 페이지 패턴).
 * 초기 목록을 서버사이드 Prisma 직접 조회로 가져와 클라이언트 패널에 전달.
 */

import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { inviteState } from "@/lib/invite";
import InvitationsPanel, { type InviteRow } from "./InvitationsPanel";

export const dynamic = "force-dynamic";

export default async function AdminInvitationsPage() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    notFound();
  }

  const rows = await prisma.invitation.findMany({ orderBy: { createdAt: "desc" }, take: 100 });

  const invitations: InviteRow[] = rows.map((inv) => ({
    id: inv.id,
    email: inv.email,
    state: inviteState(inv),
    createdBy: inv.createdBy,
    createdAt: inv.createdAt.toISOString(),
    expiresAt: inv.expiresAt?.toISOString() ?? null,
    usedAt: inv.usedAt?.toISOString() ?? null,
    tokenHint: inv.usedAt ? null : `${inv.token.slice(0, 6)}…`,
  }));

  return <InvitationsPanel initialInvites={invitations} />;
}
