import { NextResponse } from "next/server";
import { collectAllStocks } from "@/lib/stock-collector";

let collecting = false;

export async function POST() {
  if (collecting) {
    return NextResponse.json(
      { error: "이미 수집 중입니다. 잠시 후 다시 시도하세요." },
      { status: 429 }
    );
  }

  collecting = true;
  try {
    const result = await collectAllStocks();
    return NextResponse.json({
      ...result,
      message: `${result.updated}개 종목 업데이트 완료 (${(result.duration / 1000).toFixed(1)}초)`,
    });
  } finally {
    collecting = false;
  }
}

export async function GET() {
  return NextResponse.json({ collecting });
}
