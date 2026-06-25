/**
 * ETF 누적수익률 재계산 (collector 연동 — INDEX_CAGR 항목 전용)
 *
 * 대상: EtfReturn.updateMethod === "INDEX_CAGR" (KOSPI200/SP500/NASDAQ100 등).
 *   EtfReturn.indexType 이 가리키는 IndicatorRecord(type) 의 일별 히스토리로
 *   누적수익률(cumulativeReturn)·기간(returnYears)을 산출해 갱신한다.
 * MANUAL 항목(국채3년/미국30년국채H/TDF2030/혼합국채)은 대응 지수 미수집 → 절대 건드리지 않는다.
 *
 * ⚠️ 안전장치:
 *   - 기본 DRY-RUN. 실제 반영은 `--apply` 필요.
 *   - 인덱스 히스토리 기간이 MIN_YEARS 미만이면 "데이터 부족"으로 스킵(기존 시드값 보존).
 *   - 환율(KRW/USD) 반영은 미구현. 해외지수(SP500/NASDAQ100)는 KRW 환산 차이가 있으므로
 *     --apply 시에도 해외지수는 별도 플래그(--include-fx-naive) 없이는 스킵. TODO 참고.
 *
 * 사전 준비(히스토리 백필):
 *   야간 cron(collectRealtimeData)은 당일 1포인트만 적재하므로, CAGR 산출에 필요한 3년치
 *   히스토리는 아래 백필 스크립트로 먼저 채워야 한다. KOSPI200 은 전용 지수(type="KOSPI200",
 *   yahoo="^KS200")로 수집된다.
 *     npx tsx scripts/backfill-index-history.ts            # KOSPI200 백필
 *     npx tsx scripts/backfill-index-history.ts --type=KOSPI200,SP500
 *
 * 실행:
 *   node scripts/recalc-etf-returns.mjs            # dry-run, 산출치만 출력
 *   node scripts/recalc-etf-returns.mjs --apply    # 충분한 히스토리가 있는 국내지수만 반영
 *
 * TODO (collector 연동 확장):
 *   1) 해외지수 KRW 환산: SP500/NASDAQ100 × (KRW_USD_end / KRW_USD_start) 로 원화 누적수익률 산출.
 *   2) returnPeriod 문자열도 산출 기간에 맞춰 자동 갱신("N년").
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const INCLUDE_FX_NAIVE = process.argv.includes("--include-fx-naive");
const MIN_YEARS = 2; // 이보다 짧은 히스토리는 CAGR 신뢰 불가 → 스킵
const FX_INDEX_TYPES = new Set(["SP500", "NASDAQ100"]); // KRW 환산 필요한 해외지수

async function main() {
  console.log(`ETF 수익률 재계산 (${APPLY ? "APPLY" : "DRY-RUN"})\n`);

  const targets = await prisma.etfReturn.findMany({
    where: { updateMethod: "INDEX_CAGR" },
    orderBy: { key: "asc" },
  });
  if (targets.length === 0) {
    console.log("INDEX_CAGR 대상이 없습니다.");
    return;
  }

  let applied = 0;
  for (const t of targets) {
    if (!t.indexType) {
      console.log(`  - ${t.key}: indexType 없음 → 스킵`);
      continue;
    }
    const rows = await prisma.indicatorRecord.findMany({
      where: { type: t.indexType },
      orderBy: { recordedAt: "asc" },
    });
    if (rows.length < 2) {
      console.log(`  - ${t.key}: 지수(${t.indexType}) 히스토리 없음(${rows.length}) → 스킵 (시드값 ${t.cumulativeReturn}% 유지)`);
      continue;
    }
    const first = rows[0];
    const last = rows[rows.length - 1];
    const years = (last.recordedAt.getTime() - first.recordedAt.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    const cum = (last.value / first.value - 1) * 100;
    const cagr = (Math.pow(last.value / first.value, 1 / Math.max(years, 1e-9)) - 1) * 100;

    const tooShort = years < MIN_YEARS;
    const needsFx = FX_INDEX_TYPES.has(t.indexType) && !INCLUDE_FX_NAIVE;
    const skipReason = tooShort
      ? `히스토리 ${years.toFixed(2)}y < ${MIN_YEARS}y`
      : needsFx
        ? "해외지수 KRW 환산 미구현(--include-fx-naive로 강제 가능)"
        : null;

    console.log(
      `  - ${t.key} [${t.indexType}] ${years.toFixed(2)}y: 산출 cum=${cum.toFixed(1)}% CAGR=${cagr.toFixed(1)}% ` +
      `(현재 시드 cum=${t.cumulativeReturn}% / ${t.returnYears}y)` +
      (skipReason ? `  → 스킵: ${skipReason}` : "")
    );

    if (APPLY && !skipReason) {
      await prisma.etfReturn.update({
        where: { key: t.key },
        data: {
          cumulativeReturn: parseFloat(cum.toFixed(1)),
          returnYears: parseFloat(years.toFixed(2)),
          returnPeriod: `${Math.round(years)}년 (지수 산출)`,
          source: `${t.indexType} 지수 ${first.recordedAt.toISOString().slice(0, 10)}~${last.recordedAt.toISOString().slice(0, 10)} 자동 산출`,
          asOf: last.recordedAt,
          // updateMethod / indexType 유지
        },
      });
      applied++;
      console.log(`      ✓ 반영`);
    }
  }

  console.log(`\n완료. ${APPLY ? `${applied}건 반영` : "DRY-RUN(반영 없음). --apply 로 실제 반영."}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
