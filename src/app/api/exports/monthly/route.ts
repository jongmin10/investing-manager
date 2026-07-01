import { NextRequest, NextResponse } from "next/server";
import {
  getExportSeries,
  isItemCode,
  isMetric,
  isValidYearMonth,
  currentYearMonth,
  DEFAULT_ITEM,
  ITEM_CODES,
} from "@/lib/exports";

// GET /api/exports/monthly?item=SEMICON&from=2015-01&to=2026-06&metric=export
// - item (필수): 내부 품목군 코드
// - from,to (선택): "YYYY-MM"
// - metric (선택): export|import|balance (기본 export)
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const item = sp.get("item") ?? DEFAULT_ITEM;
    const from = sp.get("from") ?? "2000-01";
    const to = sp.get("to") ?? currentYearMonth();
    const metric = sp.get("metric") ?? "export";

    if (!isItemCode(item)) {
      return NextResponse.json(
        { error: `지원하지 않는 item: ${item}`, supported: ITEM_CODES },
        { status: 400 }
      );
    }
    if (!isMetric(metric)) {
      return NextResponse.json(
        { error: `metric 은 export|import|balance 여야 합니다.`, metric },
        { status: 400 }
      );
    }
    if (!isValidYearMonth(from) || !isValidYearMonth(to)) {
      return NextResponse.json(
        { error: "from/to 는 'YYYY-MM' 형식이어야 합니다.", from, to },
        { status: 400 }
      );
    }
    if (from > to) {
      return NextResponse.json(
        { error: "from 이 to 보다 클 수 없습니다.", from, to },
        { status: 400 }
      );
    }

    const data = await getExportSeries(item, from, to, metric);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("[/api/exports/monthly]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
