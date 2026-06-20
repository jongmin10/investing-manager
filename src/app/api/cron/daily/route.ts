import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { collectAllStocks } from "@/lib/stock-collector";
import { collectRealtimeData } from "@/lib/collector";

// Vercel Cron 인증 헤더 검증
function isAuthorized(req: NextRequest) {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  try {
    // 1. 경제지표 수집 (Yahoo Finance 실시간)
    const indicatorResult = await collectRealtimeData();
    results.indicators = { updated: indicatorResult.updated.length, failed: indicatorResult.failed.length };
    console.log(`[cron] 경제지표 업데이트: ${indicatorResult.updated.length}개`);
  } catch (err) {
    results.indicatorsError = String(err);
    console.error("[cron] 경제지표 수집 오류:", err);
  }

  try {
    // 2. 주가 스냅샷 수집 (30개씩 배치)
    let totalUpdated = 0, offset = 0;
    while (true) {
      const stockResult = await collectAllStocks(undefined, { offset, limit: 30 });
      totalUpdated += stockResult.updated;
      const totalStocks = await prisma.stock.count();
      if (offset + 30 >= totalStocks) break;
      offset += 30;
    }
    results.stocks = { updated: totalUpdated };
    console.log(`[cron] 주가 수집: ${totalUpdated}개 업데이트`);
  } catch (err) {
    results.stocksError = String(err);
    console.error("[cron] 주가 수집 오류:", err);
  }

  try {
    // 3. DART 재무 수집 (API 키 있을 때만)
    if (process.env.DART_API_KEY) {
      const { collectAllFinancials } = await import("@/lib/dart-collector");
      const financialResult = await collectAllFinancials();
      results.financials = { updated: financialResult.updated, failed: financialResult.failed.length };
      console.log(`[cron] 재무 수집: ${financialResult.updated}개 업데이트`);
    }
  } catch (err) {
    results.financialsError = String(err);
    console.error("[cron] 재무 수집 오류:", err);
  }

  try {
    // 4. 시황 리포트 자동 생성
    const { generateReport } = await import("@/lib/report-generator");
    const report = await generateReport(new Date(), { force: false });
    results.report = { status: report.status, date: report.date };
    console.log(`[cron] 시황 리포트: ${report.status}`);
  } catch (err) {
    results.reportError = String(err);
    console.error("[cron] 시황 리포트 오류:", err);
  }

  // 마지막 실행 시각 기록
  await prisma.$executeRaw`SELECT 1`.catch(() => {});

  return NextResponse.json({
    ok: true,
    runAt: new Date().toISOString(),
    results,
  });
}
