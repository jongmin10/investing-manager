import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GURU_DEFS, getChangeSummary } from "@/lib/guru-collector";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const def  = GURU_DEFS.find((g) => g.id === id);
  if (!def) return NextResponse.json({ error: "not found" }, { status: 404 });
  const guru = await prisma.guru.findUnique({ where: { id } });

  const quarters = await prisma.guruHolding.findMany({
    where:    { guruId: id },
    distinct: ["quarter"],
    orderBy:  { quarter: "desc" },
    select:   { quarter: true },
  });
  const quarterList = quarters.map((q) => q.quarter);

  const selectedQ    = req.nextUrl.searchParams.get("quarter") ?? quarterList[0] ?? null;
  const changeFilter = req.nextUrl.searchParams.get("change"); // null | "new" | "added" | "reduced" | "sold"

  if (!selectedQ) {
    return NextResponse.json({ guru: def, quarter: null, quarters: [], holdings: [], totalValueM: 0, changes: null });
  }

  // "sold" 필터 미선택 시 기본 숨김
  const changeWhere = changeFilter
    ? { changeType: changeFilter }
    : { changeType: { not: "sold" as const } };

  const [holdings, totalAgg, changes] = await Promise.all([
    prisma.guruHolding.findMany({
      where:   { guruId: id, quarter: selectedQ, ...changeWhere },
      orderBy: changeFilter === "sold" ? { company: "asc" } : { value: "desc" },
      take:    20,
    }),
    prisma.guruHolding.aggregate({
      where: { guruId: id, quarter: selectedQ, changeType: { not: "sold" } },
      _sum:  { value: true },
    }),
    getChangeSummary(id, selectedQ),
  ]);

  return NextResponse.json({
    guru:          def,
    quarter:       selectedQ,
    quarters:      quarterList,
    holdings:      holdings.map((h, i) => ({ ...h, rank: i + 1 })),
    totalValueM:   Math.round((totalAgg._sum.value ?? 0) / 1_000_000),
    totalAssetsM:  guru?.totalAssetsM ?? null,
    cashM:         guru?.cashM        ?? null,
    assetsQuarter: guru?.assetsQuarter ?? null,
    changes,
  });
}
