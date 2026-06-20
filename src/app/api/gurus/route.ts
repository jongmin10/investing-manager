import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GURU_DEFS, getChangeSummary } from "@/lib/guru-collector";

export async function GET() {
  const gurus = await prisma.guru.findMany({ orderBy: { id: "asc" } });
  const guruMap = new Map(gurus.map((g) => [g.id, g]));

  const result = await Promise.all(
    GURU_DEFS.map(async (def) => {
      const guru = guruMap.get(def.id);
      if (!guru) return { ...def, latestQuarter: null, holdingsCount: 0, totalValueM: 0, topHoldings: [], changes: null, updatedAt: null };

      const latestHolding = await prisma.guruHolding.findFirst({
        where: { guruId: def.id },
        orderBy: { quarter: "desc" },
        select: { quarter: true },
      });
      const quarter = latestHolding?.quarter ?? null;
      if (!quarter) return { ...def, latestQuarter: null, holdingsCount: 0, totalValueM: 0, topHoldings: [], changes: null, updatedAt: guru.updatedAt };

      const [count, top, totalAgg, changes] = await Promise.all([
        prisma.guruHolding.count({ where: { guruId: def.id, quarter, changeType: { not: "sold" } } }),
        prisma.guruHolding.findMany({
          where:   { guruId: def.id, quarter, changeType: { not: "sold" } },
          orderBy: { value: "desc" },
          take:    3,
          select:  { ticker: true, company: true, portfolioPct: true },
        }),
        prisma.guruHolding.aggregate({
          where: { guruId: def.id, quarter, changeType: { not: "sold" } },
          _sum:  { value: true },
        }),
        getChangeSummary(def.id, quarter),
      ]);

      return {
        ...def,
        latestQuarter: quarter,
        holdingsCount: count,
        totalValueM:   Math.round((totalAgg._sum.value ?? 0) / 1_000_000),
        topHoldings:   top.map((h) => ({ ticker: h.ticker ?? h.company.slice(0, 5), company: h.company, portfolioPct: h.portfolioPct })),
        changes,
        totalAssetsM:  guru.totalAssetsM,
        cashM:         guru.cashM,
        assetsQuarter: guru.assetsQuarter,
        updatedAt:     guru.updatedAt,
      };
    })
  );

  return NextResponse.json({ gurus: result });
}
