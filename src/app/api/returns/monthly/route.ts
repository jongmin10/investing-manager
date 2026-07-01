import { NextRequest, NextResponse } from "next/server";
import {
  getMonthlyReturns,
  isMonthlySeries,
  isValidYearMonth,
  currentYearMonth,
  DEFAULT_FROM,
  MONTHLY_SERIES,
} from "@/lib/monthly-returns";

// GET /api/returns/monthly?series=KOSPI&from=2000-01&to=2026-06
// - series (필수): KOSPI|KOSDAQ|DOW|SP500|NASDAQ
// - from,to (선택): "YYYY-MM". 기본 from=2000-01, to=현재월
// 쿼리스트링 방식이라 Next.js 16 동적 params(Promise) 이슈 없음.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const series = sp.get("series");
    const from = sp.get("from") ?? DEFAULT_FROM;
    const to = sp.get("to") ?? currentYearMonth();

    if (!series) {
      return NextResponse.json(
        { error: "series 파라미터는 필수입니다.", supported: MONTHLY_SERIES },
        { status: 400 }
      );
    }
    if (!isMonthlySeries(series)) {
      return NextResponse.json(
        { error: `지원하지 않는 series: ${series}`, supported: MONTHLY_SERIES },
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

    const data = await getMonthlyReturns(series, from, to);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("[/api/returns/monthly]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
