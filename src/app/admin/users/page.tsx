/**
 * /admin/users — 관리자 사용자 목록 페이지 (서버 컴포넌트)
 *
 * isAdminEmail 가드 → 미충족 시 notFound()(존재 은닉, api-status 패턴 동일).
 * 초기 데이터를 서버사이드 Prisma 직접 조회로 가져와 클라이언트 테이블에 prop 전달.
 * DateTime 은 ISO 문자열로 직렬화해 클라이언트 타입과 일관성 유지.
 */

import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import UsersTable, { type UserRow } from "./UsersTable";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    notFound();
  }

  const usersRaw = await prisma.user.findMany({
    select: { id: true, email: true, name: true, createdAt: true, lastLoginAt: true, loginCount: true },
    orderBy: { createdAt: "desc" },
  });

  const users: UserRow[] = usersRaw.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    loginCount: u.loginCount,
  }));

  return <UsersTable initialUsers={users} />;
}
