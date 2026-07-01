import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { collectRealtimeData, collectDailyIndexPrices } from "@/lib/collector";
import { getBaseUrl, isAuthorizedCron, triggerNextSlice } from "@/lib/cron-self";
import { recordCollectionRun } from "@/lib/collection-run";

export const dynamic = "force-dynamic";
// 가벼운 오케스트레이터(지표+리포트+슬라이스 트리거)만 수행하므로 짧게 끝난다.
export const maxDuration = 60;

/**
 * 야간 일일 cron 오케스트레이터.
 *
 * 변경 배경(2026-06): 기존에는 이 핸들러가 전체 유니버스(200종목) 주가 루프와
 * 전 종목 DART 재무 루프를 한 번의 함수 실행에서 순차로 돌려 60초 타임아웃(504)에
 * 걸려 중단됐다(2026-06-22 이후 주가 수집 누락). 무거운 루프는 슬라이스 단위
 * self-chaining 엔드포인트로 분리하고, 이 핸들러는 가벼운 작업만 직접 수행한 뒤
 * 슬라이스 0 을 fire-and-forget 으로 트리거한다.
 *
 *  - 주가:   /api/cron/collect-stocks     (40종목/슬라이스, 5슬라이스로 200 커버)
 *  - 재무:   /api/cron/collect-financials (40종목/슬라이스)
 *  - 지표:   여기서 직접 (경량, ~10심볼)
 *  - 리포트: 여기서 직접 (LLM 1회, try/catch 격리)
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const results: Record<string, unknown> = {};
  const baseUrl = getBaseUrl(req);
  let indicatorsOk = 0;
  let indicatorsFailed = 0;

  // 1. 경제지표 수집 (Yahoo 실시간, 경량)
  try {
    const indicatorResult = await collectRealtimeData();
    indicatorsOk = indicatorResult.updated.length;
    indicatorsFailed = indicatorResult.failed.length;
    results.indicators = { updated: indicatorsOk, failed: indicatorsFailed };
    console.log(`[cron] 경제지표 업데이트: ${indicatorsOk}개`);
  } catch (err) {
    results.indicatorsError = String(err);
    console.error("[cron] 경제지표 수집 오류:", err);
  }

  // 1-b. 월수익률/MDD 원천 일봉 갱신 (DailyIndexPrice, 5대 지수 당일 1행 upsert — 경량)
  try {
    const daily = await collectDailyIndexPrices();
    results.dailyIndex = { updated: daily.updated.length, failed: daily.failed.length };
    console.log(`[cron] 지수 일봉 갱신: ${daily.updated.length}개`);
  } catch (err) {
    results.dailyIndexError = String(err);
    console.error("[cron] 지수 일봉 갱신 오류:", err);
  }

  // 1-c. 품목별 수출 월 확정 갱신 (관세청 GW). 매월 확정 창(KST 15~20일)에만 트리거.
  //     외부 API 다수 호출이라 오케스트레이터에서 직접 await 하지 않고 전용 슬라이스로 분리.
  try {
    const kstDay = new Date(Date.now() + 9 * 3600 * 1000).getUTCDate();
    if (kstDay >= 15 && kstDay <= 20) {
      await triggerNextSlice(baseUrl, "/api/cron/collect-exports", {});
      results.exports = { triggered: true };
      console.log(`[cron] 품목별 수출 확정 갱신 트리거 (KST ${kstDay}일)`);
    } else {
      results.exports = { skipped: `KST ${kstDay}일(확정창 15~20 아님)` };
    }
  } catch (err) {
    results.exportsError = String(err);
    console.error("[cron] 수출 갱신 트리거 오류:", err);
  }

  // 2. 주가 스냅샷 수집 — 유니버스 갱신 단계를 먼저 트리거.
  //    refresh-universe 가 유니버스 갱신(~36s) 후 collect-stocks offset 0(순수 수집)을
  //    트리거한다. 유니버스+수집을 한 invocation 에서 돌리면 60s 초과로 타임아웃나므로 분리.
  try {
    await triggerNextSlice(baseUrl, "/api/cron/refresh-universe", {});
    results.stocks = { triggered: true };
    console.log("[cron] 유니버스 갱신→주가 수집 체인 트리거");
  } catch (err) {
    results.stocksError = String(err);
    console.error("[cron] 주가 수집 트리거 오류:", err);
  }

  // 3. DART 재무 수집 — 슬라이스 0 트리거 (API 키 있을 때만)
  if (process.env.DART_API_KEY) {
    try {
      await triggerNextSlice(baseUrl, "/api/cron/collect-financials", { offset: 0 });
      results.financials = { triggered: true };
      console.log("[cron] 재무 슬라이스 수집 트리거 (offset 0)");
    } catch (err) {
      results.financialsError = String(err);
      console.error("[cron] 재무 수집 트리거 오류:", err);
    }
  }

  // 4. 시황 리포트 자동 생성 (LLM 1회, 격리)
  try {
    const { generateReport } = await import("@/lib/report-generator");
    const report = await generateReport(new Date(), { force: false });
    results.report = { status: report.status, date: report.date };
    console.log(`[cron] 시황 리포트: ${report.status}`);
  } catch (err) {
    results.reportError = String(err);
    console.error("[cron] 시황 리포트 오류:", err);
  }

  // 연결 살아있는지 가벼운 확인
  await prisma.$executeRaw`SELECT 1`.catch(() => {});

  // 계측(§5): 오케스트레이터가 "직접" 수행한 작업(경제지표 수집)을 1행으로 기록한다.
  // 다운스트림 슬라이스 잡(collect-stocks/collect-financials)은 각자 별도 1행을 남기므로
  // 여기서 중복 집계하지 않는다. 트리거/리포트 단계의 에러는 error 필드에 합쳐 관측성만 남긴다.
  const errParts = ["indicatorsError", "dailyIndexError", "exportsError", "reportError", "stocksError", "financialsError"]
    .map((k) => results[k])
    .filter((v): v is string => typeof v === "string");
  await recordCollectionRun("daily", startedAt, {
    itemsOk: indicatorsOk,
    itemsFailed: indicatorsFailed,
    error: errParts.length ? errParts.join("; ") : null,
  }).catch((e) => console.error("[cron:daily] 이력 기록 실패:", e));

  return NextResponse.json({ ok: true, runAt: new Date().toISOString(), results });
}
