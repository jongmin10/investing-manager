/**
 * ETF 누적수익률 재계산 (collector 연동 — INDEX_CAGR 항목 전용)
 *
 * 대상: EtfReturn.updateMethod === "INDEX_CAGR" (KOSPI200/SP500/NASDAQ100 등).
 *   EtfReturn.indexType 이 가리키는 IndicatorRecord(type) 의 일별 히스토리로
 *   누적수익률(cumulativeReturn)·기간(returnYears)을 산출해 갱신한다.
 * MANUAL 항목(국채3년/미국30년국채H/TDF2030/혼합국채)은 대응 지수 미수집 → 절대 건드리지 않는다.
 *
 * ── 해외지수 KRW 환산 (SP500/NASDAQ100) ──────────────────────────────
 *   원화 투자자가 보유하는 해외지수 ETF의 원화 기준 수익률은
 *   "지수 자체 수익률 × 환율(KRW/USD) 변화" 로 결정된다.
 *     원화 누적수익률 = (지수_last/지수_first) × (환율_last/환율_first) − 1
 *   KRW_USD 지표는 yahoo "KRW=X"(= 1달러당 원화)라서, 이 값이 오르면(원화 약세)
 *   해외자산의 원화 환산 수익이 커진다. (데이터로 방향 검증 완료: 2023-06 1302.7 → 2026-06 1535.3, 원화 약세)
 *   지수(미국장)와 환율의 마감일이 하루씩 어긋날 수 있으므로, 지수 first/last 각 기준일에
 *   가장 가까운 환율 레코드를 ±FX_MATCH_DAYS 영업일 이내로 매칭한다(시점 정합).
 *   매칭 실패(환율 히스토리 부족 등) 시 "naive USD 오기재" 방지를 위해 스킵한다.
 *
 * ⚠️ 안전장치:
 *   - 기본 DRY-RUN. 실제 반영은 `--apply` 필요.
 *   - 인덱스 히스토리 기간이 MIN_YEARS 미만이면 "데이터 부족"으로 스킵(기존 시드값 보존).
 *   - 해외지수는 환율 페어 매칭이 성립할 때만 반영. 매칭 실패 시 스킵(시드값 보존).
 *
 * 사전 준비(히스토리 백필):
 *   야간 cron(collectRealtimeData)은 당일 1포인트만 적재하므로, CAGR 산출에 필요한 3년치
 *   히스토리는 아래 백필 스크립트로 먼저 채워야 한다. KOSPI200 은 전용 지수(type="KOSPI200",
 *   yahoo="^KS200")로 수집된다. 해외지수 환산에는 KRW_USD 히스토리도 필요하다.
 *     npx tsx scripts/backfill-index-history.ts                              # KOSPI200 백필
 *     npx tsx scripts/backfill-index-history.ts --type=KOSPI200,SP500,NASDAQ100,KRW_USD
 *
 * 실행:
 *   node scripts/recalc-etf-returns.mjs            # dry-run, 산출치만 출력
 *   node scripts/recalc-etf-returns.mjs --apply    # 충분한 히스토리가 있는 지수(국내+해외환산) 반영
 *
 * TODO (collector 연동 확장):
 *   - returnPeriod 문자열도 산출 기간에 맞춰 자동 갱신("N년") — 현재 적용됨.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const MIN_YEARS = 2; // 이보다 짧은 히스토리는 CAGR 신뢰 불가 → 스킵
// 규격(docs/portfolio-return-projection-review.md §9): 전체 span이 아니라 "롤링 20년 창"으로 산출.
// 단기 강세장 CAGR을 장기 투영하지 않도록, 최신 기준일에서 20년 전 지점을 base로 사용한다.
const LOOKBACK_YEARS = 20;
const LOW_CONFIDENCE_YEARS = 10; // 이보다 짧으면 저신뢰(경고 표기, 반영은 함)
const FX_MATCH_DAYS = 20; // 지수 기준일 대비 환율 매칭 허용 범위(월봉 경계·휴장일 보정 위해 확대)

// KRW 환산이 필요한 해외지수 → 적용할 환율 지표 type 매핑.
// 값은 "1 USD = N KRW"(yahoo KRW=X)라서 상승 시 원화 약세 → 해외수익 증가.
const FX_INDEX_TO_RATE = {
  SP500: "KRW_USD",
  NASDAQ100: "KRW_USD",
};

const DAY_MS = 1000 * 60 * 60 * 24;

/** target 날짜에 가장 가까운 환율 레코드를 maxDays 이내에서 찾는다(없으면 null). */
function nearestByDate(rows, target, maxDays) {
  let best = null;
  let bestDiff = Infinity;
  const t = target.getTime();
  for (const r of rows) {
    const diff = Math.abs(r.recordedAt.getTime() - t);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  return best && bestDiff <= maxDays * DAY_MS ? best : null;
}

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
    const last = rows[rows.length - 1];
    // 롤링 20년 창: 최신 기준일에서 LOOKBACK_YEARS 전 지점(cutoff) 이상에서 가장 이른 포인트를 base로.
    // 히스토리가 20년 미만이면 가장 이른 포인트(rows[0])가 자동 선택됨.
    const cutoff = last.recordedAt.getTime() - LOOKBACK_YEARS * 365.25 * DAY_MS;
    const first = rows.find((r) => r.recordedAt.getTime() >= cutoff) ?? rows[0];
    const years = (last.recordedAt.getTime() - first.recordedAt.getTime()) / (DAY_MS * 365.25);
    const indexMult = last.value / first.value; // 지수 자체(통화 그대로) 수익 배수

    // ── 환율 환산 (해외지수) ────────────────────────────────
    const rateType = FX_INDEX_TO_RATE[t.indexType];
    let fxMult = 1; // 국내지수는 1(환산 없음)
    let fxInfo = "";
    let fxFailed = false;
    if (rateType) {
      const fxRows = await prisma.indicatorRecord.findMany({
        where: { type: rateType },
        orderBy: { recordedAt: "asc" },
      });
      // 지수 first/last 각 기준일에 가장 가까운 환율을 매칭(시점 정합).
      const fxFirst = nearestByDate(fxRows, first.recordedAt, FX_MATCH_DAYS);
      const fxLast = nearestByDate(fxRows, last.recordedAt, FX_MATCH_DAYS);
      if (!fxFirst || !fxLast) {
        fxFailed = true;
      } else {
        fxMult = fxLast.value / fxFirst.value;
        fxInfo =
          ` × 환율(${rateType}) ${fxFirst.recordedAt.toISOString().slice(0, 10)} ${fxFirst.value}` +
          ` → ${fxLast.recordedAt.toISOString().slice(0, 10)} ${fxLast.value} (×${fxMult.toFixed(4)})`;
      }
    }

    const totalMult = indexMult * fxMult; // 원화 기준 누적 배수
    const cum = (totalMult - 1) * 100;
    const cagr = (Math.pow(totalMult, 1 / Math.max(years, 1e-9)) - 1) * 100;
    const cumUsd = (indexMult - 1) * 100; // 참고: 통화 환산 전 지수 수익

    const tooShort = years < MIN_YEARS;
    const skipReason = tooShort
      ? `히스토리 ${years.toFixed(2)}y < ${MIN_YEARS}y`
      : fxFailed
        ? `환율(${rateType}) 페어 매칭 실패(±${FX_MATCH_DAYS}일) → 시드값 보존`
        : null;
    // 20년 미만이면 반영은 하되 저신뢰 경고(단기 강세장 왜곡 가능성).
    const lowConf = !skipReason && years < LOW_CONFIDENCE_YEARS;

    console.log(
      `  - ${t.key} [${t.indexType}] ${years.toFixed(2)}y: ` +
      (rateType ? `USD cum=${cumUsd.toFixed(1)}% → ` : "") +
      `원화 cum=${cum.toFixed(1)}% CAGR=${cagr.toFixed(1)}% ` +
      `(현재 시드 cum=${t.cumulativeReturn}% / ${t.returnYears}y)` +
      (fxInfo ? `\n      ${fxInfo}` : "") +
      (lowConf ? `\n      ⚠ 저신뢰: 창 ${years.toFixed(1)}y < ${LOW_CONFIDENCE_YEARS}y (장기 대표성 부족 가능)` : "") +
      (skipReason ? `\n      → 스킵: ${skipReason}` : "")
    );

    if (APPLY && !skipReason) {
      const sourceParts = [
        `${t.indexType} 지수 ${first.recordedAt.toISOString().slice(0, 10)}~${last.recordedAt.toISOString().slice(0, 10)}`,
      ];
      if (rateType) sourceParts.push(`${rateType} 환율 반영`);
      await prisma.etfReturn.update({
        where: { key: t.key },
        data: {
          cumulativeReturn: parseFloat(cum.toFixed(1)),
          returnYears: parseFloat(years.toFixed(2)),
          returnPeriod: `${Math.round(years)}년 (지수 산출)`,
          source: `${sourceParts.join(" + ")} 자동 산출`,
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
