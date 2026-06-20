import { NextRequest, NextResponse } from "next/server";
import { collectAllStocks } from "@/lib/stock-collector";
import { prisma } from "@/lib/prisma";

let collecting = false;

// Vercel 타임아웃(60초) 대응: offset/limit으로 배치 수집
export async function POST(req: NextRequest) {
  if (collecting) {
    return NextResponse.json({ error: "이미 수집 중입니다." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({})) as { offset?: number; limit?: number };
  const offset = body.offset ?? 0;
  const limit  = body.limit  ?? 30; // 30개씩 처리 (약 45초)

  collecting = true;
  try {
    const result = await collectAllStocks(undefined, { offset, limit });

    // 전체 종목 수 조회
    const totalStocks = await prisma.stock.count();
    const nextOffset  = offset + limit;
    const hasMore     = nextOffset < totalStocks;

    return NextResponse.json({
      ...result,
      offset,
      limit,
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
