import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildPortfolioResponse } from "@/lib/portfolio-response";

/**
 * 목표 수익률 설정/해제 (설계: docs/target-return-etf-recommendation-design.md §6.2~6.3)
 *
 * PUT    { rate: number } → RiskProfile.targetReturn 저장 (TARGET 모드 전환)
 * DELETE                  → targetReturn=null (RISK_TYPE 모드 복귀)
 *
 * 두 메서드 모두 GET /api/portfolio 와 동일한 전체 페이로드를 반환한다
 * (클라이언트가 한 왕복으로 4탭 데이터를 갱신).
 *
 * 정적 세그먼트 라우트 — Next.js 16의 dynamic params Promise 규칙과 무관.
 */

const MAX_TARGET_RATE = 50;

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let rate: unknown;
  try {
    ({ rate } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0 || rate > MAX_TARGET_RATE) {
    return NextResponse.json(
      { error: `rate must be a number in (0, ${MAX_TARGET_RATE}]` },
      { status: 400 }
    );
  }
  // 소수 1자리 round-half-up 정규화 (solveTargetAllocation §5.3-0과 동일 규칙)
  const normalized = Math.round(rate * 10) / 10;

  const profile = await prisma.riskProfile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No risk profile" }, { status: 404 });

  await prisma.riskProfile.update({
    where: { userId: session.user.id },
    data: { targetReturn: normalized },
  });

  const data = await buildPortfolioResponse(session.user.id);
  return NextResponse.json(data);
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.riskProfile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No risk profile" }, { status: 404 });

  await prisma.riskProfile.update({
    where: { userId: session.user.id },
    data: { targetReturn: null },
  });

  const data = await buildPortfolioResponse(session.user.id);
  return NextResponse.json(data);
}
