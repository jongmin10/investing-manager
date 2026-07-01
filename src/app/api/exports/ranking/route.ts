import { NextRequest, NextResponse } from "next/server";
import {
  getExportRanking,
  isMetric,
  isValidYearMonth,
  currentYearMonth,
} from "@/lib/exports";

// GET /api/exports/ranking?ym=2026-06&metric=export&top=10
// - ym (선택): "YYYY-MM" (기본 현재월)
// - metric (선택): export|import|balance (기본 export)
// - top (선택): 상위 N (기본 10, 1~50)
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const ym = sp.get("ym") ?? currentYearMonth();
    const metric = sp.get("metric") ?? "export";
    const topRaw = Number(sp.get("top") ?? "10");

    if (!isValidYearMonth(ym)) {
      return NextResponse.json(
        { error: "ym 은 'YYYY-MM' 형식이어야 합니다.", ym },
        { status: 400 }
      );
    }
    if (!isMetric(metric)) {
      return NextResponse.json(
        { error: `metric 은 export|import|balance 여야 합니다.`, metric },
        { status: 400 }
      );
    }
    const top = Number.isFinite(topRaw) ? Math.min(Math.max(Math.trunc(topRaw), 1), 50) : 10;

    const data = await getExportRanking(ym, metric, top);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("[/api/exports/ranking]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
