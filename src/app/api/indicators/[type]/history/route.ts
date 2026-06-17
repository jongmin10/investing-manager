import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { INDICATORS, IndicatorType } from "@/lib/indicators";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  const searchParams = request.nextUrl.searchParams;
  const period = searchParams.get("period") ?? "1y";

  if (!INDICATORS[type as IndicatorType]) {
    return NextResponse.json({ error: "Unknown indicator type" }, { status: 400 });
  }

  const periodDays: Record<string, number> = {
    "1m": 30,
    "3m": 90,
    "1y": 365,
    "3y": 1095,
  };

  const days = periodDays[period] ?? 365;
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);

  const records = await prisma.indicatorRecord.findMany({
    where: { type, recordedAt: { gte: fromDate } },
    orderBy: { recordedAt: "asc" },
    select: { value: true, recordedAt: true },
  });

  return NextResponse.json(records);
}
