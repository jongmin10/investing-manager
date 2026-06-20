import { NextRequest, NextResponse } from "next/server";
import { collectAllFinancials, getFinancialStatus } from "@/lib/dart-collector";
import { prisma } from "@/lib/prisma";

let collecting = false;

// Vercel 타임아웃 대응: 20개씩 배치 처리 (종목당 ~2.5초 × 20 = ~50초)
export async function POST(req: NextRequest) {
  if (!process.env.DART_API_KEY) {
    return NextResponse.json(
      { error: "DART_API_KEY가 설정되지 않았습니다.", guide: [
          "1. https://opendart.fss.or.kr 에서 API 키 발급",
          "2. Vercel 환경변수에 DART_API_KEY 추가",
          "3. Redeploy 후 재시도",
        ],
      },
      { status: 400 }
    );
  }

  if (collecting) {
    return NextResponse.json({ error: "재무 데이터 수집 중입니다." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({})) as { offset?: number; limit?: number };
  const offset = body.offset ?? 0;
  const limit  = body.limit  ?? 20;

  collecting = true;
  try {
    const result = await collectAllFinancials({ offset, limit });
    const totalStocks = await prisma.stock.count();
    const nextOffset  = offset + limit;
    const hasMore     = nextOffset < totalStocks;

    return NextResponse.json({
      ...result,
      offset,
      limit,
      nextOffset: hasMore ? nextOffset : null,
      totalStocks,
      message: `${offset + 1}~${Math.min(offset + limit, totalStocks)}번 재무 수집 완료 (${result.updated}개)`,
    });
  } finally {
    collecting = false;
  }
}

export async function GET() {
  const status = await getFinancialStatus();
  return NextResponse.json({ collecting, ...status });
}
