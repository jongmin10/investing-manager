import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, validatePassword } from "@/lib/password";
import { inviteState } from "@/lib/invite";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/register — 초대 기반 회원가입 (규격: docs/signup-auth-spec.md §5.1).
 *
 * 요청: { email, name?, password, invite? }
 * 규칙:
 *  - 기존 계정 + passwordHash 있음        → 409 (이미 가입)
 *  - 기존 계정 + passwordHash 없음(레거시) → 셀프 클레임: 비밀번호 설정 (§6-A)
 *  - 신규 이메일                          → 개방 가입. 초대 토큰은 선택 —
 *                                           제공 시 검증 후 1회 소진, 미제공 시 그대로 생성.
 *
 * 성공 시 201. 클라이언트가 이어서 signIn("credentials")로 즉시 로그인.
 */
export async function POST(req: Request) {
  let body: { email?: string; name?: string; password?: string; invite?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const invite = (body.invite ?? "").trim();

  // 이메일 형식 검증(간단) — 공백·@ 최소 확인.
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "올바른 이메일을 입력해주세요." }, { status: 400 });
  }
  const pwError = validatePassword(password);
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 });
  }
  const name = (body.name ?? "").trim() || email.split("@")[0];

  const existing = await prisma.user.findUnique({ where: { email } });

  // ── 셀프 클레임(A): 기존 레거시 계정(비밀번호 미설정)에 비밀번호 설정 ──────────
  if (existing) {
    if (existing.passwordHash) {
      return NextResponse.json({ error: "이미 가입된 이메일입니다. 로그인해주세요." }, { status: 409 });
    }
    const passwordHash = await hashPassword(password);
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, name: existing.name ?? name },
    });
    return NextResponse.json({ ok: true, claimed: true }, { status: 201 });
  }

  // ── 신규 가입: 개방 가입(초대는 선택) ─────────────────────────────────────────
  const passwordHash = await hashPassword(password);

  // 초대 토큰이 제공된 경우에만 검증한다. 제공됐는데 무효면 거부(오해 방지).
  let inv: Awaited<ReturnType<typeof prisma.invitation.findUnique>> = null;
  if (invite) {
    inv = await prisma.invitation.findUnique({ where: { token: invite } });
    if (!inv || inviteState(inv) !== "active") {
      return NextResponse.json({ error: "유효하지 않거나 만료된 초대입니다." }, { status: 403 });
    }
    if (inv.email && inv.email.trim().toLowerCase() !== email) {
      return NextResponse.json({ error: "이 초대는 다른 이메일로 발급되었습니다." }, { status: 403 });
    }
  }

  try {
    // 초대가 있으면 생성+소진을 한 트랜잭션으로(이중 사용 방지). 없으면 단순 생성.
    if (inv) {
      const invId = inv.id;
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { email, name, passwordHash } });
        const consumed = await tx.invitation.updateMany({
          where: { id: invId, usedAt: null },
          data: { usedAt: new Date(), usedByUserId: user.id },
        });
        if (consumed.count === 0) throw new Error("INVITE_ALREADY_USED");
      });
    } else {
      await prisma.user.create({ data: { email, name, passwordHash } });
    }
  } catch (e) {
    if (e instanceof Error && e.message === "INVITE_ALREADY_USED") {
      return NextResponse.json({ error: "이미 사용된 초대입니다." }, { status: 403 });
    }
    // 이메일 unique 경합 등 — 이미 가입 처리로 안내.
    console.error("[register] 생성 실패", e);
    return NextResponse.json({ error: "가입에 실패했습니다. 다시 시도해주세요." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, claimed: false }, { status: 201 });
}
