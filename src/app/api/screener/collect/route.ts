import { NextRequest, NextResponse } from "next/server";
import { collectAllStocks } from "@/lib/stock-collector";
import { refreshStockUniverse } from "@/lib/universe";
import { prisma } from "@/lib/prisma";

let collecting = false;

// Vercel 타임아웃(60초) 대응: offset/limit으로 배치 수집
export async function POST(req: NextRequest) {
  if (collecting) {
    return NextResponse.json({ error: "이미 수집 중입니다." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({})) as { offset?: number; limit?: number };
  const offset = body.offset ?? 0;
  const limit  = body.limit  ?? 30; // 30개씩 처리

  collecting = true;
  try {
    // 첫 배치에서만 시총 유니버스를 자동 갱신 (순위 변동 반영)
    let universe = null;
    if (offset === 0) {
      universe = await refreshStockUniverse(200);
    }

    const result = await collectAllStocks(undefined, { offset, limit });

    // 유니버스(rank 보유) 크기 기준으로 다음 배치 판단 (없으면 전체 폴백)
    const rankedCount = await prisma.stock.count({ where: { rank: { not: null } } });
    const totalStocks = rankedCount > 0 ? rankedCount : await prisma.stock.count();
    const nextOffset  = offset + limit;
    const hasMore     = nextOffset < totalStocks;

    return NextResponse.json({
      ...result,
      offset,
      limit,
      universe,
      nextOffset: hasMore ? nextOffset : null,
      totalStocks,
      message: `${offset + 1}~${Math.min(offset + limit, totalStocks)}번 종목 업데이트 완료`,
    });
  } finally {
    collecting = false;
  }
}

export async function GET() {
  return NextResponse.json({ collecting });
}
