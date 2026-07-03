/**
 * 지수 장기 히스토리 백필 (IndicatorRecord) — 수동 실행용.
 *
 * 목적:
 *   recalc-etf-returns.mjs 는 IndicatorRecord(type) 히스토리 전체 구간의 CAGR로 ETF 장기
 *   기대수익을 산출한다(규격: docs/portfolio-return-projection-review.md). 3년치만으로 산출한
 *   단기 강세장 CAGR(예: KOSPI200 ~56%)을 30년까지 복리 투영하면 비현실적으로 커진다.
 *   → 장기(20년+) 이력을 확보해 대표성 있는 CAGR을 산출하도록 백필한다.
 *
 * 동작(전체 재구축, 멱등):
 *   - 과거 구간: Yahoo 월봉(1mo)으로 LONG_YEARS(=22년) 확보 → 장기 CAGR backbone.
 *   - 최근 구간: Yahoo 일봉(1d)으로 최근 RECENT_YEARS(=3년) → 대시보드 지표(SP500·KRW_USD 등)
 *     의 최근 차트 정밀도 유지. (월봉만 쓰면 최근 1개월 차트가 뭉개짐)
 *   - 두 구간을 병합(월봉은 RECENT 시작 이전만, 그 이후는 일봉).
 *   - KRW_USD 는 이상치 필터(isPlausibleKrwUsd)로 글리치 제거 후 적재.
 *   - 해당 type 기존 IndicatorRecord 전부 삭제 후 재삽입.
 *
 * 대상 지정:
 *   - 인자 없으면 기본 KOSPI200 만 백필.
 *   - `--all` 이면 collector.REALTIME_SYMBOLS 전체.
 *   - `--type=KOSPI200,SP500` 처럼 콤마구분 type 지정 가능.
 *
 * 실행:
 *   npx tsx scripts/backfill-index-history.ts --type=KOSPI200,SP500,NASDAQ100,KRW_USD
 *   node scripts/recalc-etf-returns.mjs --apply   # 이후 CAGR 반영
 *
 * 주의: IndicatorRecord 외 다른 테이블은 절대 건드리지 않는다.
 */
import { PrismaClient } from "@prisma/client";
import { REALTIME_SYMBOLS, isPlausibleKrwUsd } from "../src/lib/collector";

const prisma = new PrismaClient();

// 장기 백필 파라미터 (규격 §9.1)
const LONG_YEARS = 22;   // 월봉 확보 구간(롤링 20년 창 + FX 매칭 버퍼 2년)
const RECENT_YEARS = 3;  // 일봉 유지 구간(대시보드 최근 차트 정밀도)

const YF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
  Referer: "https://finance.yahoo.com/",
};

const BATCH = 500; // createMany 청크 크기(라이브 Postgres). 파라미터 한도 내 안전.

interface HistoryPoint {
  date: Date;
  value: number;
}

// Yahoo chart API 조회 — interval 과 기간(period1~period2, Unix초)을 파라미터화.
async function fetchHistory(
  yahoo: string,
  dp: number,
  interval: "1d" | "1wk" | "1mo",
  period1: Date,
  period2: Date,
): Promise<HistoryPoint[]> {
  const encoded = encodeURIComponent(yahoo);
  const p1 = Math.floor(period1.getTime() / 1000);
  const p2 = Math.floor(period2.getTime() / 1000);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}` +
    `?interval=${interval}&period1=${p1}&period2=${p2}&includePrePost=false`;

  const res = await fetch(url, {
    headers: YF_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`Yahoo ${yahoo} HTTP ${res.status}`);
  }

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

  return timestamps
    .map((ts, i) => ({
      date: new Date(ts * 1000),
      value: closes[i] != null ? parseFloat((closes[i] as number).toFixed(dp)) : NaN,
    }))
    .filter((p) => !isNaN(p.value));
}

// KRW_USD 이상치 순차 필터 — 직전 유효값 대비 급변/범위 이탈 제거(collector 판정 재사용).
function filterFxOutliers(points: HistoryPoint[]): HistoryPoint[] {
  const out: HistoryPoint[] = [];
  let prev: number | null = null;
  for (const p of points) {
    if (!isPlausibleKrwUsd(p.value, prev)) continue;
    out.push(p);
    prev = p.value;
  }
  return out;
}

// 장기 월봉(과거) + 최근 일봉(최근 RECENT_YEARS) 병합 → 대표성 있는 장기 + 최근 정밀도 동시 확보.
async function buildMergedSeries(type: string, yahoo: string, dp: number): Promise<HistoryPoint[]> {
  const now = new Date();
  const longStart = new Date(now); longStart.setFullYear(now.getFullYear() - LONG_YEARS);
  const recentStart = new Date(now); recentStart.setFullYear(now.getFullYear() - RECENT_YEARS);

  const monthly = await fetchHistory(yahoo, dp, "1mo", longStart, now);
  const daily = await fetchHistory(yahoo, dp, "1d", recentStart, now);

  // 월봉은 최근 구간 이전만, 최근 구간은 일봉으로.
  let merged = [...monthly.filter((p) => p.date < recentStart), ...daily];
  merged.sort((a, b) => a.date.getTime() - b.date.getTime());
  if (type === "KRW_USD") merged = filterFxOutliers(merged);
  return merged;
}

function resolveTargets(): { type: string; yahoo: string; dp: number }[] {
  const argv = process.argv.slice(2);
  if (argv.includes("--all")) {
    return REALTIME_SYMBOLS.map((s) => ({ type: s.type, yahoo: s.yahoo, dp: s.dp }));
  }
  const typeArg = argv.find((a) => a.startsWith("--type="));
  const wanted = typeArg
    ? typeArg.slice("--type=".length).split(",").map((s) => s.trim()).filter(Boolean)
    : ["KOSPI200"]; // 기본값

  const targets = wanted.map((t) => {
    const sym = REALTIME_SYMBOLS.find((s) => s.type === t);
    if (!sym) throw new Error(`알 수 없는 type: ${t} (REALTIME_SYMBOLS 에 없음)`);
    return { type: sym.type, yahoo: sym.yahoo, dp: sym.dp };
  });
  return targets;
}

async function main() {
  const targets = resolveTargets();
  console.log(`지수 히스토리 백필 시작: ${targets.map((t) => t.type).join(", ")}\n`);

  for (const { type, yahoo, dp } of targets) {
    try {
      const points = await buildMergedSeries(type, yahoo, dp);
      if (points.length === 0) {
        console.log(`  - ${type} (${yahoo}): 데이터 없음 → 스킵`);
        continue;
      }

      // 기존 전체 삭제 후 재삽입(멱등). 라이브 Postgres → createMany 로 대량 삽입.
      await prisma.indicatorRecord.deleteMany({ where: { type } });

      let inserted = 0;
      for (let i = 0; i < points.length; i += BATCH) {
        const slice = points.slice(i, i + BATCH);
        const res = await prisma.indicatorRecord.createMany({
          data: slice.map((p) => ({ type, value: p.value, recordedAt: p.date })),
        });
        inserted += res.count;
      }

      const first = points[0];
      const last = points[points.length - 1];
      const spanY = (last.date.getTime() - first.date.getTime()) / (365.25 * 864e5);
      console.log(
        `  ✓ ${type.padEnd(10)} ${inserted} 포인트 · ${spanY.toFixed(1)}년 ` +
        `(${first.date.toISOString().slice(0, 10)} ~ ${last.date.toISOString().slice(0, 10)}, ` +
        `${first.value} → ${last.value})`
      );
    } catch (err) {
      console.error(`  ✗ ${type} 백필 실패:`, err);
    }
  }

  console.log("\n완료. 다음 단계: node scripts/recalc-etf-returns.mjs --apply");
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
