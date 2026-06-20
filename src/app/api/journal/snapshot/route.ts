import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const types = ["KOSPI", "SP500", "KRW_USD", "US_TREASURY_10Y"];

  const records = await Promise.all(
    types.map((type) =>
      prisma.indicatorRecord.findFirst({
        where: { type },
        orderBy: { recordedAt: "desc" },
        select: { type: true, value: true },
      })
    )
  );

  const map = Object.fromEntries(records.filter(Boolean).map((r) => [r!.type, r!.value]));

  return NextResponse.json({
    kospi:  map["KOSPI"]          ?? null,
    sp500:  map["SP500"]          ?? null,
    krwUsd: map["KRW_USD"]        ?? null,
    us10y:  map["US_TREASURY_10Y"] ?? null,
  });
}
